// ─── Git Smart HTTP helpers ──────────────────────────────────────────────────

export const encoder = new TextEncoder();
export const decoder = new TextDecoder();

export function pktLine(data: string): Uint8Array {
  const payload = encoder.encode(data);
  const len = (payload.length + 4).toString(16).padStart(4, "0");
  const line = new Uint8Array(payload.length + 4);
  line.set(encoder.encode(len), 0);
  line.set(payload, 4);
  return line;
}

export function pktFlush(): Uint8Array {
  return encoder.encode("0000");
}

export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  let len = 0;
  for (const a of arrays) len += a.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const a of arrays) {
    out.set(a, off);
    off += a.length;
  }
  return out;
}

export function parsePktLines(data: Uint8Array): string[] {
  const lines: string[] = [];
  let offset = 0;
  const text = decoder.decode(data);
  while (offset < text.length) {
    const hexLen = text.slice(offset, offset + 4);
    if (hexLen === "0000") {
      offset += 4;
      lines.push("flush");
      continue;
    }
    const len = parseInt(hexLen, 16);
    if (isNaN(len) || len < 4) break;
    const payload = text.slice(offset + 4, offset + len);
    lines.push(payload.replace(/\n$/, ""));
    offset += len;
  }
  return lines;
}

// ─── Packfile generation ────────────────────────────────────────────────────

export async function deflate(data: Uint8Array): Promise<Uint8Array> {
  const cs = new CompressionStream("deflate");
  const writer = cs.writable.getWriter();
  writer.write(data);
  writer.close();
  const reader = cs.readable.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return concatBytes(...chunks);
}

function encodePackEntryHeader(type: number, size: number): Uint8Array {
  // type: 1=commit, 2=tree, 3=blob, 4=tag
  const bytes: number[] = [];
  let byte = (type << 4) | (size & 0x0f);
  size >>= 4;
  while (size > 0) {
    bytes.push(byte | 0x80);
    byte = size & 0x7f;
    size >>= 7;
  }
  bytes.push(byte);
  return new Uint8Array(bytes);
}

const OBJ_TYPE_MAP: Record<string, number> = {
  commit: 1,
  tree: 2,
  blob: 3,
  tag: 4,
};

export async function sha1Bytes(data: Uint8Array): Promise<Uint8Array> {
  const hash = await crypto.subtle.digest("SHA-1", data);
  return new Uint8Array(hash);
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function buildPackfile(
  objects: { hash: string; type: string; content: Uint8Array }[]
): Promise<Uint8Array> {
  // PACK header: "PACK" + version(4 bytes) + count(4 bytes)
  const header = new Uint8Array(12);
  header.set(encoder.encode("PACK"), 0);
  // version 2
  header[4] = 0; header[5] = 0; header[6] = 0; header[7] = 2;
  // object count
  const count = objects.length;
  header[8] = (count >> 24) & 0xff;
  header[9] = (count >> 16) & 0xff;
  header[10] = (count >> 8) & 0xff;
  header[11] = count & 0xff;

  const parts: Uint8Array[] = [header];

  for (const obj of objects) {
    const typeNum = OBJ_TYPE_MAP[obj.type] ?? 3;
    const entryHeader = encodePackEntryHeader(typeNum, obj.content.length);
    const compressed = await deflate(obj.content);
    parts.push(entryHeader, compressed);
  }

  const packWithoutChecksum = concatBytes(...parts);
  const checksum = await sha1Bytes(packWithoutChecksum);
  return concatBytes(packWithoutChecksum, checksum);
}

// side-band-64k: band 1 = packfile data, band 2 = progress, band 3 = error
export function sideBandPacket(band: number, data: Uint8Array): Uint8Array {
  const len = data.length + 5; // 4 hex + 1 band byte + data
  const hex = len.toString(16).padStart(4, "0");
  const pkt = new Uint8Array(len);
  pkt.set(encoder.encode(hex), 0);
  pkt[4] = band;
  pkt.set(data, 5);
  return pkt;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
