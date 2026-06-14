import { randomUUID } from "node:crypto";

export type MorpheusThinkingLevel =
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "off";

export interface MorpheusAttachment {
  id: string;
  type: "image" | "file";
  url: string;
  mimeType?: string;
  name?: string;
  metadata?: Record<string, unknown>;
}

export interface MorpheusClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetchFn?: FetchLike;
}

export type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

export interface MorpheusSession {
  id: string;
  agentName?: string;
  raw: Record<string, unknown>;
}

export interface MorpheusCreateSessionOptions {
  agentName?: string;
  signal?: AbortSignal;
}

export interface MorpheusPromptStreamRequest {
  query: string;
  sessionId?: string;
  agentName?: string;
  thinkingLevel?: MorpheusThinkingLevel;
  attachments?: MorpheusAttachment[];
  signal?: AbortSignal;
}

export type MorpheusStreamEvent =
  | { type: "session"; sessionId: string }
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | {
      type: "tool_call";
      id: string;
      name: string;
      arguments: Record<string, unknown>;
      workDescription?: string;
    }
  | {
      type: "tool_result";
      id: string;
      name: string;
      result: unknown;
      isError: boolean;
      details?: unknown;
    }
  | { type: "agent_end"; messages: unknown[] }
  | { type: "done" }
  | { type: "error"; message: string; code?: string };

export class MorpheusClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchFn: FetchLike;

  constructor(options: MorpheusClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetchFn ?? getGlobalFetch();
  }

  async createSession(
    options: MorpheusCreateSessionOptions = {},
  ): Promise<MorpheusSession> {
    const response = await this.fetchFn(this.url("/api/v1/sessions"), {
      method: "POST",
      headers: this.jsonHeaders(),
      body: JSON.stringify(
        compactRecord({
          agentName: options.agentName,
        }),
      ),
      signal: options.signal,
    });

    await assertOk(response);
    const data = await readJsonObject(response);
    const id = getString(data, ["id", "sessionId"]);
    if (!id) {
      throw new Error("Morpheus createSession response did not include an id");
    }
    return {
      id,
      agentName: getString(data, ["agentName"]),
      raw: data,
    };
  }

  async *streamPrompt(
    request: MorpheusPromptStreamRequest,
  ): AsyncGenerator<MorpheusStreamEvent> {
    const response = await this.fetchFn(this.url("/api/v1/prompt/stream"), {
      method: "POST",
      headers: this.sseHeaders(),
      body: JSON.stringify(
        compactRecord({
          query: request.query,
          sessionId: request.sessionId,
          agentName: request.agentName,
          thinkingLevel: request.thinkingLevel,
          attachments: request.attachments,
        }),
      ),
      signal: request.signal,
    });

    await assertOk(response);
    if (!response.body) {
      throw new Error("Morpheus stream response did not include a body");
    }

    yield* parseMorpheusSseStream(response.body);
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  private jsonHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }
    return headers;
  }

  private sseHeaders(): Record<string, string> {
    return {
      ...this.jsonHeaders(),
      Accept: "text/event-stream",
    };
  }
}

export async function* parseMorpheusSseStream(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<MorpheusStreamEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) {
        break;
      }
      buffer += decoder.decode(result.value, { stream: true });
      let boundary = findFrameBoundary(buffer);
      while (boundary) {
        const frame = buffer.slice(0, boundary.index);
        buffer = buffer.slice(boundary.index + boundary.length);
        const event = parseMorpheusSseFrame(frame);
        if (event) {
          yield event;
        }
        boundary = findFrameBoundary(buffer);
      }
    }

    buffer += decoder.decode();
    if (buffer.trim().length > 0) {
      const event = parseMorpheusSseFrame(buffer);
      if (event) {
        yield event;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function parseMorpheusSseFrame(
  frame: string,
): MorpheusStreamEvent | null {
  const { eventName, dataText } = parseSseFrameParts(frame);
  const trimmedData = dataText.trim();

  if (!eventName && trimmedData.length === 0) {
    return null;
  }
  if (eventName === "done" || trimmedData === "[DONE]") {
    return { type: "done" };
  }

  const payloadResult =
    trimmedData.length > 0 ? parseJsonObject(trimmedData) : {};
  if (payloadResult instanceof Error) {
    return {
      type: "error",
      message: `Invalid Morpheus SSE payload: ${payloadResult.message}`,
    };
  }

  const payload = payloadResult;
  const type = eventName ?? getString(payload, ["type", "event"]);
  if (!type) {
    return null;
  }

  switch (type) {
    case "session":
      return parseSessionEvent(payload);
    case "text_delta":
    case "text":
      return parseTextDeltaEvent(payload);
    case "thinking_delta":
    case "thinking":
      return parseThinkingDeltaEvent(payload);
    case "tool_start":
    case "toolcall_end":
    case "tool_call":
      return parseToolCallEvent(payload);
    case "tool_end":
    case "tool_result":
      return parseToolResultEvent(payload);
    case "agent_end":
      return {
        type: "agent_end",
        messages: Array.isArray(payload.messages) ? payload.messages : [],
      };
    case "error":
      return parseErrorEvent(payload);
    case "done":
      return { type: "done" };
    default:
      return null;
  }
}

function getGlobalFetch(): FetchLike {
  if (typeof globalThis.fetch !== "function") {
    throw new Error("MorpheusClient requires a fetch implementation");
  }
  return globalThis.fetch.bind(globalThis);
}

function compactRecord(
  record: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  );
}

async function assertOk(response: Response): Promise<void> {
  if (response.ok) {
    return;
  }
  const message = await readErrorMessage(response);
  throw new Error(`Morpheus request failed (${response.status}): ${message}`);
}

async function readErrorMessage(response: Response): Promise<string> {
  const fallback = response.statusText || "HTTP error";
  try {
    const data = await response.json();
    const record = asRecord(data);
    if (!record) {
      return fallback;
    }
    const direct = getString(record, ["message"]);
    if (direct) {
      return direct;
    }
    const error = asRecord(record.error);
    if (error) {
      return getString(error, ["message"]) ?? fallback;
    }
    if (typeof record.error === "string") {
      return record.error;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

async function readJsonObject(response: Response): Promise<Record<string, unknown>> {
  const data = await response.json();
  const record = asRecord(data);
  if (!record) {
    throw new Error("Morpheus response was not a JSON object");
  }
  return record;
}

function findFrameBoundary(
  buffer: string,
): { index: number; length: number } | null {
  const lf = buffer.indexOf("\n\n");
  const crlf = buffer.indexOf("\r\n\r\n");
  if (lf === -1 && crlf === -1) {
    return null;
  }
  if (lf === -1) {
    return { index: crlf, length: 4 };
  }
  if (crlf === -1) {
    return { index: lf, length: 2 };
  }
  return crlf < lf
    ? { index: crlf, length: 4 }
    : { index: lf, length: 2 };
}

function parseSseFrameParts(frame: string): {
  eventName?: string;
  dataText: string;
} {
  let eventName: string | undefined;
  const dataLines: string[] = [];

  for (const line of frame.split(/\r?\n/)) {
    if (line.length === 0 || line.startsWith(":")) {
      continue;
    }
    const colon = line.indexOf(":");
    if (colon === -1) {
      continue;
    }
    const field = line.slice(0, colon);
    const value = line.slice(colon + 1).replace(/^ /, "");
    if (field === "event") {
      eventName = value.trim();
    } else if (field === "data") {
      dataLines.push(value);
    }
  }

  return {
    eventName,
    dataText: dataLines.join("\n"),
  };
}

function parseJsonObject(data: string): Record<string, unknown> | Error {
  try {
    const parsed = JSON.parse(data);
    const record = asRecord(parsed);
    if (!record) {
      return new Error("payload is not a JSON object");
    }
    return record;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

function parseSessionEvent(
  payload: Record<string, unknown>,
): MorpheusStreamEvent | null {
  const sessionId = getString(payload, ["sessionId", "id"]);
  return sessionId ? { type: "session", sessionId } : null;
}

function parseTextDeltaEvent(
  payload: Record<string, unknown>,
): MorpheusStreamEvent | null {
  const text = getString(payload, ["delta", "text", "content", "message"]);
  return text !== undefined ? { type: "text_delta", text } : null;
}

function parseThinkingDeltaEvent(
  payload: Record<string, unknown>,
): MorpheusStreamEvent | null {
  const text = getString(payload, [
    "delta",
    "thinking",
    "text",
    "content",
    "message",
  ]);
  return text !== undefined ? { type: "thinking_delta", text } : null;
}

function parseToolCallEvent(
  payload: Record<string, unknown>,
): MorpheusStreamEvent | null {
  const toolCall = getToolCallRecord(payload);
  const toolFunction = toolCall ? asRecord(toolCall.function) : null;
  const id =
    getString(payload, ["toolCallId", "id"]) ??
    (toolCall ? getString(toolCall, ["id"]) : undefined) ??
    randomUUID();
  const name =
    getString(payload, ["toolName", "name"]) ??
    (toolFunction ? getString(toolFunction, ["name"]) : undefined) ??
    (toolCall ? getString(toolCall, ["name", "toolName"]) : undefined);

  if (!name) {
    return null;
  }

  const rawArguments =
    payload.arguments ??
    (toolFunction ? toolFunction.arguments : undefined) ??
    (toolCall ? toolCall.arguments : undefined);
  const event: Extract<MorpheusStreamEvent, { type: "tool_call" }> = {
    type: "tool_call",
    id,
    name,
    arguments: parseArguments(rawArguments),
  };
  const workDescription = getString(payload, ["workDescription"]);
  if (workDescription) {
    event.workDescription = workDescription;
  }
  return event;
}

function parseToolResultEvent(
  payload: Record<string, unknown>,
): MorpheusStreamEvent | null {
  const id = getString(payload, ["toolCallId", "id"]) ?? randomUUID();
  const name = getString(payload, ["toolName", "name"]) ?? "";
  const event: Extract<MorpheusStreamEvent, { type: "tool_result" }> = {
    type: "tool_result",
    id,
    name,
    result: payload.result,
    isError: payload.isError === true,
  };
  if ("details" in payload) {
    event.details = payload.details;
  }
  return event;
}

function parseErrorEvent(
  payload: Record<string, unknown>,
): MorpheusStreamEvent {
  const nested = asRecord(payload.error);
  const code =
    getString(payload, ["code"]) ??
    (nested ? getString(nested, ["code"]) : undefined);
  const message =
    getString(payload, ["message"]) ??
    (nested ? getString(nested, ["message"]) : undefined) ??
    (typeof payload.error === "string" ? payload.error : undefined) ??
    "Morpheus stream error";

  const event: Extract<MorpheusStreamEvent, { type: "error" }> = {
    type: "error",
    message,
  };
  if (code) {
    event.code = code;
  }
  return event;
}

function getToolCallRecord(
  payload: Record<string, unknown>,
): Record<string, unknown> | null {
  const direct = asRecord(payload.toolCall);
  if (direct) {
    return direct;
  }
  const partial = asRecord(payload.partial);
  const toolCalls = partial?.tool_calls;
  if (Array.isArray(toolCalls)) {
    const first = asRecord(toolCalls[0]);
    if (first) {
      return first;
    }
  }
  return null;
}

function parseArguments(value: unknown): Record<string, unknown> {
  const record = asRecord(value);
  if (record) {
    return record;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    return {};
  }
  try {
    const parsed = JSON.parse(value);
    return asRecord(parsed) ?? { raw: value };
  } catch {
    return { raw: value };
  }
}

function getString(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string") {
      return value;
    }
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}
