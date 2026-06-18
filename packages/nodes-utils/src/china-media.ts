import { bytesToBase64 } from "./base64.js";

export type PromptResourceType = "image" | "video" | "audio";

export interface PromptResourceInput {
  type: PromptResourceType;
  alias?: string;
  url?: string;
  dataUrl?: string;
  bytes?: Uint8Array;
  mimeType?: string;
  description?: string;
}

export interface CompiledPromptReference extends PromptResourceInput {
  marker: string;
}

export interface CompiledPromptResources {
  text: string;
  references: CompiledPromptReference[];
}

export interface PollTaskOptions<T> {
  poll: () => Promise<T> | T;
  isComplete: (value: T) => boolean;
  isFailed?: (value: T) => boolean | string | Error | null | undefined;
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const DEFAULT_POLL_INTERVAL_MS = 1_000;
const DEFAULT_POLL_TIMEOUT_MS = 60_000;
const ALIAS_PATTERN = /@([A-Za-z0-9_-]+)/g;
const OCTET_STREAM_MIME = "application/octet-stream";

export function compilePromptResources(
  prompt: string,
  resourceInputs: PromptResourceInput[] = []
): CompiledPromptResources {
  const resourcesByAlias = new Map<string, PromptResourceInput[]>();
  for (const resource of resourceInputs) {
    if (resource.alias === undefined || resource.alias.length === 0) {
      continue;
    }

    const existing = resourcesByAlias.get(resource.alias);
    if (existing === undefined) {
      resourcesByAlias.set(resource.alias, [resource]);
    } else {
      existing.push(resource);
    }
  }

  const references: CompiledPromptReference[] = [];
  const seenReferences = new Set<string>();
  const referencedAliases = new Set<string>();
  const text = prompt.replace(ALIAS_PATTERN, (match, alias: string) => {
    const matchingResources = resourcesByAlias.get(alias);
    if (matchingResources === undefined) {
      return match;
    }

    referencedAliases.add(alias);
    for (const resource of matchingResources) {
      addReference(references, seenReferences, resource, alias);
    }

    return createReferenceMarker(alias);
  });

  for (const resource of resourceInputs) {
    if (resource.alias !== undefined && referencedAliases.has(resource.alias)) {
      continue;
    }

    addReference(references, seenReferences, resource, resource.alias);
  }

  return { text, references };
}

export function inferImageMime(
  bytes: Uint8Array,
  fallback = OCTET_STREAM_MIME
): string {
  if (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  if (
    bytes.length >= 4 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38
  ) {
    return "image/gif";
  }

  return fallback;
}

export function createDataUrl(bytes: Uint8Array, mimeType?: string): string {
  const resolvedMimeType = mimeType ?? inferImageMime(bytes);
  return `data:${resolvedMimeType};base64,${bytesToBase64(bytes)}`;
}

export async function downloadBytes(
  url: string,
  init?: RequestInit
): Promise<Uint8Array> {
  if (typeof globalThis.fetch !== "function") {
    throw new Error("downloadBytes requires global fetch to be available");
  }

  const response = await globalThis.fetch(url, init);
  if (!response.ok) {
    const statusText =
      response.statusText.length > 0 ? ` ${response.statusText}` : "";
    throw new Error(
      `Failed to download ${formatDownloadTarget(url)}: HTTP ${response.status}${statusText}`
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}

export async function pollTask<T>(options: PollTaskOptions<T>): Promise<T> {
  const intervalMs = options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_POLL_TIMEOUT_MS;
  const startedAt = Date.now();
  const deadlineAt = startedAt + timeoutMs;
  let hasPolled = false;

  while (true) {
    throwIfAborted(options.signal);
    if (hasPolled && Date.now() - startedAt >= timeoutMs) {
      throw new Error(`Polling timed out after ${timeoutMs}ms`);
    }

    const value = await withPollingDeadline(
      options.poll,
      deadlineAt,
      timeoutMs,
      options.signal
    );
    hasPolled = true;
    const failure = options.isFailed?.(value);
    if (failure) {
      throw new Error(`Polling failed: ${formatFailureReason(failure)}`);
    }

    if (options.isComplete(value)) {
      return value;
    }

    const elapsedMs = Date.now() - startedAt;
    const remainingMs = timeoutMs - elapsedMs;
    if (remainingMs <= 0) {
      throw new Error(`Polling timed out after ${timeoutMs}ms`);
    }

    await delay(Math.min(intervalMs, remainingMs), options.signal);
  }
}

function addReference(
  references: CompiledPromptReference[],
  seenReferences: Set<string>,
  resource: PromptResourceInput,
  alias: string | undefined
): void {
  const key = createResourceKey(resource);
  if (seenReferences.has(key)) {
    return;
  }

  seenReferences.add(key);
  references.push({
    ...resource,
    marker: createReferenceMarker(alias)
  });
}

function createReferenceMarker(alias: string | undefined): string {
  return alias === undefined || alias.length === 0
    ? "[reference]"
    : `[reference: ${alias}]`;
}

function createResourceKey(resource: PromptResourceInput): string {
  const bytesKey =
    resource.bytes === undefined ? "" : bytesToBase64(resource.bytes);
  return [
    resource.type,
    resource.alias ?? "",
    resource.url ?? "",
    resource.dataUrl ?? "",
    bytesKey,
    resource.mimeType ?? ""
  ].join("\u001f");
}

function formatFailureReason(reason: boolean | string | Error): string {
  if (reason instanceof Error) {
    return reason.message;
  }

  if (typeof reason === "string") {
    return reason;
  }

  return "task reported failure";
}

function formatDownloadTarget(url: string): string {
  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
      return `${parsedUrl.origin}${parsedUrl.pathname}`;
    }
  } catch {
    return "resource";
  }

  return "resource";
}

function formatAbortReason(reason: unknown): string {
  if (reason instanceof Error) {
    return reason.message;
  }

  if (typeof reason === "string") {
    return reason;
  }

  return "signal was aborted";
}

function createPollingTimeoutError(timeoutMs: number): Error {
  return new Error(`Polling timed out after ${timeoutMs}ms`);
}

function createPollingAbortError(signal: AbortSignal | undefined): Error {
  return new Error(`Polling aborted: ${formatAbortReason(signal?.reason)}`);
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw createPollingAbortError(signal);
  }
}

function withPollingDeadline<T>(
  operation: () => Promise<T> | T,
  deadlineAt: number,
  timeoutMs: number,
  signal: AbortSignal | undefined
): Promise<T> {
  throwIfAborted(signal);

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const cleanup = (): void => {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      signal?.removeEventListener("abort", abort);
    };
    const resolveOnce = (value: T): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve(value);
    };
    const rejectOnce = (error: unknown): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };
    const abort = (): void => {
      rejectOnce(createPollingAbortError(signal));
    };

    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
      return;
    }

    timeout = setTimeout(
      () => rejectOnce(createPollingTimeoutError(timeoutMs)),
      Math.max(0, deadlineAt - Date.now())
    );

    try {
      Promise.resolve(operation()).then(resolveOnce, rejectOnce);
    } catch (error) {
      rejectOnce(error);
    }
  });
}

function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  if (ms <= 0) {
    throwIfAborted(signal);
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const cleanup = (): void => {
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      signal?.removeEventListener("abort", abort);
    };
    const resolveOnce = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      resolve();
    };
    const rejectOnce = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      reject(error);
    };
    const abort = (): void => {
      rejectOnce(createPollingAbortError(signal));
    };

    timeout = setTimeout(resolveOnce, ms);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) {
      abort();
    }
  });
}
