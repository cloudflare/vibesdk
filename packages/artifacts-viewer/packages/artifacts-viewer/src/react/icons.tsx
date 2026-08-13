import type { ReactElement } from "react";
import type { ArtifactIconSlots } from "./types.ts";

function Glyph({ d }: { d: string }): ReactElement {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 16 16"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}

export const defaultIcons: ArtifactIconSlots = {
  file: (
    <Glyph d="M9.5 1.5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V5m-3.5-3.5L13 5m-3.5-3.5V5H13" />
  ),
  folder: (
    <Glyph d="M1.75 12.5v-9a1 1 0 0 1 1-1h3.1l1.4 1.75h6a1 1 0 0 1 1 1v7.25a1 1 0 0 1-1 1h-10.5a1 1 0 0 1-1-1Z" />
  ),
  folderOpen: (
    <Glyph d="M1.75 12.5v-9a1 1 0 0 1 1-1h3.1l1.4 1.75h6a1 1 0 0 1 1 1V6.5m-12.5 6 1.9-5h11l-1.9 5Z" />
  ),
  submodule: <Glyph d="M8 1.75 14 5v6L8 14.25 2 11V5Zm0 0v12.5M2 5l6 3.25L14 5" />,
};
