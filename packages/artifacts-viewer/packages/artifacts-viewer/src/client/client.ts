import { defaultApiPath, normalizeApiPath } from "../shared/api-path.ts";
import type { ArtifactsCommitMetadata, ArtifactsTreeEntry } from "../shared/official-types.ts";
import {
  narrowCommit,
  narrowCommits,
  narrowRepository,
  narrowTreeEntries,
  unwrapEnvelope,
} from "./parse.ts";
import type { Narrowed } from "./parse.ts";
import type {
  ArtifactsClient,
  ArtifactsClientError,
  ArtifactsClientOptions,
  ArtifactsRepository,
  ArtifactsResult,
  LogArgs,
  ObjectArgs,
  PathArgs,
  RawUrlArgs,
  RepositoryArgs,
} from "./types.ts";

/**
 * Creates a client for a mounted {@link routeArtifactRequest} instance.
 *
 * Talks only to your own origin, so no credentials live in the browser.
 */
export function createArtifactsClient(options: ArtifactsClientOptions = {}): ArtifactsClient {
  const basePath = normalizeApiPath(options.apiPath ?? defaultApiPath);
  const send = options.fetch ?? ((input, init) => globalThis.fetch(input, init));

  function repoBase(repoName: string): string {
    return `${basePath}/repos/${encodeURIComponent(repoName)}`;
  }

  function rawUrl({ repoName, ref, path }: RawUrlArgs): string {
    return `${repoBase(repoName)}/raw/${encodeURIComponent(ref)}/${encodePath(path)}`;
  }

  async function request(
    url: string,
    accept: string,
    signal: AbortSignal | undefined,
  ): Promise<ArtifactsResult<Response>> {
    let response: Response;
    try {
      response = await send(url, { headers: { Accept: accept }, signal });
    } catch (cause) {
      return err({ kind: "network", message: "The request could not be sent.", cause });
    }

    if (response.status === 404) {
      return err({ kind: "not-found", message: "The requested resource does not exist." });
    }
    if (!response.ok) {
      return err({
        kind: "http",
        status: response.status,
        message: await errorMessage(response),
      });
    }
    return { ok: true, value: response };
  }

  async function readJson<TValue>(
    url: string,
    narrow: (result: unknown) => Narrowed<TValue>,
    signal: AbortSignal | undefined,
  ): Promise<ArtifactsResult<TValue>> {
    const sent = await request(url, "application/json", signal);
    if (!sent.ok) {
      return sent;
    }

    let body: unknown;
    try {
      body = await sent.value.json();
    } catch (cause) {
      return err({ kind: "network", message: "The response body was not valid JSON.", cause });
    }

    const envelope = unwrapEnvelope(body);
    if (!envelope.ok) {
      return err({ kind: "malformed", message: envelope.reason });
    }

    const narrowed = narrow(envelope.value);
    return narrowed.ok
      ? { ok: true, value: narrowed.value }
      : err({ kind: "malformed", message: narrowed.reason });
  }

  return {
    getRepository({
      repoName,
      signal,
    }: RepositoryArgs): Promise<ArtifactsResult<ArtifactsRepository>> {
      return readJson(repoBase(repoName), narrowRepository, signal);
    },

    getLog({
      repoName,
      ref,
      limit,
      offset,
      signal,
    }: LogArgs): Promise<ArtifactsResult<ArtifactsCommitMetadata[]>> {
      const query = new URLSearchParams();
      if (ref !== undefined) {
        query.set("ref", ref);
      }
      if (limit !== undefined) {
        query.set("limit", String(limit));
      }
      if (offset !== undefined) {
        query.set("offset", String(offset));
      }
      const search = query.toString();
      const url =
        search === "" ? `${repoBase(repoName)}/log` : `${repoBase(repoName)}/log?${search}`;
      return readJson(url, narrowCommits, signal);
    },

    readCommit({
      repoName,
      hash,
      signal,
    }: ObjectArgs): Promise<ArtifactsResult<ArtifactsCommitMetadata>> {
      return readJson(
        `${repoBase(repoName)}/commit/${encodeURIComponent(hash)}`,
        narrowCommit,
        signal,
      );
    },

    readTree({
      repoName,
      hash,
      signal,
    }: ObjectArgs): Promise<ArtifactsResult<ArtifactsTreeEntry[]>> {
      return readJson(
        `${repoBase(repoName)}/tree/${encodeURIComponent(hash)}`,
        narrowTreeEntries,
        signal,
      );
    },

    readBlob({ repoName, hash, signal }: ObjectArgs): Promise<ArtifactsResult<Response>> {
      return request(`${repoBase(repoName)}/blob/${encodeURIComponent(hash)}`, "*/*", signal);
    },

    readFile({ repoName, ref, path, signal }: PathArgs): Promise<ArtifactsResult<Response>> {
      const query = new URLSearchParams({ ref, path });
      return request(`${repoBase(repoName)}/file?${query.toString()}`, "*/*", signal);
    },

    getRawUrl: rawUrl,
  };
}

function err<TValue>(error: ArtifactsClientError): ArtifactsResult<TValue> {
  return { ok: false, error };
}

function encodePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const envelope = unwrapEnvelope(await response.json());
    if (!envelope.ok) {
      return envelope.reason;
    }
  } catch {
    // Fall through to the status-only message.
  }
  return `Request failed with status ${String(response.status)}.`;
}
