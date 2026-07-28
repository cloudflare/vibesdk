const imageContentTypes = new Map<string, string>([
  ["apng", "image/apng"],
  ["avif", "image/avif"],
  ["bmp", "image/bmp"],
  ["gif", "image/gif"],
  ["ico", "image/x-icon"],
  ["jfif", "image/jpeg"],
  ["jpeg", "image/jpeg"],
  ["jpg", "image/jpeg"],
  ["png", "image/png"],
  ["svg", "image/svg+xml"],
  ["webp", "image/webp"],
]);

const nulScanBytes = 8 * 1024;

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) {
    return "";
  }
  return name.slice(dot + 1).toLowerCase();
}

/**
 * The blob endpoint always answers `application/octet-stream`, so the file name
 * is the only image signal available — and it is available before the body is
 * fetched, which is what lets images skip the download entirely.
 */
export function imageContentTypeFor(name: string): string | null {
  return imageContentTypes.get(fileExtension(name)) ?? null;
}

/**
 * A strict UTF-8 decode is a better binary test than an extension allowlist:
 * anything that is not valid UTF-8, or that carries a NUL, is not text.
 */
export function decodeTextBytes(bytes: Uint8Array): string | null {
  const limit = Math.min(bytes.length, nulScanBytes);
  for (let index = 0; index < limit; index += 1) {
    if (bytes[index] === 0) {
      return null;
    }
  }

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

export type CappedBody =
  | { readonly kind: "complete"; readonly bytes: Uint8Array }
  | { readonly kind: "oversized" };

/**
 * Reads at most `limit` bytes. A declared over-limit length skips the download
 * outright; otherwise the reader is cancelled the moment the limit is crossed,
 * so an unbounded blob never lands in memory.
 */
export async function readCappedBody(response: Response, limit: number): Promise<CappedBody> {
  const declared = Number(response.headers.get("Content-Length"));
  const body = response.body;

  if (Number.isFinite(declared) && declared > limit) {
    await body?.cancel();
    return { kind: "oversized" };
  }

  if (body === null) {
    return { kind: "complete", bytes: new Uint8Array(0) };
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      chunks.push(value);
      total += value.length;

      if (total > limit) {
        await reader.cancel();
        return { kind: "oversized" };
      }
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { kind: "complete", bytes };
}
