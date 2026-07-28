import type { ReactNode } from "react";
import type { ArtifactsClientError } from "../client/types.ts";
import type { ArtifactsTreeEntry } from "../shared/official-types.ts";

/**
 * What the viewer is currently pointed at.
 *
 * `path` is repository-relative and `""` at the root; `hash` addresses the
 * object itself, so navigation stays content-addressed after the first load.
 */
export type ArtifactSelection = {
  readonly path: string;
  readonly name: string;
  readonly hash: string;
  readonly type: ArtifactsTreeEntry["type"];
};

export type ArtifactSlot =
  | "root"
  | "toolbar"
  | "sidebar"
  | "tree"
  | "treeItem"
  | "content"
  | "directory"
  | "directoryItem"
  | "file"
  | "loading"
  | "empty"
  | "error";

/** Per-slot class hooks, paired with the stable `data-artifacts-viewer-slot`. */
export type ArtifactClassNames = Partial<Record<ArtifactSlot, string>>;

export type ArtifactIconSlots = {
  readonly file: ReactNode;
  readonly folder: ReactNode;
  readonly folderOpen: ReactNode;
  readonly submodule: ReactNode;
};

/**
 * Turns a selection into an href. When provided, rows render as anchors so the
 * native context menu and open-in-new-tab work; otherwise they are buttons.
 */
export type ArtifactHrefBuilder = (selection: ArtifactSelection) => string;

export type ArtifactColorMode = "light" | "dark" | "system";

/** A single theme name, or a light/dark pair resolved by `themeType`. */
export type ArtifactPierreTheme = string | { readonly light: string; readonly dark: string };

/**
 * Passed through to `@pierre/diffs`, which renders into an open Shadow DOM.
 * Host CSS cannot reach inside it, so this is the only way to theme the code
 * view.
 */
export type ArtifactPierreDiffsOptions = {
  readonly theme?: ArtifactPierreTheme;
  readonly themeType?: ArtifactColorMode;
  /** Unstable escape hatch: raw CSS injected into the Shadow DOM. */
  readonly unsafeCSS?: string;
};

/** Renders the placeholder shown until the highlighted code view has painted. */
export type ArtifactCodeFallbackRenderer = (file: {
  readonly name: string;
  readonly contents: string;
}) => ReactNode;

/** What a loading, empty, or error state belongs to, so one renderer can branch. */
export type ArtifactStatusContext =
  | { readonly scope: "repository"; readonly repoName: string }
  | { readonly scope: "tree"; readonly repoName: string; readonly path: string }
  | {
      readonly scope: "file";
      readonly repoName: string;
      readonly path: string;
      readonly name: string;
    };

/**
 * Why a file has nothing to render. Only files distinguish these; a repository
 * or directory is identified by the context scope instead.
 */
export type ArtifactEmptyKind = "empty" | "binary" | "oversized";

/**
 * Replaces the default loading, empty, and error markup.
 *
 * A renderer returning `undefined` keeps the default, so a partial map only
 * overrides what it names. Returning `null` renders nothing. Output is wrapped
 * in the matching slot element, so the `data-artifacts-viewer-slot` hook and
 * the ARIA attributes survive a replacement.
 */
export type ArtifactStatusRenderers = {
  readonly loading?: (context: ArtifactStatusContext) => ReactNode;
  readonly empty?: (context: ArtifactStatusContext, kind?: ArtifactEmptyKind) => ReactNode;
  readonly error?: (context: ArtifactStatusContext, error: ArtifactsClientError) => ReactNode;
};
