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
const ALIAS_PATTERN = /@([\p{L}\p{N}_-]+)/gu;
const OCTET_STREAM_MIME = "application/octet-stream";
const MAX_PROVIDER_MEDIA_REDIRECTS = 5;

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
      throw new Error(`Prompt references unknown resource @${alias}`);
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

export async function downloadProviderMediaBytes(
  mediaUrl: string,
  provider: string
): Promise<Uint8Array> {
  let currentUrl = assertSafeProviderMediaUrl(mediaUrl, provider);
  if (currentUrl.startsWith("data:")) {
    return downloadBytes(currentUrl);
  }

  for (
    let redirectCount = 0;
    redirectCount <= MAX_PROVIDER_MEDIA_REDIRECTS;
    redirectCount++
  ) {
    await assertSafeProviderMediaDns(currentUrl, provider);

    const response = await fetch(currentUrl, { redirect: "manual" });
    const responseUrl = response.url;
    if (responseUrl && responseUrl !== currentUrl) {
      const validatedResponseUrl = assertSafeProviderMediaUrl(
        responseUrl,
        provider
      );
      await assertSafeProviderMediaDns(validatedResponseUrl, provider);
    }

    if (isRedirectResponse(response)) {
      if (redirectCount === MAX_PROVIDER_MEDIA_REDIRECTS) {
        throw new Error(
          `${provider} returned too many media URL redirects: ${safeUrlLabel(
            currentUrl
          )}`
        );
      }

      const location = response.headers.get("location");
      if (!location) {
        throw new Error(
          `${provider} returned media URL redirect without Location: ${safeUrlLabel(
            currentUrl
          )}`
        );
      }
      currentUrl = assertSafeProviderMediaUrl(
        new URL(location, currentUrl).toString(),
        provider
      );
      continue;
    }

    if (!response.ok) {
      const statusText =
        response.statusText.length > 0 ? ` ${response.statusText}` : "";
      throw new Error(
        `${provider} media URL download failed: ${safeUrlLabel(
          currentUrl
        )} HTTP ${response.status}${statusText}`
      );
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  throw new Error(
    `${provider} returned too many media URL redirects: ${safeUrlLabel(
      currentUrl
    )}`
  );
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

function assertSafeProviderMediaUrl(url: string, provider: string): string {
  if (url.startsWith("data:")) {
    return url;
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(
      `${provider} returned invalid media URL: ${safeUrlLabel(url)}`
    );
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `${provider} returned unsupported media URL: ${safeUrlLabel(parsed)}`
    );
  }

  if (!isPublicProviderHost(parsed.hostname)) {
    throw new Error(
      `${provider} returned unsafe media URL: ${safeUrlLabel(parsed)}`
    );
  }

  return url;
}

async function assertSafeProviderMediaDns(
  url: string,
  provider: string
): Promise<void> {
  const parsed = new URL(url);
  const hostname = normalizeHostname(parsed.hostname);
  if (isIpAddress(hostname)) {
    return;
  }

  let answers: Array<{ address: string; family: number }>;
  try {
    const { lookup: dnsLookup } = await import("node:dns/promises");
    answers = await dnsLookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error(
      `${provider} returned unsafe media URL: ${safeUrlLabel(parsed)}`
    );
  }

  if (
    answers.length === 0 ||
    answers.some((answer) => !isPublicIpAddress(answer.address))
  ) {
    throw new Error(
      `${provider} returned unsafe media URL: ${safeUrlLabel(parsed)}`
    );
  }
}

function isRedirectResponse(response: Response): boolean {
  return response.status >= 300 && response.status < 400;
}

function safeUrlLabel(url: string | URL): string {
  try {
    const parsed = typeof url === "string" ? new URL(url) : new URL(url.href);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return String(url).split(/[?#]/, 1)[0] ?? "";
  }
}

function isPublicProviderHost(rawHostname: string): boolean {
  const hostname = normalizeHostname(rawHostname);
  if (!hostname) {
    return false;
  }

  if (isIpv6Address(hostname)) {
    return isPublicIpv6(hostname);
  }

  const ipv4 = parseIpv4InetAton(hostname);
  if (ipv4) {
    return isPublicIpv4(ipv4);
  }

  if (isBlockedIpv6(hostname)) {
    return false;
  }

  return isPublicDnsName(hostname);
}

function isPublicIpAddress(address: string): boolean {
  const normalizedAddress = normalizeHostname(address);
  if (isIpv6Address(normalizedAddress)) {
    return isPublicIpv6(normalizedAddress);
  }
  const ipv4 = parseIpv4InetAton(normalizedAddress);
  return ipv4 !== undefined && isPublicIpv4(ipv4);
}

function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");
}

function isIpAddress(hostname: string): boolean {
  return isIpv6Address(hostname) || parseIpv4InetAton(hostname) !== undefined;
}

function isIpv6Address(hostname: string): boolean {
  return hostname.includes(":");
}

function parseIpv4InetAton(hostname: string): number[] | undefined {
  const parts = hostname.split(".");
  if (parts.length < 1 || parts.length > 4) {
    return undefined;
  }
  const parsed = parts.map(parseIpv4Part);
  if (parsed.some((part) => part === undefined)) {
    return undefined;
  }
  const nums = parsed.filter((part): part is number => part !== undefined);
  let value: number;
  if (nums.length === 1) {
    if (nums[0] > 0xffffffff) return undefined;
    value = nums[0];
  } else if (nums.length === 2) {
    if (nums[0] > 0xff || nums[1] > 0xffffff) return undefined;
    value = nums[0] * 0x1000000 + nums[1];
  } else if (nums.length === 3) {
    if (nums[0] > 0xff || nums[1] > 0xff || nums[2] > 0xffff) {
      return undefined;
    }
    value = nums[0] * 0x1000000 + nums[1] * 0x10000 + nums[2];
  } else {
    if (nums.some((part) => part > 0xff)) return undefined;
    value = nums[0] * 0x1000000 + nums[1] * 0x10000 + nums[2] * 0x100 + nums[3];
  }
  return [
    Math.floor(value / 0x1000000) % 0x100,
    Math.floor(value / 0x10000) % 0x100,
    Math.floor(value / 0x100) % 0x100,
    value % 0x100
  ];
}

function parseIpv4Part(part: string): number | undefined {
  if (part.length === 0) {
    return undefined;
  }
  let radix = 10;
  let digits = part;
  if (/^0x[0-9a-f]+$/i.test(part)) {
    radix = 16;
    digits = part.slice(2);
  } else if (/^0[0-7]+$/.test(part) && part.length > 1) {
    radix = 8;
    digits = part.slice(1);
  } else if (!/^\d+$/.test(part)) {
    return undefined;
  }
  const value = Number.parseInt(digits, radix);
  return Number.isSafeInteger(value) ? value : undefined;
}

function isPublicIpv4([first, second, third]: number[]): boolean {
  if (first === 10 || first === 127 || first === 0) {
    return false;
  }
  if (first === 172 && second >= 16 && second <= 31) {
    return false;
  }
  if (first === 192 && second === 168) {
    return false;
  }
  if (first === 169 && second === 254) {
    return false;
  }
  if (first === 100 && second >= 64 && second <= 127) {
    return false;
  }
  if (first === 192 && second === 0 && (third === 0 || third === 2)) {
    return false;
  }
  if (first === 192 && second === 88 && third === 99) {
    return false;
  }
  if (first === 198 && (second === 18 || second === 19)) {
    return false;
  }
  if (first === 198 && second === 51 && third === 100) {
    return false;
  }
  if (first === 203 && second === 0 && third === 113) {
    return false;
  }
  if (first >= 224) {
    return false;
  }
  return true;
}

function isBlockedIpv6(hostname: string): boolean {
  if (!hostname.includes(":")) {
    return false;
  }
  const mappedIpv4 = hostname.match(/^::ffff:(.+)$/);
  if (mappedIpv4) {
    const ipv4 = parseIpv4InetAton(mappedIpv4[1] ?? "");
    return !ipv4 || !isPublicIpv4(ipv4);
  }
  const firstHextetText = hostname.split(":", 1)[0] ?? "";
  const firstHextet =
    firstHextetText.length > 0 ? Number.parseInt(firstHextetText, 16) : 0;
  if (
    Number.isFinite(firstHextet) &&
    (((firstHextet & 0xffc0) === 0xfe80) ||
      ((firstHextet & 0xfe00) === 0xfc00) ||
      ((firstHextet & 0xff00) === 0xff00))
  ) {
    return true;
  }
  return hostname === "::" ||
    hostname === "::1" ||
    hostname.startsWith("2001:db8:");
}

function isPublicIpv6(hostname: string): boolean {
  return !isBlockedIpv6(hostname);
}

function isPublicDnsName(hostname: string): boolean {
  const blockedNames = new Set([
    "localhost",
    "localhost.localdomain",
    "metadata",
    "metadata.google.internal",
    "metadata.azure.internal",
    "instance-data"
  ]);
  if (blockedNames.has(hostname)) {
    return false;
  }
  const firstLabel = hostname.split(".", 1)[0];
  if (firstLabel === "metadata" || firstLabel === "instance-data") {
    return false;
  }
  if (!hostname.includes(".")) {
    return false;
  }
  return !(
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".home") ||
    hostname.endsWith(".lan") ||
    hostname.endsWith(".test") ||
    hostname.endsWith(".invalid")
  );
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
