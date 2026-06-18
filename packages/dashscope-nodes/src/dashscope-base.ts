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

export const DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com";
const WANX_VIDEO_PATH =
  "/api/v1/services/aigc/video-generation/video-synthesis";
const WANX_IMAGE_PATH = "/api/v1/services/aigc/multimodal-generation/generation";
const DASH_SCOPE_TASK_PATH = "/api/v1/tasks";
const DASH_SCOPE_SUCCESS_STATUSES = new Set([
  "succeeded",
  "success",
  "completed",
  "done"
]);
const DASH_SCOPE_FAILURE_STATUSES = new Set([
  "failed",
  "fail",
  "error",
  "canceled",
  "cancelled",
  "unknown"
]);

export interface WanxWaitOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface DashScopeTaskResult {
  taskId: string | undefined;
  status: string;
  mediaUrls: string[];
  message: string | undefined;
}

export interface WanxVideoBodyOptions {
  model: string;
  prompt: string;
  resources?: PromptResourceInput[];
  resolution?: string;
  duration?: number;
  promptExtend?: boolean;
  watermark?: boolean;
  seed?: number;
}

export interface WanxVideoBody extends Record<string, unknown> {
  model: string;
  input: {
    prompt: string;
    media: Record<string, unknown>[];
  };
  parameters?: Record<string, unknown>;
}

export interface WanxImageBodyOptions {
  model: string;
  prompt: string;
  imageUrls?: string[];
  size?: string;
  n?: number;
  watermark?: boolean;
  thinkingMode?: string;
}

export interface WanxImageBody extends Record<string, unknown> {
  model: string;
  input: {
    messages: [
      {
        role: "user";
        content: Record<string, string>[];
      }
    ];
  };
  parameters?: Record<string, unknown>;
}

export function getDashScopeApiKey(secrets: Record<string, string>): string {
  const key = secrets?.DASHSCOPE_API_KEY || process.env.DASHSCOPE_API_KEY || "";
  if (!key) {
    throw new Error("DASHSCOPE_API_KEY is not configured");
  }
  return key;
}

export function dashscopeHeaders(
  apiKey: string,
  asyncTask = false
): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    ...(asyncTask ? { "X-DashScope-Async": "enable" } : {})
  };
}

export function dashscopeCreatePath(path: string): string {
  return new URL(path.startsWith("/") ? path : `/${path}`, DASHSCOPE_BASE_URL)
    .toString();
}

export function buildWanxVideoBody(
  options: WanxVideoBodyOptions
): WanxVideoBody {
  const compiled = compilePromptResources(
    options.prompt,
    options.resources ?? []
  );
  const body: WanxVideoBody = {
    model: options.model,
    input: {
      prompt: compiled.text,
      media: compiled.references.map(wanxVideoMedia)
    }
  };
  const parameters = cleanBody({
    resolution: options.resolution,
    duration: options.duration,
    prompt_extend: options.promptExtend,
    watermark: options.watermark,
    seed: options.seed
  });
  if (Object.keys(parameters).length > 0) {
    body.parameters = parameters;
  }
  return body;
}

function wanxVideoMedia(reference: CompiledPromptReference): Record<string, unknown> {
  const type = wanxVideoMediaType(reference);
  return { type, url: promptResourceUrl(reference) };
}

function wanxVideoMediaType(reference: CompiledPromptReference): string {
  if (reference.type === "audio") {
    throw new Error(
      "Wanxiang video driving audio references are not supported in this first release"
    );
  }
  if (reference.alias === "first_frame") {
    if (reference.type !== "image") {
      throw new Error("Wanxiang first_frame resources must be images");
    }
    return "first_frame";
  }
  if (reference.alias === "last_frame") {
    if (reference.type !== "image") {
      throw new Error("Wanxiang last_frame resources must be images");
    }
    return "last_frame";
  }
  if (reference.alias === "first_clip") {
    if (reference.type !== "video") {
      throw new Error("Wanxiang first_clip resources must be videos");
    }
    return "first_clip";
  }
  throw new Error(
    `Wanxiang video does not support prompt resource ${formatPromptResource(reference)}; use first_frame, last_frame, or first_clip.`
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
    `Wanxiang resource ${formatPromptResource(reference)} must include a URL, data URL, or bytes`
  );
}

function formatPromptResource(reference: CompiledPromptReference): string {
  return reference.alias ? `@${reference.alias}` : reference.marker;
}

export async function submitWanxVideoTask(
  apiKey: string,
  body: Record<string, unknown>
): Promise<string> {
  const response = await fetch(dashscopeCreatePath(WANX_VIDEO_PATH), {
    method: "POST",
    headers: dashscopeHeaders(apiKey, true),
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(
      `Wanxiang video task submit failed: ${response.status} ${await response.text()}`
    );
  }

  const payload = (await response.json()) as unknown;
  const result = parseDashScopeTaskResult(payload);
  if (!result.taskId) {
    throw new Error(
      `Wanxiang video task submit returned no task id: ${JSON.stringify(payload)}`
    );
  }
  return result.taskId;
}

export async function waitForWanxVideoResult(
  apiKey: string,
  taskId: string,
  options: WanxWaitOptions = {}
): Promise<Uint8Array> {
  const result = await pollTask({
    poll: () => queryDashScopeTask(apiKey, taskId),
    isComplete: (value) => DASH_SCOPE_SUCCESS_STATUSES.has(value.status),
    isFailed: (value) =>
      DASH_SCOPE_FAILURE_STATUSES.has(value.status)
        ? (value.message ?? `task ended with status ${value.status}`)
        : undefined,
    intervalMs: options.pollIntervalMs ?? 5_000,
    timeoutMs: options.timeoutMs ?? 30 * 60_000,
    signal: options.signal
  });
  const mediaUrl = result.mediaUrls[0];
  if (!mediaUrl) {
    throw new Error("Wanxiang video task succeeded but returned no media URL");
  }
  return downloadBytes(assertSafeProviderMediaUrl(mediaUrl, "Wanxiang video"));
}

export function parseDashScopeTaskResult(
  payload: unknown
): DashScopeTaskResult {
  const record = asRecord(payload);
  const output = asRecord(record.output);
  const status = (
    stringValue(
      output.task_status ??
        output.status ??
        output.status_name ??
        record.task_status ??
        record.status
    ) ?? ""
  ).toLowerCase();
  const taskId = stringValue(
    output.task_id ??
      output.taskId ??
      output.id ??
      record.task_id ??
      record.taskId ??
      record.id
  );
  const message = stringValue(
    output.message ??
      output.error_message ??
      output.fail_reason ??
      output.reason ??
      asRecord(output.error).message ??
      record.message
  );

  return {
    taskId,
    status,
    mediaUrls: collectMediaUrls(output),
    message
  };
}

async function queryDashScopeTask(
  apiKey: string,
  taskId: string
): Promise<DashScopeTaskResult> {
  const response = await fetch(
    dashscopeCreatePath(`${DASH_SCOPE_TASK_PATH}/${encodeURIComponent(taskId)}`),
    { headers: dashscopeHeaders(apiKey) }
  );
  if (!response.ok) {
    throw new Error(
      `DashScope task query failed: ${response.status} ${await response.text()}`
    );
  }
  return parseDashScopeTaskResult(await response.json());
}

export function buildWanxImageBody(
  options: WanxImageBodyOptions
): WanxImageBody {
  const content: Record<string, string>[] = [
    ...(options.imageUrls ?? []).map((image) => ({ image })),
    { text: options.prompt }
  ];
  const body: WanxImageBody = {
    model: options.model,
    input: {
      messages: [{ role: "user", content }]
    }
  };
  const parameters = cleanBody({
    size: options.size,
    n: options.n,
    watermark: options.watermark,
    thinking_mode: options.thinkingMode
  });
  if (Object.keys(parameters).length > 0) {
    body.parameters = parameters;
  }
  return body;
}

export async function generateWanxImage(
  apiKey: string,
  body: Record<string, unknown>
): Promise<Uint8Array> {
  const response = await fetch(dashscopeCreatePath(WANX_IMAGE_PATH), {
    method: "POST",
    headers: dashscopeHeaders(apiKey),
    body: JSON.stringify(cleanBody(body))
  });
  if (!response.ok) {
    throw new Error(
      `Wanxiang image generation failed: ${response.status} ${await response.text()}`
    );
  }

  const payload = (await response.json()) as unknown;
  const imageUrl = collectWanxImageUrls(payload)[0];
  if (!imageUrl) {
    throw new Error(
      `Wanxiang image generation returned no image URL: ${JSON.stringify(payload)}`
    );
  }
  return downloadBytes(assertSafeProviderMediaUrl(imageUrl, "Wanxiang image"));
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

function collectWanxImageUrls(payload: unknown): string[] {
  const output = asRecord(asRecord(payload).output);
  const choices = Array.isArray(output.choices) ? output.choices : [];
  const urls: string[] = [];
  for (const choice of choices) {
    const message = asRecord(asRecord(choice).message);
    const content = Array.isArray(message.content) ? message.content : [];
    for (const item of content) {
      const image = stringValue(asRecord(item).image);
      if (image) {
        urls.push(image);
      }
    }
  }
  return urls;
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

  const ipv4 = parseIpv4InetAton(hostname);
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
  const mappedIpv4 = hostname.match(/^::ffff:(.+)$/);
  if (mappedIpv4) {
    const ipv4 = parseIpv4InetAton(mappedIpv4[1] ?? "");
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
