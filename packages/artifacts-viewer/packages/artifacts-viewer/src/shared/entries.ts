import type { ArtifactsTreeEntry } from "./official-types.ts";

/** Submodules sort with directories because that is how a user reads them. */
function isDirectoryLike(entry: ArtifactsTreeEntry): boolean {
  return entry.type === "tree" || entry.type === "gitlink";
}

export function sortEntries(entries: readonly ArtifactsTreeEntry[]): ArtifactsTreeEntry[] {
  return [...entries].sort((first, second) => {
    const firstIsDirectory = isDirectoryLike(first);
    const secondIsDirectory = isDirectoryLike(second);
    if (firstIsDirectory !== secondIsDirectory) {
      return firstIsDirectory ? -1 : 1;
    }
    return first.name.localeCompare(second.name, undefined, { sensitivity: "base" });
  });
}

export function joinPath(basePath: string, name: string): string {
  return basePath === "" ? name : `${basePath}/${name}`;
}
