import {
  bytesToBase64,
  compilePromptResources,
  createDataUrl,
  downloadBytes,
  inferImageMime,
  pollTask,
  type CompiledPromptReference,
  type PromptResourceInput
} from "@nodetool-ai/nodes-utils";

export const ARK_BASE_URL = "https://ark.cn-beijing.volces.com";
const SEEDANCE_TASKS_PATH = "/api/v3/contents/generations/tasks";
const SEEDREAM_IMAGES_PATH = "/api/v3/images/generations";
const SEEDANCE_SUCCESS_STATUSES = new Set([
  "succeeded",
  "success",
  "completed",
  "done"
]);
const SEEDANCE_FAILURE_STATUSES = new Set([
  "failed",
  "fail",
  "expired",
  "error",
  "cancelled",
  "canceled"
]);

export interface SeedanceWaitOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface SeedanceTaskResult {
  taskId: string | undefined;
  status: string;
  mediaUrls: string[];
  message: string | undefined;
}

export interface SeedreamBodyOptions {
  model: string;
  prompt: string;
  imageUrls?: string[];
  size?: string;
  responseFormat?: string;
  watermark?: boolean;
  optimizePrompt?: boolean;
}

export function getArkApiKey(secrets: Record<string, string>): string {
  const key = secrets?.ARK_API_KEY || process.env.ARK_API_KEY || "";
  if (!key) {
    throw new Error("ARK_API_KEY is not configured");
  }
  return key;
}

export function arkHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

export function arkCreatePath(path: string): string {
  return new URL(path.startsWith("/") ? path : `/${path}`, ARK_BASE_URL)
    .toString();
}

export function buildSeedanceContent(
  prompt: string,
  resources: PromptResourceInput[] = []
): Record<string, unknown>[] {
  const compiled = compilePromptResources(prompt, resources);
  const content: Record<string, unknown>[] = [
    { type: "text", text: compiled.text }
  ];
  for (const reference of compiled.references) {
    content.push(seedanceReferenceContent(reference));
  }
  return content;
}

function seedanceReferenceContent(
  reference: CompiledPromptReference
): Record<string, unknown> {
  const url = promptResourceUrl(reference);
  if (reference.type === "image") {
    return {
      type: "image_url",
      image_url: { url },
      role: "reference_image"
    };
  }
  if (reference.type === "video") {
    return {
      type: "video_url",
      video_url: { url },
      role: "reference_video"
    };
  }
  throw new Error(
    "Seedance audio references are not supported in this first release"
  );
}

function promptResourceUrl(reference: CompiledPromptReference): string {
  if (reference.url) {
    return reference.url;
  }
  if (reference.dataUrl) {
    return reference.dataUrl;
  }
  if (reference.bytes) {
    return createDataUrl(reference.bytes, reference.mimeType);
  }
  throw new Error(
    `Prompt resource ${reference.marker} must include a URL, data URL, or bytes`
  );
}

export async function submitSeedanceTask(
  apiKey: string,
  body: Record<string, unknown>
): Promise<string> {
  const response = await fetch(arkCreatePath(SEEDANCE_TASKS_PATH), {
    method: "POST",
    headers: arkHeaders(apiKey),
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(
      `Seedance task submit failed: ${response.status} ${await response.text()}`
    );
  }

  const payload = (await response.json()) as unknown;
  const result = parseSeedanceTaskResult(payload);
  if (!result.taskId) {
    throw new Error(
      `Seedance task submit returned no task id: ${JSON.stringify(payload)}`
    );
  }
  return result.taskId;
}

export async function waitForSeedanceResult(
  apiKey: string,
  taskId: string,
  options: SeedanceWaitOptions = {}
): Promise<Uint8Array> {
  const result = await pollTask({
    poll: () => querySeedanceTask(apiKey, taskId),
    isComplete: (value) => isSeedanceSucceeded(value.status),
    isFailed: (value) =>
      isSeedanceFailed(value.status)
        ? (value.message ?? `task ended with status ${value.status}`)
        : undefined,
    intervalMs: options.pollIntervalMs ?? 5_000,
    timeoutMs: options.timeoutMs ?? 30 * 60_000,
    signal: options.signal
  });
  const mediaUrl = result.mediaUrls[0];
  if (!mediaUrl) {
    throw new Error("Seedance task succeeded but returned no media URL");
  }
  return downloadBytes(assertSafeProviderMediaUrl(mediaUrl, "Seedance"));
}

export function parseSeedanceTaskResult(payload: unknown): SeedanceTaskResult {
  const record = asRecord(payload);
  const data = unwrapData(record);
  const status = (
    stringValue(
      data.status ??
        data.task_status ??
        data.status_name ??
        record.status
    ) ?? ""
  ).toLowerCase();
  const taskId = stringValue(
    data.id ??
      data.task_id ??
      data.taskId ??
      record.id ??
      record.task_id ??
      record.taskId
  );
  const message = stringValue(
    data.message ??
      data.error_message ??
      data.fail_reason ??
      data.reason ??
      asRecord(data.error).message ??
      record.message
  );

  return {
    taskId,
    status,
    mediaUrls: collectMediaUrls(data),
    message
  };
}

export function buildSeedreamBody(
  options: SeedreamBodyOptions
): Record<string, unknown> {
  return cleanBody({
    model: options.model,
    prompt: options.prompt,
    image:
      options.imageUrls && options.imageUrls.length > 0
        ? options.imageUrls
        : undefined,
    size: options.size,
    response_format: options.responseFormat,
    watermark: options.watermark,
    optimize_prompt_options:
      options.optimizePrompt === undefined
        ? undefined
        : { optimize_prompt: options.optimizePrompt }
  });
}

export async function generateSeedreamImage(
  apiKey: string,
  body: Record<string, unknown>
): Promise<Uint8Array> {
  const response = await fetch(arkCreatePath(SEEDREAM_IMAGES_PATH), {
    method: "POST",
    headers: arkHeaders(apiKey),
    body: JSON.stringify(cleanBody(body))
  });
  if (!response.ok) {
    throw new Error(
      `Seedream image generation failed: ${response.status} ${await response.text()}`
    );
  }

  const payload = (await response.json()) as unknown;
  const imageUrl = collectMediaUrls(payload)[0];
  if (!imageUrl) {
    throw new Error(
      `Seedream image generation returned no image URL: ${JSON.stringify(payload)}`
    );
  }
  return downloadBytes(assertSafeProviderMediaUrl(imageUrl, "Seedream"));
}

export function imageRefFromBytes(
  bytes: Uint8Array
): { type: "image"; data: string; mimeType: string } {
  return {
    type: "image",
    data: bytesToBase64(bytes),
    mimeType: inferImageMime(bytes, "image/png")
  };
}

export function videoRefFromBytes(
  bytes: Uint8Array
): { type: "video"; data: string } {
  return { type: "video", data: bytesToBase64(bytes) };
}

async function querySeedanceTask(
  apiKey: string,
  taskId: string
): Promise<SeedanceTaskResult> {
  const response = await fetch(
    arkCreatePath(`${SEEDANCE_TASKS_PATH}/${encodeURIComponent(taskId)}`),
    { headers: arkHeaders(apiKey) }
  );
  if (!response.ok) {
    throw new Error(
      `Seedance task query failed: ${response.status} ${await response.text()}`
    );
  }
  return parseSeedanceTaskResult(await response.json());
}

function isSeedanceSucceeded(status: string): boolean {
  return SEEDANCE_SUCCESS_STATUSES.has(status);
}

function isSeedanceFailed(status: string): boolean {
  return SEEDANCE_FAILURE_STATUSES.has(status);
}

function unwrapData(record: Record<string, unknown>): Record<string, unknown> {
  const data = record.data;
  if (Array.isArray(data)) {
    return asRecord(data[0]);
  }
  if (data && typeof data === "object") {
    return data as Record<string, unknown>;
  }
  return record;
}

function collectMediaUrls(value: unknown): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const visit = (item: unknown): void => {
    if (typeof item === "string") {
      if (isMediaUrl(item) && !seen.has(item)) {
        seen.add(item);
        urls.push(item);
      }
      return;
    }
    if (Array.isArray(item)) {
      for (const entry of item) {
        visit(entry);
      }
      return;
    }
    if (!item || typeof item !== "object") {
      return;
    }
    const record = item as Record<string, unknown>;
    for (const key of [
      "url",
      "media_url",
      "video_url",
      "image_url",
      "file_url"
    ]) {
      visit(record[key]);
    }
    for (const key of [
      "content",
      "data",
      "output",
      "outputs",
      "result",
      "results",
      "video",
      "videos",
      "image",
      "images"
    ]) {
      visit(record[key]);
    }
  };

  visit(value);
  return urls;
}

function isMediaUrl(value: string): boolean {
  return value.startsWith("http://") ||
    value.startsWith("https://") ||
    value.startsWith("data:");
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

  const ipv4 = parseIpv4(hostname);
  if (ipv4) {
    return isPublicIpv4(ipv4);
  }

  if (isBlockedIpv6(hostname)) {
    return false;
  }

  return isPublicDnsName(hostname);
}

function normalizeHostname(hostname: string): string {
  return hostname
    .trim()
    .toLowerCase()
    .replace(/^\[/, "")
    .replace(/\]$/, "")
    .replace(/\.$/, "");
}

function parseIpv4(hostname: string): number[] | undefined {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)) {
    return undefined;
  }
  const octets = hostname.split(".").map((part) => Number(part));
  return octets.every((octet) => Number.isInteger(octet) && octet <= 255)
    ? octets
    : undefined;
}

function isPublicIpv4([first, second]: number[]): boolean {
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
  if (first === 198 && (second === 18 || second === 19)) {
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
  const mappedIpv4 = hostname.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mappedIpv4) {
    const ipv4 = parseIpv4(mappedIpv4[1]);
    return !ipv4 || !isPublicIpv4(ipv4);
  }
  return hostname === "::" ||
    hostname === "::1" ||
    hostname.startsWith("fe80:") ||
    hostname.startsWith("fc") ||
    hostname.startsWith("fd");
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

function cleanBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    if (Array.isArray(value) && value.length === 0) {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
