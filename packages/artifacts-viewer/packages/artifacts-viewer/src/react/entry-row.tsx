import type { MouseEvent, ReactElement, ReactNode } from "react";
import type { ArtifactsTreeEntry } from "../shared/official-types.ts";

export type EntryRowProps = {
  readonly slot: "treeItem" | "directoryItem";
  readonly entry: ArtifactsTreeEntry;
  readonly icon: ReactNode;
  readonly selected: boolean;
  readonly expanded?: boolean;
  readonly className?: string;
  readonly href?: string;
  readonly onActivate: () => void;
};

/**
 * One entry, rendered as an anchor when the consumer supplied an href and as a
 * button otherwise. Submodules have no content to open, so they are inert.
 */
export function EntryRow({
  slot,
  entry,
  icon,
  selected,
  expanded,
  className,
  href,
  onActivate,
}: EntryRowProps): ReactElement {
  const shared = {
    className,
    "data-artifacts-viewer-slot": slot,
    "data-kind": entry.type,
    "data-selected": selected ? "" : undefined,
  };

  if (entry.type === "gitlink") {
    return (
      <span {...shared} data-disabled="">
        <span data-artifacts-viewer-part="icon">{icon}</span>
        <span data-artifacts-viewer-part="name">{entry.name}</span>
      </span>
    );
  }

  const body = (
    <>
      <span data-artifacts-viewer-part="icon">{icon}</span>
      <span data-artifacts-viewer-part="name">{entry.name}</span>
    </>
  );

  if (href !== undefined) {
    return (
      <a
        {...shared}
        href={href}
        aria-current={selected ? "true" : undefined}
        aria-expanded={expanded}
        onClick={(event: MouseEvent<HTMLAnchorElement>) => {
          if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey) {
            return;
          }
          event.preventDefault();
          onActivate();
        }}
      >
        {body}
      </a>
    );
  }

  return (
    <button
      {...shared}
      type="button"
      aria-current={selected ? "true" : undefined}
      aria-expanded={expanded}
      onClick={onActivate}
    >
      {body}
    </button>
  );
}
