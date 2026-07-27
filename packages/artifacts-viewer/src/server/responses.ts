/**
 * Everything the router emits itself is shaped as a Cloudflare v4 envelope, so
 * a client needs one parser and cannot tell which backend served a request.
 * That is what makes the binding a transparent optimization rather than a
 * second contract.
 */

import type { CloudflareEnvelope } from "../shared/official-types.ts";

export function envelopeResponse<TResult>(result: TResult, status = 200): Response {
  return jsonResponse({ result, success: true, errors: [] }, status);
}

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
