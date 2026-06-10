import git from "isomorphic-git"
import type { FileSystem } from "@cloudflare/shell"

// isomorphic-git's FsClient type is overly strict (requires callback-style unlink/rmdir).
// Shell's WorkspaceFileSystem works with isomorphic-git in practice (shell's own createGit
// uses the same pattern). We cast to `any` where passing fs to raw isomorphic-git calls.
type GitFs = any
import {
  encoder,
  decoder,
  pktLine,
  pktFlush,
  concatBytes,
  parsePktLines,
  buildPackfile,
  sideBandPacket,
  bytesToHex,
  sha1Bytes,
} from "./git-pack"

// ─── Context for git smart HTTP handlers ────────────────────────────────────

export interface GitHttpContext {
  fs: FileSystem
  sql: SqlStorage
}

// ─── Git Smart HTTP Handlers ─────────────────────────────────────────────────

export async function handleInfoRefs(
  ctx: GitHttpContext,
  service: string
): Promise<Response> {
  try {
    const refs = getAllRefs(ctx);
    const parts: Uint8Array[] = [];

    // Service announcement line
    parts.push(pktLine(`# service=${service}\n`));
    parts.push(pktFlush());

    const capabilities = [
      "report-status",
      "delete-refs",
      "ofs-delta",
      "side-band-64k",
    ].join(" ");

    if (refs.length === 0) {
      // Empty repo — advertise zero-id with capabilities
      const zeroId = "0".repeat(40);
      parts.push(pktLine(`${zeroId} capabilities^{}\0${capabilities}\n`));
    } else {
      let first = true;
      for (const ref of refs) {
        if (first) {
          parts.push(pktLine(`${ref.hash} ${ref.name}\0${capabilities}\n`));
          first = false;
        } else {
          parts.push(pktLine(`${ref.hash} ${ref.name}\n`));
        }
      }
    }
    parts.push(pktFlush());

    return new Response(concatBytes(...parts), {
      status: 200,
      headers: {
        "Content-Type": `application/x-${service}-advertisement`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (e: any) {
    return new Response(`Error: ${e.message}\n`, { status: 500 });
  }
}

export async function handleUploadPack(
  ctx: GitHttpContext,
  request: Request
): Promise<Response> {
  try {
    const body = new Uint8Array(await request.arrayBuffer());
    const lines = parsePktLines(body);

    const wants: string[] = [];
    const haves: string[] = [];

    for (const line of lines) {
      if (line === "flush") continue;
      if (line.startsWith("want ")) {
        wants.push(line.split(" ")[1]);
      } else if (line.startsWith("have ")) {
        haves.push(line.split(" ")[1]);
      }
    }

    if (wants.length === 0) {
      return new Response(
        concatBytes(pktLine("NAK\n"), pktFlush()),
        { status: 200, headers: { "Content-Type": "application/x-git-upload-pack-result" } }
      );
    }

    // Collect all objects reachable from wanted refs, excluding haves
    const haveSet = new Set(haves);
    const neededOids = await walkObjects(ctx, wants, haveSet);

    // Read objects via isomorphic-git (handles both loose + packed)
    const objects: { hash: string; type: string; content: Uint8Array }[] = [];
    for (const oid of neededOids) {
      try {
        const { type, object } = await git.readObject({
          fs: ctx.fs as GitFs,
          dir: "/",
          oid,
          format: "content",
        });
        objects.push({ hash: oid, type, content: object as Uint8Array });
      } catch {
        // Skip objects we can't read
      }
    }

    const packfile = await buildPackfile(objects);

    // Build response: NAK + side-band packfile + flush
    const responseParts: Uint8Array[] = [];
    responseParts.push(pktLine("NAK\n"));

    // Send packfile in side-band-64k chunks (max 65519 bytes per packet)
    const CHUNK_SIZE = 65515;
    for (let i = 0; i < packfile.length; i += CHUNK_SIZE) {
      const chunk = packfile.slice(i, Math.min(i + CHUNK_SIZE, packfile.length));
      responseParts.push(sideBandPacket(1, chunk));
    }

    // Send progress message on band 2
    const progressMsg = encoder.encode("Done\n");
    responseParts.push(sideBandPacket(2, progressMsg));

    responseParts.push(pktFlush());

    return new Response(concatBytes(...responseParts), {
      status: 200,
      headers: {
        "Content-Type": "application/x-git-upload-pack-result",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e: any) {
    return new Response(`Error: ${e.message}\n`, { status: 500 });
  }
}

export async function handleReceivePack(
  ctx: GitHttpContext,
  request: Request
): Promise<Response> {
  try {
    const body = new Uint8Array(await request.arrayBuffer());

    // Parse command lines (ref updates) from raw bytes until flush
    // Must NOT decode the whole body as text — the packfile portion is binary
    const commands: { oldOid: string; newOid: string; refName: string }[] = [];
    let offset = 0;

    while (offset + 4 <= body.length) {
      const hexLen = decoder.decode(body.slice(offset, offset + 4));
      if (hexLen === "0000") {
        offset += 4;
        break;
      }
      const len = parseInt(hexLen, 16);
      if (isNaN(len) || len < 4) break;
      // Decode only this pkt-line's payload (ASCII text, safe to decode)
      let payload = decoder.decode(body.slice(offset + 4, offset + len)).replace(/\n$/, "");
      // First line may have capabilities after \0
      const nullIdx = payload.indexOf("\0");
      if (nullIdx !== -1) {
        payload = payload.slice(0, nullIdx);
      }
      const parts = payload.split(" ");
      if (parts.length >= 3) {
        commands.push({
          oldOid: parts[0],
          newOid: parts[1],
          refName: parts.slice(2).join(" "),
        });
      }
      offset += len;
    }

    // Remaining bytes are the packfile — write it to FS and let isomorphic-git index it
    if (offset < body.length) {
      const packData = body.slice(offset);
      if (packData.length > 0 && decoder.decode(packData.slice(0, 4)) === "PACK") {
        // Compute pack hash for naming
        const packHash = bytesToHex(await sha1Bytes(packData));
        const packPath = `.git/objects/pack/pack-${packHash}.pack`;

        // Write packfile to FS
        await ctx.fs.writeFileBytes(packPath, packData);

        // Index the pack (creates .idx alongside .pack)
        await git.indexPack({
          fs: ctx.fs as GitFs,
          dir: "/",
          filepath: packPath,
        });
      }
    }

    // Apply ref updates
    const zeroOid = "0".repeat(40);
    for (const cmd of commands) {
      if (cmd.newOid === zeroOid) {
        // Delete ref
        ctx.sql.exec("DELETE FROM refs WHERE name = ?", cmd.refName);
      } else {
        // Create/update ref
        ctx.sql.exec(
          "INSERT OR REPLACE INTO refs (name, hash) VALUES (?, ?)",
          cmd.refName,
          cmd.newOid
        );
      }
    }

    // Update HEAD if needed (point to the pushed branch)
    if (commands.length > 0) {
      const mainCmd = commands.find(
        (c) => c.refName === "refs/heads/main" || c.refName === "refs/heads/master"
      );
      if (mainCmd) {
        await ctx.fs.writeFile(
          ".git/HEAD",
          `ref: ${mainCmd.refName}\n`
        );
      }
    }

    // Update the working tree from the latest pushed commit
    if (commands.length > 0) {
      const latestCmd = commands.find((c) => c.newOid !== zeroOid);
      if (latestCmd) {
        try {
          await updateWorkingTreeFromCommit(ctx, latestCmd.newOid);
        } catch {
          // Non-fatal: working tree update can fail if objects are only in pack
        }
      }
    }

    // Build report-status response
    const reportParts: Uint8Array[] = [];
    reportParts.push(sideBandPacket(1, pktLine("unpack ok\n")));
    for (const cmd of commands) {
      reportParts.push(sideBandPacket(1, pktLine(`ok ${cmd.refName}\n`)));
    }
    reportParts.push(sideBandPacket(1, pktFlush()));
    reportParts.push(pktFlush());

    return new Response(concatBytes(...reportParts), {
      status: 200,
      headers: {
        "Content-Type": "application/x-git-receive-pack-result",
        "Cache-Control": "no-cache",
      },
    });
  } catch (e: any) {
    return new Response(`Error: ${e.message}\n`, { status: 500 });
  }
}

export async function handleHead(ctx: GitHttpContext): Promise<Response> {
  try {
    const head = await ctx.fs.readFile(".git/HEAD");
    return new Response(head, { headers: { "Content-Type": "text/plain" } });
  } catch {
    return new Response("ref: refs/heads/main\n", { headers: { "Content-Type": "text/plain" } });
  }
}

// ─── Private Helpers ─────────────────────────────────────────────────────────

function getAllRefs(ctx: GitHttpContext): { name: string; hash: string }[] {
  const refs: { name: string; hash: string }[] = [];

  // Get HEAD
  try {
    const headRow = ctx.sql
      .exec("SELECT content FROM git_internal WHERE path = '.git/HEAD'")
      .toArray();
    if (headRow.length > 0) {
      const headContent = new TextDecoder()
        .decode(headRow[0].content as ArrayBuffer)
        .trim();
      if (headContent.startsWith("ref: ")) {
        const symref = headContent.slice(5);
        // Resolve the symbolic ref
        const refRow = ctx.sql
          .exec("SELECT hash FROM refs WHERE name = ?", symref)
          .toArray();
        if (refRow.length > 0) {
          refs.push({ name: "HEAD", hash: refRow[0].hash as string });
        }
      } else {
        refs.push({ name: "HEAD", hash: headContent });
      }
    }
  } catch {
    // No HEAD yet
  }

  // Get all refs
  const refRows = ctx.sql.exec("SELECT name, hash FROM refs").toArray();
  for (const row of refRows) {
    refs.push({ name: row.name as string, hash: row.hash as string });
  }

  return refs;
}

async function walkObjects(
  ctx: GitHttpContext,
  wantOids: string[],
  haveOids: Set<string>
): Promise<string[]> {
  const visited = new Set<string>();
  const queue = [...wantOids];

  while (queue.length > 0) {
    const oid = queue.pop()!;
    if (visited.has(oid) || haveOids.has(oid)) continue;
    visited.add(oid);

    let objType: string;
    let content: Uint8Array;
    try {
      const result = await git.readObject({
        fs: ctx.fs as GitFs,
        dir: "/",
        oid,
        format: "content",
      });
      objType = result.type;
      content = result.object as Uint8Array;
    } catch {
      continue;
    }

    if (objType === "commit") {
      const commitText = decoder.decode(content);
      const lines = commitText.split("\n");
      for (const line of lines) {
        if (line.startsWith("tree ")) {
          queue.push(line.slice(5).trim());
        } else if (line.startsWith("parent ")) {
          queue.push(line.slice(7).trim());
        } else if (line === "") {
          break;
        }
      }
    } else if (objType === "tree") {
      // Parse tree entries: "<mode> <name>\0<20-byte-sha>"
      let pos = 0;
      while (pos < content.length) {
        let spaceIdx = pos;
        while (spaceIdx < content.length && content[spaceIdx] !== 0x20) spaceIdx++;
        let nullIdx = spaceIdx + 1;
        while (nullIdx < content.length && content[nullIdx] !== 0) nullIdx++;
        if (nullIdx + 21 <= content.length) {
          const sha = bytesToHex(content.slice(nullIdx + 1, nullIdx + 21));
          queue.push(sha);
          pos = nullIdx + 21;
        } else {
          break;
        }
      }
    } else if (objType === "tag") {
      const tagText = decoder.decode(content);
      const lines = tagText.split("\n");
      for (const line of lines) {
        if (line.startsWith("object ")) {
          queue.push(line.slice(7).trim());
        }
      }
    }
  }

  return [...visited];
}

async function updateWorkingTreeFromCommit(
  ctx: GitHttpContext,
  commitOid: string
): Promise<void> {
  // Read commit via isomorphic-git to get tree oid
  const { object: content } = await git.readObject({
    fs: ctx.fs as GitFs, dir: "/", oid: commitOid, format: "content",
  });
  const commitText = decoder.decode(content as Uint8Array);
  const lines = commitText.split("\n");
  let treeOid = "";
  for (const line of lines) {
    if (line.startsWith("tree ")) {
      treeOid = line.slice(5).trim();
      break;
    }
  }
  if (!treeOid) return;

  // Clear working tree and rebuild from tree
  // Note: we use SQL directly here because this updates the workspace's
  // underlying storage from a git push — the Workspace class manages
  // the workspace_files table, but for receive-pack we need low-level access.
  // The refs table is managed separately for git smart HTTP.
  await extractTreeToFs(ctx, treeOid, "");
}

async function extractTreeToFs(
  ctx: GitHttpContext,
  treeOid: string,
  prefix: string
): Promise<void> {
  const { object: content } = await git.readObject({
    fs: ctx.fs as GitFs, dir: "/", oid: treeOid, format: "content",
  });
  const treeData = content as Uint8Array;

  let pos = 0;
  while (pos < treeData.length) {
    // Parse mode
    let spaceIdx = pos;
    while (spaceIdx < treeData.length && treeData[spaceIdx] !== 0x20) spaceIdx++;
    const mode = decoder.decode(treeData.slice(pos, spaceIdx));

    // Parse name
    let nullIdx = spaceIdx + 1;
    while (nullIdx < treeData.length && treeData[nullIdx] !== 0) nullIdx++;
    const name = decoder.decode(treeData.slice(spaceIdx + 1, nullIdx));

    // 20-byte SHA
    if (nullIdx + 21 > treeData.length) break;
    const sha = bytesToHex(treeData.slice(nullIdx + 1, nullIdx + 21));
    pos = nullIdx + 21;

    const fullPath = prefix ? `${prefix}/${name}` : name;

    if (mode === "40000") {
      await extractTreeToFs(ctx, sha, fullPath);
    } else {
      try {
        const { object: blobContent } = await git.readObject({
          fs: ctx.fs as GitFs, dir: "/", oid: sha, format: "content",
        });
        // Write to the workspace filesystem (which is backed by shell's Workspace)
        await ctx.fs.writeFileBytes(`/${fullPath}`, blobContent as Uint8Array);
      } catch {
        // Skip unreadable blobs
      }
    }
  }
}
