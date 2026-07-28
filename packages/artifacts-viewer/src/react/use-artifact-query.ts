import { useEffect, useRef, useState } from "react";
import type { ArtifactsClientError, ArtifactsResult } from "../client/types.ts";

export type ArtifactQueryState<TData> =
  | { readonly status: "idle" }
  | { readonly status: "loading" }
  | { readonly status: "success"; readonly data: TData }
  | { readonly status: "error"; readonly error: ArtifactsClientError };

export type ArtifactQueryRun<TData> = (signal: AbortSignal) => Promise<ArtifactsResult<TData>>;

/**
 * Runs one request per dependency change. No cache and no deduplication: those
 * belong to the consumer's data layer, not to a viewer component.
 *
 * A `null` run means the query is not ready yet and stays `idle`.
 */
export function useArtifactQuery<TData>(
  run: ArtifactQueryRun<TData> | null,
  deps: readonly unknown[],
): ArtifactQueryState<TData> {
  const [state, setState] = useState<ArtifactQueryState<TData>>({ status: "idle" });
  const runRef = useRef(run);

  // Declared first so the ref holds this render's closure before the effect
  // below reads it. Assigning during render is unsupported by React.
  useEffect(() => {
    runRef.current = run;
  });

  useEffect(() => {
    const current = runRef.current;
    if (current === null) {
      setState({ status: "idle" });
      return;
    }

    const controller = new AbortController();
    let active = true;
    setState({ status: "loading" });

    void current(controller.signal).then(
      (result) => {
        if (!active) {
          return;
        }
        setState(
          result.ok
            ? { status: "success", data: result.value }
            : { status: "error", error: result.error },
        );
      },
      // A run is not required to be infallible: a stream can fail after its
      // response resolved. Without this the query would hang on `loading`.
      (cause: unknown) => {
        if (!active) {
          return;
        }
        setState({
          status: "error",
          error: { kind: "network", message: "The request could not be completed.", cause },
        });
      },
    );

    return () => {
      active = false;
      controller.abort();
    };
    // oxlint-disable-next-line exhaustive-deps
  }, deps);

  return state;
}
