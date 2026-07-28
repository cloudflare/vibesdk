import type { ArtifactPierreTheme } from "./types.ts";

export type PreloadCodeViewOptions = {
  readonly theme?: ArtifactPierreTheme;
  /** File name whose grammar should be attached, so its first paint is highlighted. */
  readonly name?: string;
};

const warmed = new Map<string, Promise<boolean>>();

/**
 * Warms the highlighted code path: the lazy chunk, the shared Shiki engine, the
 * themes, and — when a file name is given — that file's grammar.
 *
 * `@pierre/diffs` keeps a single module-level highlighter. Rendering a file
 * before its theme and grammar are attached paints an empty node, so callers
 * should await this before mounting the code view.
 *
 * Resolves to whether the highlighter is ready. `false` means highlighting is
 * unavailable and callers should show unhighlighted text instead of waiting.
 *
 * Safe to call repeatedly; each distinct theme and grammar set is warmed once.
 */
export function preloadCodeView(options: PreloadCodeViewOptions = {}): Promise<boolean> {
  const key = `${themeNames(options.theme).join(",")}\u0000${options.name ?? ""}`;
  let pending = warmed.get(key);

  if (pending === undefined) {
    pending = warm(options);
    warmed.set(key, pending);
  }

  return pending;
}

/** Theme names in a stable order, for use as a memo key. Empty means Pierre's default. */
export function themeNames(theme: ArtifactPierreTheme | undefined): readonly string[] {
  if (theme === undefined) {
    return [];
  }
  return typeof theme === "string" ? [theme] : [theme.light, theme.dark];
}

async function warm({ theme, name }: PreloadCodeViewOptions): Promise<boolean> {
  try {
    const [, diffs] = await Promise.all([import("@pierre/diffs/react"), import("@pierre/diffs")]);

    // Preloading an empty theme list caches a highlighter with nothing attached
    // while making `isHighlighterLoaded()` return true, so the real names have to
    // be resolved here. `getThemes` supplies Pierre's default pair for `undefined`.
    await diffs.preloadHighlighter({
      themes: diffs.getThemes(theme),
      langs: name === undefined ? [] : [diffs.getFiletypeFromFileName(name)],
    });

    return true;
  } catch {
    return false;
  }
}
