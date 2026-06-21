import type { FrontendToolManifest } from "./types.js";

export interface MorpheusClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetchFn?: typeof fetch;
}

export interface MorpheusSession {
  id: string;
}

export type MorpheusStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | {
      type: "tool_call";
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }
  | { type: "done" }
  | { type: "error"; message: string };

export interface StreamPromptOptions {
  agentId: string;
  sessionId: string;
  prompt: string;
  tools?: FrontendToolManifest[];
  signal?: AbortSignal;
}

export interface SubmitToolResultOptions {
  agentId: string;
  sessionId: string;
  toolCallId: string;
  name: string;
  result?: unknown;
  isError?: boolean;
  error?: string;
  signal?: AbortSignal;
}

interface MorpheusEnvelope {
  event?: unknown;
  type?: unknown;
  data?: unknown;
  delta?: unknown;
  message?: unknown;
  toolCall?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringValue = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const recordValue = (value: unknown): Record<string, unknown> => {
  if (isRecord(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return {};
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
};

const jsonHeaders = (apiKey?: string): Record<string, string> => {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  if (apiKey !== undefined && apiKey.length > 0) {
    headers["X-API-Key"] = apiKey;
  }

  return headers;
};

const responseText = async (response: Response) => {
  try {
    return await response.text();
  } catch {
    // Response bodies can already be consumed; statusText is enough context.
    return response.statusText;
  }
};

export const parseMorpheusSseFrame = (
  frame: string,
): MorpheusStreamEvent | null => {
  const dataLines = frame
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => {
      const data = line.slice("data:".length);
      return data.startsWith(" ") ? data.slice(1) : data;
    });

  if (dataLines.length === 0) {
    return null;
  }

  const payload = JSON.parse(dataLines.join("\n")) as MorpheusEnvelope;
  const payloadRecord = payload as Record<string, unknown>;
  const data = isRecord(payload.data) ? payload.data : payloadRecord;
  const eventType =
    typeof payload.event === "string" ? payload.event : payload.type;

  switch (eventType) {
    case "text_delta":
      return {
        type: "text_delta",
        text: stringValue(data.delta ?? data.text),
      };
    case "thinking_delta":
      return {
        type: "thinking_delta",
        text: stringValue(data.delta ?? data.text),
      };
    case "tool_call":
    case "toolcall_end": {
      const toolCall = isRecord(data.toolCall) ? data.toolCall : data;
      const args = toolCall.arguments ?? {};
      const id =
        typeof toolCall.id === "string" ? toolCall.id : crypto.randomUUID();
      return {
        type: "tool_call",
        id,
        name: stringValue(toolCall.name),
        arguments: recordValue(args),
      };
    }
    case "done":
      return { type: "done" };
    case "error":
      return {
        type: "error",
        message: stringValue(data.message ?? data.error, "Morpheus stream error"),
      };
    default:
      return null;
  }
};

export class MorpheusClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: MorpheusClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetchFn ?? fetch;
  }

  async createSession(agentId: string, userId: string): Promise<MorpheusSession> {
    const response = await this.fetchFn(`${this.baseUrl}/api/v1/sessions`, {
      method: "POST",
      headers: jsonHeaders(this.apiKey),
      body: JSON.stringify({ agentId, userId }),
    });

    if (!response.ok) {
      const body = await responseText(response);
      throw new Error(
        `Create Morpheus session failed: ${response.status} ${body}`,
      );
    }

    const payload = (await response.json()) as {
      id?: unknown;
      sessionId?: unknown;
    };
    const id = stringValue(payload.id ?? payload.sessionId);

    if (id.length === 0) {
      throw new Error("Morpheus createSession response missing session id");
    }

    return { id };
  }

  async submitToolResult(options: SubmitToolResultOptions): Promise<void> {
    const response = await this.fetchFn(`${this.baseUrl}/api/v1/tool-results`, {
      method: "POST",
      headers: jsonHeaders(this.apiKey),
      body: JSON.stringify({
        agentId: options.agentId,
        sessionId: options.sessionId,
        toolCallId: options.toolCallId,
        name: options.name,
        result: options.result,
        isError: options.isError === true,
        ...(options.error ? { error: options.error } : {}),
      }),
      signal: options.signal,
    });

    if (!response.ok) {
      const body = await responseText(response);
      throw new Error(
        `Submit Morpheus tool result failed: ${response.status} ${body}`,
      );
    }
  }

  async *streamPrompt(
    options: StreamPromptOptions,
  ): AsyncGenerator<MorpheusStreamEvent> {
    const response = await this.fetchFn(
      `${this.baseUrl}/api/v1/prompt/stream`,
      {
        method: "POST",
        headers: jsonHeaders(this.apiKey),
        body: JSON.stringify({
          query: options.prompt,
          sessionId: options.sessionId,
          agentId: options.agentId,
          ...(options.tools ? { tools: options.tools } : {}),
        }),
        signal: options.signal,
      },
    );

    if (!response.ok) {
      const body = await responseText(response);
      throw new Error(
        `Stream Morpheus prompt failed: ${response.status} ${body}`,
      );
    }

    if (response.body === null) {
      throw new Error("Morpheus stream response missing response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let reachedEof = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          reachedEof = true;
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        let boundary = buffer.search(/\r?\n\r?\n/);
        while (boundary !== -1) {
          const frame = buffer.slice(0, boundary);
          const match = buffer.slice(boundary).match(/^\r?\n\r?\n/);
          const separatorLength = match?.[0].length ?? 2;
          buffer = buffer.slice(boundary + separatorLength);

          const event = parseMorpheusSseFrame(frame);
          if (event !== null) {
            yield event;
          }

          boundary = buffer.search(/\r?\n\r?\n/);
        }
      }

      buffer += decoder.decode();
      if (buffer.trim().length > 0) {
        const event = parseMorpheusSseFrame(buffer);
        if (event !== null) {
          yield event;
        }
      }
    } finally {
      if (!reachedEof) {
        await reader.cancel().catch(() => undefined);
      }
      reader.releaseLock();
    }
  }
}
