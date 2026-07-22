/**
 * FileInfo adapter for the plain `FileSystem` interface.
 *
 * The SpaceDO overlay used to be a `Workspace`, whose listing methods returned
 * rich `FileInfo` records (mimeType, updatedAt, size). The in-memory overlay
 * only implements the minimal `FileSystem` contract (`glob` -> string[], `stat`
 * -> `FsStat`), so these helpers rebuild `FileInfo` from a path + `FsStat`:
 * MIME is inferred from the extension and timestamps come from `mtime`.
 */
import type { FileSystem, FileInfo, FsStat } from "@cloudflare/shell"

const MIME_BY_EXT: Record<string, string> = {
  html: "text/html",
  htm: "text/html",
  css: "text/css",
  js: "text/javascript",
  mjs: "text/javascript",
  cjs: "text/javascript",
  jsx: "text/javascript",
  ts: "text/typescript",
  tsx: "text/typescript",
  json: "application/json",
  jsonc: "application/json",
  map: "application/json",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  xml: "application/xml",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  ico: "image/x-icon",
  bmp: "image/bmp",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
  eot: "application/vnd.ms-fontobject",
  wasm: "application/wasm",
  pdf: "application/pdf",
  zip: "application/zip",
  webmanifest: "application/manifest+json",
  mp3: "audio/mpeg",
  mp4: "video/mp4",
  webm: "video/webm",
  ogg: "audio/ogg",
}

const DEFAULT_MIME = "application/octet-stream"
const DIR_MIME = "inode/directory"

function basename(path: string): string {
  const i = path.lastIndexOf("/")
  return i >= 0 ? path.slice(i + 1) : path
}

/** Infer a MIME type from a path's extension, defaulting to octet-stream. */
export function inferMimeType(path: string): string {
  const name = basename(path)
  const dot = name.lastIndexOf(".")
  if (dot <= 0) return DEFAULT_MIME
  return MIME_BY_EXT[name.slice(dot + 1).toLowerCase()] ?? DEFAULT_MIME
}

/** Build a `FileInfo` from a path and its `FsStat`. */
export function toFileInfo(path: string, stat: FsStat): FileInfo {
  const ms = stat.mtime.getTime()
  return {
    path,
    name: basename(path),
    type: stat.type,
    mimeType: stat.type === "file" ? inferMimeType(path) : DIR_MIME,
    size: stat.size,
    createdAt: ms,
    updatedAt: ms,
  }
}

/** `glob` + `stat` each match into a `FileInfo[]` (skips paths that vanish). */
export async function globInfos(fs: FileSystem, pattern: string): Promise<FileInfo[]> {
  const normalizedPattern = pattern.startsWith("/") ? pattern : `/${pattern}`
  const paths = await fs.glob(normalizedPattern)
  const infos: FileInfo[] = []
  for (const p of paths) {
    try {
      infos.push(toFileInfo(p, await fs.stat(p)))
    } catch {
      // Raced against a concurrent delete, or unreadable — skip.
    }
  }
  return infos
}

/** List a directory's immediate children as `FileInfo[]`, with offset/limit. */
export async function readDirInfos(
  fs: FileSystem,
  dir?: string,
  opts?: { limit?: number; offset?: number },
): Promise<FileInfo[]> {
  const base = !dir || dir === "/" ? "/" : dir.startsWith("/") ? dir : "/" + dir
  const entries = await fs.readdirWithFileTypes(base)
  const infos: FileInfo[] = []
  for (const e of entries) {
    const full = base === "/" ? "/" + e.name : base + "/" + e.name
    try {
      infos.push(toFileInfo(full, await fs.stat(full)))
    } catch {
      // skip unreadable entry
    }
  }
  const offset = opts?.offset ?? 0
  return opts?.limit !== undefined ? infos.slice(offset, offset + opts.limit) : infos.slice(offset)
}
