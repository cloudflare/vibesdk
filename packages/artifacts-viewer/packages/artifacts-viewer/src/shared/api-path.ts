/** Default mount point, shared by the router and the client. */
export const defaultApiPath = "/artifacts";

export function normalizeApiPath(apiPath: string): string {
  const withLeadingSlash = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  return withLeadingSlash.length > 1 && withLeadingSlash.endsWith("/")
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
}
