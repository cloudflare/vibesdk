/** A slot class and a consumer `className` are additive, never exclusive. */
export function joinClassNames(...values: readonly (string | undefined)[]): string | undefined {
  const present = values.filter((value) => value !== undefined && value !== "");
  return present.length === 0 ? undefined : present.join(" ");
}
