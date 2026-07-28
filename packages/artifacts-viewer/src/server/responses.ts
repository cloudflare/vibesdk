/**
 * Errors the router raises itself are shaped as Cloudflare v4 envelopes, so a
 * client parses one response shape whether the failure was local or upstream.
 */

import type { CloudflareEnvelope } from "../shared/official-types.ts";

// The error `code` is the HTTP status: Cloudflare's own codes come from a
// registry we do not own, and reusing the status keeps locally-generated errors
// self-describing without pretending to be upstream ones.
export function errorEnvelopeResponse(status: number, message: string): Response {
  return jsonResponse(
    { result: null, success: false, errors: [{ code: status, message }] },
    status,
  );
}

export function methodNotAllowedResponse(allow: readonly string[]): Response {
  const response = errorEnvelopeResponse(405, "Method not allowed.");
  const headers = new Headers(response.headers);
  headers.set("Allow", allow.join(", "));
  return new Response(response.body, { status: 405, headers });
}

function jsonResponse<TResult>(envelope: CloudflareEnvelope<TResult>, status: number): Response {
  return new Response(JSON.stringify(envelope), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}
