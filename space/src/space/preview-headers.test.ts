import { describe, it, expect } from 'vitest'
import { stripPreviewSecurityHeaders, STRIPPED_PREVIEW_HEADERS } from './preview-headers'

describe('stripPreviewSecurityHeaders', () => {
  it('removes Service-Worker-Allowed from a JS (sw.js) response without altering body/status', async () => {
    const res = new Response('self.addEventListener("fetch", () => {})', {
      status: 200,
      headers: {
        'Content-Type': 'application/javascript',
        'Service-Worker-Allowed': '/',
      },
    })

    const safe = stripPreviewSecurityHeaders(res)

    expect(safe.headers.get('Service-Worker-Allowed')).toBeNull()
    expect(safe.headers.get('Content-Type')).toBe('application/javascript')
    expect(safe.status).toBe(200)
    expect(await safe.text()).toBe('self.addEventListener("fetch", () => {})')
  })

  it('removes every stripped header, including case-insensitive variants', () => {
    const res = new Response('ok', {
      headers: {
        'service-worker-allowed': '/',
        'Service-Worker-Navigation-Preload': 'true',
        'clear-site-data': '"*"',
        'X-Keep': 'yes',
      },
    })

    const safe = stripPreviewSecurityHeaders(res)

    for (const name of STRIPPED_PREVIEW_HEADERS) {
      expect(safe.headers.get(name)).toBeNull()
    }
    expect(safe.headers.get('X-Keep')).toBe('yes')
  })

  it('returns the same response instance when no stripped headers are present', () => {
    const res = new Response('hello', { headers: { 'Content-Type': 'text/html' } })
    expect(stripPreviewSecurityHeaders(res)).toBe(res)
  })

  it('passes WebSocket upgrade responses through untouched', () => {
    // Upgrade responses cannot be reconstructed; must be returned as-is even if
    // they (defensively) carry a stripped header.
    const res = new Response('ok', {
      headers: { Upgrade: 'websocket', 'Service-Worker-Allowed': '/' },
    })
    const out = stripPreviewSecurityHeaders(res)
    expect(out).toBe(res)
    expect(out.headers.get('Service-Worker-Allowed')).toBe('/')
  })
})
