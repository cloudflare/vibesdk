import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import type { FileOptions } from "@pierre/diffs/react";
import { preloadCodeView, themeNames } from "./highlighter.ts";
import type {
  ArtifactClassNames,
  ArtifactCodeFallbackRenderer,
  ArtifactPierreDiffsOptions,
} from "./types.ts";

/**
 * Literal specifier so every bundler — including Wrangler's esbuild pass — can
 * statically resolve the chunk. Shiki stays out of the initial bundle.
 */
const PierreFile = lazy(async () => ({ default: (await import("@pierre/diffs/react")).File }));

export type CodeViewProps = {
  readonly name: string;
  readonly contents: string;
  readonly options?: ArtifactPierreDiffsOptions;
  /** Rendered while the highlighted view is prepared. Defaults to a loading message. */
  readonly renderCodeFallback?: ArtifactCodeFallbackRenderer;
  readonly classNames?: ArtifactClassNames;
};

type WarmState = "pending" | "ready" | "failed";

/**
 * Unhighlighted text is never shown while highlighting is still coming: the
 * placeholder and the highlighted file share one grid cell, and Pierre is
 * revealed only once `onPostRender` finds real output in its shadow root.
 *
 * Pierre is mounted only after its theme and grammar are attached, because
 * mounting it cold makes it paint an empty node and report that as its first
 * render. When the warm-up fails outright, plain text is shown rather than a
 * placeholder that would never resolve.
 */
export function CodeView({
  name,
  contents,
  options,
  renderCodeFallback,
  classNames,
}: CodeViewProps): ReactElement {
  const cacheKey = useMemo(
    () => `${name}:${contents.length}:${hashContents(contents)}`,
    [name, contents],
  );
  const [renderedKey, setRenderedKey] = useState<string>();
  const highlighted = renderedKey === cacheKey;

  const theme = options?.theme;
  const themeType = options?.themeType ?? "system";
  const unsafeCSS = options?.unsafeCSS;
  const themeKey = themeNames(theme).join(",");

  const [warmState, setWarmState] = useState<WarmState>("pending");

  useEffect(() => {
    let active = true;
    setWarmState("pending");

    void preloadCodeView({ theme, name }).then((ready) => {
      if (active) {
        setWarmState(ready ? "ready" : "failed");
      }
    });

    return () => {
      active = false;
    };
    // oxlint-disable-next-line exhaustive-deps
  }, [themeKey, name]);

  const fileOptions = useMemo<FileOptions<undefined>>(() => {
    return {
      theme,
      themeType,
      unsafeCSS,
      disableFileHeader: true,
      overflow: "scroll",
      onPostRender(node, _instance, phase) {
        if (phase !== "unmount" && hasHighlightedContents(node)) {
          queueMicrotask(() => {
            setRenderedKey(cacheKey);
          });
        }
      },
    };
    // oxlint-disable-next-line exhaustive-deps
  }, [cacheKey, themeKey, themeType, unsafeCSS]);

  return (
    <div data-artifacts-viewer-part="code">
      {highlighted ? null : warmState === "failed" ? (
        <pre data-artifacts-viewer-part="code-fallback">
          <code>{contents}</code>
        </pre>
      ) : (
        <div data-artifacts-viewer-part="code-pending">
          {renderCodeFallback === undefined ? (
            // Not routed through `renderStatus`: this waits on the highlighter
            // rather than the network, and `renderCodeFallback` already owns it.
            <p
              data-artifacts-viewer-slot="loading"
              className={classNames?.loading}
              aria-busy="true"
            >
              Preparing view…
            </p>
          ) : (
            renderCodeFallback({ name, contents })
          )}
        </div>
      )}
      <div data-artifacts-viewer-part="code-highlight" data-pending={highlighted ? undefined : ""}>
        {warmState === "pending" ? null : (
          <Suspense fallback={null}>
            <PierreFile key={cacheKey} file={{ name, contents, cacheKey }} options={fileOptions} />
          </Suspense>
        )}
      </div>
    </div>
  );
}

/**
 * `data-file` is only set once Pierre has painted, which distinguishes a real
 * render from the empty `<pre>` it creates before highlighting resolves.
 */
function hasHighlightedContents(node: HTMLElement): boolean {
  const rendered = node.shadowRoot?.querySelector("pre[data-file] code")?.textContent;
  return typeof rendered === "string" && rendered.length > 0;
}

/** FNV-1a, base36. Content-derived so a different file can never reuse a key. */
function hashContents(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}
