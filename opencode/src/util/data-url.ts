// Shim: @/util/data-url
export function decodeDataUrl(url: string): string {
  const match = url.match(/^data:[^;]*;base64,(.*)$/)
  if (match) return atob(match[1])
  const plain = url.match(/^data:[^,]*,(.*)$/)
  if (plain) return decodeURIComponent(plain[1])
  return url
}
