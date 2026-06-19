import {
  compilePromptResources,
  downloadProviderMediaBytes,
  fetchProviderResponseWithRetries,
  pollTask,
  type CompiledPromptReference,
  type PromptResourceInput
} from "../china-media.js";

export const KLING_BASE_URL = "https://api-beijing.klingai.com";
export const KLING_IMAGE_TO_VIDEO_MODEL = "kling-v3-0-turbo";
export const KLING_IMAGE_TO_VIDEO_MODELS = [KLING_IMAGE_TO_VIDEO_MODEL];
export const KLING_IMAGE_TO_VIDEO_PATH = "/v1/videos/image2video";

export interface KlingImageToVideoBodyOptions {
  model: string;
  prompt: string;
  firstFrameUrl: string;
  resolution: string;
  duration: number;
  resources?: PromptResourceInput[];
  callbackUrl?: string;
  externalTaskId?: string;
  watermarkInfo?: Record<string, unknown>;
}

export interface KlingSubmitTaskOptions {
  apiKey: string;
  path: string;
  body: Record<string, unknown>;
}

export interface KlingWaitOptions {
  pollIntervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface KlingTaskResult {
  taskId: string | undefined;
  status: string;
  mediaUrls: string[];
  message: string | undefined;
}

export function getKlingApiKey(secrets: Record<string, string>): string {
  const key = secrets?.KLING_API_KEY || process.env.KLING_API_KEY || "";
  if (!key) {
    throw new Error("KLING_API_KEY is not configured");
  }
  return key;
}

export function klingHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json"
  };
}

export function klingCreatePath(
  path: string,
  query?: Record<string, string>
): string {
  const url = new URL(path.startsWith("/") ? path : `/${path}`, KLING_BASE_URL);
  for (const [key, value] of Object.entries(query ?? {})) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

export function buildKlingImageToVideoBody(
  options: KlingImageToVideoBodyOptions
): Record<string, unknown> {
  const compiled = compilePromptResources(
    options.prompt,
    options.resources ?? []
  );
  for (const reference of compiled.references) {
    assertKlingPromptReference(reference);
  }

  return cleanBody({
    model_name: options.model,
    image: klingImageValue(options.firstFrameUrl),
    prompt: compiled.text,
    mode: klingModeFromResolution(options.resolution),
    duration: options.duration,
    callback_url: options.callbackUrl,
    external_task_id: options.externalTaskId,
    watermark_info: options.watermarkInfo
  });
}

function klingImageValue(value: string): string {
  const match = /^data:[^,]*;base64,(.*)$/i.exec(value);
  return match ? match[1] : value;
}

function assertKlingPromptReference(
  reference: CompiledPromptReference
): void {
  throw new Error(
    `Kling image-to-video does not support prompt resource ${formatPromptResource(reference)}; use the first-frame image input instead.`
  );
}

function formatPromptResource(reference: CompiledPromptReference): string {
  return reference.alias ? `@${reference.alias}` : reference.marker;
}

export async function submitKlingTask(
  options: KlingSubmitTaskOptions
): Promise<string> {
  const response = await fetch(klingCreatePath(options.path), {
    method: "POST",
    headers: klingHeaders(options.apiKey),
    body: JSON.stringify(options.body)
  });
  if (!response.ok) {
    throw new Error(
      `Kling task submit failed: ${response.status} ${await response.text()}`
    );
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const result = parseKlingTaskResult(payload);
  if (!result.taskId) {
    throw new Error(
      `Kling task submit returned no task id: ${JSON.stringify(payload)}`
    );
  }
  return result.taskId;
}

export async function waitForKlingResult(
  apiKey: string,
  taskId: string,
  options: KlingWaitOptions = {}
): Promise<Uint8Array> {
  const result = await pollTask({
    poll: () => queryKlingTask(apiKey, taskId),
    isComplete: (value) => isKlingSucceeded(value.status),
    isFailed: (value) =>
      isKlingFailed(value.status)
        ? (value.message ?? `task ended with status ${value.status}`)
        : undefined,
    intervalMs: options.pollIntervalMs ?? 5_000,
    timeoutMs: options.timeoutMs ?? 30 * 60_000,
    signal: options.signal
  });
  const mediaUrl = result.mediaUrls[0];
  if (!mediaUrl) {
    throw new Error("Kling task succeeded but returned no media URL");
  }
  return downloadProviderMediaBytes(mediaUrl, "Kling");
}

export function parseKlingTaskResult(payload: unknown): KlingTaskResult {
  const record = asRecord(payload);
  const data = unwrapData(record);
  const status = (
    stringValue(
      data.status ?? data.task_status ?? data.status_name ?? record.status
    ) ?? ""
  ).toLowerCase();
  const taskId = stringValue(
    data.task_id ??
      data.taskId ??
      data.id ??
      data.external_task_id ??
      record.task_id ??
      record.taskId ??
      record.id
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

async function queryKlingTask(
  apiKey: string,
  taskId: string
): Promise<KlingTaskResult> {
  const response = await fetchProviderResponseWithRetries(
    () =>
      fetch(
        klingCreatePath(
          `${KLING_IMAGE_TO_VIDEO_PATH}/${encodeURIComponent(taskId)}`
        ),
        { headers: klingHeaders(apiKey) }
      )
  );
  if (!response.ok) {
    throw new Error(
      `Kling task query failed: ${response.status} ${await response.text()}`
    );
  }
  return parseKlingTaskResult(await response.json());
}

function isKlingSucceeded(status: string): boolean {
  return status === "succeeded" || status === "success" || status === "succeed";
}

function isKlingFailed(status: string): boolean {
  return status === "failed" || status === "fail" || status === "error";
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

function collectMediaUrls(record: Record<string, unknown>): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      for (const item of value) {
        visit(item);
      }
      return;
    }
    if (!value || typeof value !== "object") {
      return;
    }
    const item = value as Record<string, unknown>;
    for (const key of ["url", "media_url", "video_url", "image_url", "file_url"]) {
      const mediaUrl = stringValue(item[key]);
      if (mediaUrl && !seen.has(mediaUrl)) {
        seen.add(mediaUrl);
        urls.push(mediaUrl);
      }
    }
    for (const key of [
      "outputs",
      "output",
      "result",
      "results",
      "task_result",
      "videos",
      "images"
    ]) {
      visit(item[key]);
    }
  };

  visit(record);
  return urls;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function cleanBody(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    out[key] = value;
  }
  return out;
}

function klingModeFromResolution(resolution: string | undefined): string | undefined {
  const value = resolution?.trim().toLowerCase();
  if (!value) {
    return undefined;
  }
  if (value === "std" || value === "standard" || value.includes("720")) {
    return "std";
  }
  if (value === "pro" || value === "high" || value.includes("1080")) {
    return "pro";
  }
  return undefined;
}
