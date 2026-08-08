// Preview response security.
//
// All Think previews share one browser origin (path-based on the preview
// domain). A generated app must not be able to emit response headers that grant
// it authority over that shared origin. Most importantly Service-Worker-Allowed
// lets a service worker widen its scope to "/" - allowing one app's SW to
// intercept every other user's previews. We also drop Clear-Site-Data (could
// wipe other users' preview cookies) and Service-Worker-Navigation-Preload.

export const STRIPPED_PREVIEW_HEADERS = [
  "Service-Worker-Allowed",
  "Service-Worker-Navigation-Preload",
  "Clear-Site-Data",
] as const

export function stripPreviewSecurityHeaders(response: Response): Response {
  // WebSocket upgrade responses cannot be reconstructed (no body, immutable
  // headers); they never carry these headers, so pass them through untouched.
  if (response.status === 101 || response.headers.get("upgrade")?.toLowerCase() === "websocket") {
    return response
  }

  const headers = new Headers(response.headers)
  let changed = false
  for (const name of STRIPPED_PREVIEW_HEADERS) {
    if (headers.has(name)) {
      headers.delete(name)
      changed = true
    }
  }
  if (!changed) return response

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}
