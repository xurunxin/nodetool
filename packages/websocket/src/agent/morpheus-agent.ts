import { randomUUID } from "node:crypto";
import { createLogger } from "@nodetool-ai/config";

import {
  MorpheusClient,
  type MorpheusClientOptions,
  type MorpheusStreamEvent,
} from "./morpheus-client.js";
import type { AgentTransport } from "./transport.js";
import type {
  AgentGetSessionMessagesRequest,
  AgentListSessionsRequest,
  AgentMessage,
  AgentModelDescriptor,
  AgentSessionInfoEntry,
  AgentTranscriptMessage,
  FrontendToolManifest,
} from "./types.js";
import type { AgentQuerySession, AgentSdkProvider } from "./sdk-provider.js";

const log = createLogger("nodetool.websocket.agent.morpheus");

const DEFAULT_MORPHEUS_AGENT_ID = "nodetool-canvas";
const FORWARD_TO_FRONTEND_TOOL_NAME = "forward_to_frontend";
const NODETOOL_FORWARD_TYPE_PREFIX = "nodetool:";

interface MorpheusTranscriptEntry {
  userId: string;
  agentId: string;
  sessionId: string;
  messages: AgentTranscriptMessage[];
  summary: string;
  firstPrompt?: string;
  createdAt: number;
  lastModified: number;
}

type MorpheusTranscriptStore = Map<string, MorpheusTranscriptEntry>;

export interface MorpheusClientLike {
  createSession(agentId: string, userId: string): Promise<{ id: string }>;
  streamPrompt(options: {
    agentId: string;
    sessionId: string;
    prompt: string;
    tools?: FrontendToolManifest[];
    signal?: AbortSignal;
  }): AsyncIterable<MorpheusStreamEvent>;
}

export interface MorpheusAgentSdkProviderOptions {
  baseUrl?: string;
  apiKey?: string;
  agentId?: string;
  clientFactory?: (options: MorpheusClientOptions) => MorpheusClientLike;
}

const cleanEnvValue = (value: string | undefined): string | undefined => {
  const clean = value?.trim();
  return clean && clean.length > 0 ? clean : undefined;
};

export const isMorpheusAgentConfigured = (): boolean =>
  cleanEnvValue(process.env.MORPHEUS_BASE_URL) !== undefined;

const stringifyToolResult = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "[unserializable]";
  }
};

const morpheusTranscriptKey = (userId: string, sessionId: string): string =>
  `${userId}:${sessionId}`;

const extractTranscriptText = (message: AgentMessage): string => {
  if (typeof message.text === "string" && message.text.trim().length > 0) {
    return message.text;
  }
  if (Array.isArray(message.content)) {
    return message.content
      .filter(
        (block): block is { type: string; text: string } =>
          block.type === "text" &&
          typeof block.text === "string" &&
          block.text.trim().length > 0,
      )
      .map((block) => block.text)
      .join("\n");
  }
  if (message.type === "result" && message.is_error && message.errors?.length) {
    return message.errors.join("\n");
  }
  return "";
};

const abortError = (): Error => new Error("Morpheus tool call aborted");

const raceWithAbort = async <T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> => {
  if (signal.aborted) {
    throw abortError();
  }

  let onAbort: (() => void) | null = null;
  const abortPromise = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(abortError());
    signal.addEventListener("abort", onAbort, { once: true });
  });

  try {
    return await Promise.race([promise, abortPromise]);
  } finally {
    if (onAbort) {
      signal.removeEventListener("abort", onAbort);
    }
  }
};

const parseForwardPayload = (payload: unknown): unknown => {
  if (payload == null || payload === "") {
    return {};
  }
  if (typeof payload !== "string") {
    return payload;
  }
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    throw new Error("Invalid forward_to_frontend payload JSON");
  }
};

const resolveRendererToolDispatch = (
  event: Extract<MorpheusStreamEvent, { type: "tool_call" }>,
): { name: string; args: unknown } => {
  if (event.name !== FORWARD_TO_FRONTEND_TOOL_NAME) {
    throw new Error(`Unsupported Morpheus tool call "${event.name}"`);
  }

  const forwardType = event.arguments.forwardType;
  if (typeof forwardType !== "string") {
    throw new Error("Unsupported forward_to_frontend call missing forwardType");
  }
  if (!forwardType.startsWith(NODETOOL_FORWARD_TYPE_PREFIX)) {
    throw new Error(`Unsupported forward_to_frontend forwardType "${forwardType}"`);
  }

  const name = forwardType.slice(NODETOOL_FORWARD_TYPE_PREFIX.length);
  if (name.length === 0) {
    throw new Error("Unsupported forward_to_frontend call missing tool name");
  }

  return {
    name,
    args: parseForwardPayload(event.arguments.payload),
  };
};

export class MorpheusQuerySession implements AgentQuerySession {
  private closed = false;
  private inFlight = false;
  private abortController: AbortController | null = null;
  private activeTransport: AgentTransport | null = null;
  private activeUiSessionId: string | null = null;
  private activeToolCall = false;
  private remoteSessionId: string | null;

  constructor(
    private readonly options: {
      client: MorpheusClientLike;
      agentId: string;
      userId: string;
      transcripts: MorpheusTranscriptStore;
      resumeSessionId?: string;
    },
  ) {
    this.remoteSessionId = options.resumeSessionId ?? null;
  }

  private async ensureRemoteSession(): Promise<string> {
    if (this.remoteSessionId) {
      return this.remoteSessionId;
    }
    const session = await this.options.client.createSession(
      this.options.agentId,
      this.options.userId,
    );
    this.remoteSessionId = session.id;
    return session.id;
  }

  private ensureTranscriptEntry(
    sessionId: string,
    firstPrompt?: string,
  ): MorpheusTranscriptEntry {
    const key = morpheusTranscriptKey(this.options.userId, sessionId);
    const existing = this.options.transcripts.get(key);
    const now = Date.now();
    if (existing) {
      if (!existing.firstPrompt && firstPrompt) {
        existing.firstPrompt = firstPrompt;
      }
      existing.lastModified = now;
      return existing;
    }

    const entry: MorpheusTranscriptEntry = {
      userId: this.options.userId,
      agentId: this.options.agentId,
      sessionId,
      messages: [],
      summary: firstPrompt ?? sessionId,
      firstPrompt,
      createdAt: now,
      lastModified: now,
    };
    this.options.transcripts.set(key, entry);
    return entry;
  }

  private recordUserTranscriptMessage(sessionId: string, text: string): void {
    if (text.trim().length === 0) {
      return;
    }
    const entry = this.ensureTranscriptEntry(sessionId, text);
    entry.messages.push({
      type: "user",
      uuid: randomUUID(),
      session_id: sessionId,
      text,
    });
    entry.lastModified = Date.now();
  }

  private recordTranscriptMessage(sessionId: string, message: AgentMessage): void {
    if (message.type !== "assistant" && message.type !== "result") {
      return;
    }
    const text = extractTranscriptText(message);
    if (text.trim().length === 0) {
      return;
    }

    const entry = this.ensureTranscriptEntry(sessionId);
    const transcriptMessage: AgentTranscriptMessage = {
      type: "assistant",
      uuid: message.uuid,
      session_id: sessionId,
      text,
    };
    const existingIndex = entry.messages.findIndex(
      (candidate) => candidate.uuid === message.uuid,
    );
    if (existingIndex === -1) {
      entry.messages.push(transcriptMessage);
    } else {
      entry.messages[existingIndex] = transcriptMessage;
    }
    entry.summary = text;
    entry.lastModified = Date.now();
  }

  async send(
    message: string,
    transport: AgentTransport | null,
    sessionId: string,
    manifest: FrontendToolManifest[],
    onMessage?: (message: AgentMessage) => void,
    _mcpServerUrl?: string | null,
  ): Promise<AgentMessage[]> {
    if (this.closed) {
      throw new Error("Cannot send to a closed session");
    }
    if (this.inFlight) {
      throw new Error("A Morpheus request is already in progress for this session");
    }
    if (!transport) {
      throw new Error("Morpheus sessions require an active transport");
    }

    this.inFlight = true;
    this.abortController = new AbortController();
    this.activeTransport = transport;
    this.activeUiSessionId = sessionId;
    const out: AgentMessage[] = [];
    const emit = (msg: AgentMessage) => {
      this.recordTranscriptMessage(sessionId, msg);
      out.push(msg);
      onMessage?.(msg);
    };

    const textState: { uuid: string | null; buffer: string } = {
      uuid: null,
      buffer: "",
    };

    try {
      const remoteSessionId = await this.ensureRemoteSession();
      this.recordUserTranscriptMessage(sessionId, message);
      const signal = this.abortController.signal;
      const stream = this.options.client.streamPrompt({
        agentId: this.options.agentId,
        sessionId: remoteSessionId,
        prompt: message,
        tools: manifest,
        signal,
      });

      for await (const event of stream) {
        if (signal.aborted) {
          break;
        }
        if (event.type === "done") {
          emit({
            type: "result",
            uuid: randomUUID(),
            session_id: sessionId,
            subtype: "success",
            is_error: false,
          });
          break;
        }
        if (event.type === "error") {
          emit({
            type: "result",
            uuid: randomUUID(),
            session_id: sessionId,
            subtype: "error",
            is_error: true,
            errors: [event.message],
          });
          break;
        }
        await this.handleStreamEvent(
          event,
          transport,
          sessionId,
          this.abortController.signal,
          emit,
          textState,
        );
      }
    } catch (error) {
      if (this.abortController.signal.aborted) {
        log.info("Morpheus turn was interrupted");
        return out;
      }
      const errMsg = error instanceof Error ? error.message : String(error);
      log.error(
        `Morpheus agent session ${sessionId} failed`,
        error instanceof Error ? error : new Error(errMsg),
      );
      emit({
        type: "result",
        uuid: randomUUID(),
        session_id: sessionId,
        subtype: "error",
        is_error: true,
        errors: [errMsg],
      });
    } finally {
      this.inFlight = false;
      this.abortController = null;
      this.activeTransport = null;
      this.activeUiSessionId = null;
      this.activeToolCall = false;
    }

    return out;
  }

  private async handleStreamEvent(
    event: MorpheusStreamEvent,
    transport: AgentTransport,
    sessionId: string,
    signal: AbortSignal,
    emit: (message: AgentMessage) => void,
    textState: {
      uuid: string | null;
      buffer: string;
    },
  ): Promise<void> {
    switch (event.type) {
      case "text_delta": {
        textState.uuid ??= randomUUID();
        textState.buffer += event.text;
        emit({
          type: "assistant",
          uuid: textState.uuid,
          session_id: sessionId,
          text: textState.buffer,
          content: [{ type: "text", text: textState.buffer }],
        });
        return;
      }
      case "thinking_delta": {
        emit({
          type: "stream_event",
          uuid: randomUUID(),
          session_id: sessionId,
          text: event.text,
          event_type: "thinking_delta",
          event: { type: "thinking_delta", text: event.text },
          agent_execution_id: `morpheus-agent-${sessionId}`,
        });
        return;
      }
      case "tool_call": {
        textState.uuid = null;
        textState.buffer = "";
        emit({
          type: "assistant",
          uuid: event.id,
          session_id: sessionId,
          content: [],
          tool_calls: [
            {
              id: event.id,
              type: "function",
              function: {
                name: event.name,
                arguments: JSON.stringify(event.arguments ?? {}),
              },
            },
          ],
        });

        if (event.name !== FORWARD_TO_FRONTEND_TOOL_NAME) {
          return;
        }

        try {
          const result = await this.executeToolWithAbort(
            transport,
            sessionId,
            event,
            signal,
          );
          emit({
            type: "result",
            uuid: randomUUID(),
            session_id: sessionId,
            subtype: "tool_result",
            text: stringifyToolResult(result),
            is_error: false,
          });
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          emit({
            type: "result",
            uuid: randomUUID(),
            session_id: sessionId,
            subtype: "tool_result",
            text: `Error: ${errMsg}`,
            is_error: true,
            errors: [errMsg],
          });
        }
        return;
      }
      case "done":
      case "error":
        return;
    }
  }

  private async executeToolWithAbort(
    transport: AgentTransport,
    sessionId: string,
    event: Extract<MorpheusStreamEvent, { type: "tool_call" }>,
    signal: AbortSignal,
  ): Promise<unknown> {
    this.activeToolCall = true;
    try {
      const dispatch = resolveRendererToolDispatch(event);
      return await raceWithAbort(
        Promise.resolve().then(() =>
          transport.executeTool(
            sessionId,
            event.id,
            dispatch.name,
            dispatch.args,
          ),
        ),
        signal,
      );
    } finally {
      this.activeToolCall = false;
    }
  }

  private abortActiveWork(): void {
    this.abortController?.abort();
    if (
      !this.activeToolCall ||
      !this.activeTransport ||
      !this.activeUiSessionId
    ) {
      return;
    }
    try {
      this.activeTransport.abortTools(this.activeUiSessionId);
    } catch (error) {
      log.warn(
        `Failed to abort Morpheus renderer tools: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async interrupt(): Promise<void> {
    this.abortActiveWork();
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.abortActiveWork();
  }
}

export class MorpheusAgentSdkProvider implements AgentSdkProvider {
  readonly name = "morpheus";

  private readonly transcripts: MorpheusTranscriptStore = new Map();

  private readonly clientFactory: (
    options: MorpheusClientOptions,
  ) => MorpheusClientLike;

  constructor(private readonly options: MorpheusAgentSdkProviderOptions = {}) {
    this.clientFactory =
      options.clientFactory ??
      ((clientOptions) => new MorpheusClient(clientOptions));
  }

  private resolveBaseUrl(): string | undefined {
    return cleanEnvValue(this.options.baseUrl ?? process.env.MORPHEUS_BASE_URL);
  }

  private requireBaseUrl(): string {
    const baseUrl = this.resolveBaseUrl();
    if (!baseUrl) {
      throw new Error(
        "MORPHEUS_BASE_URL is required to use the Morpheus agent provider",
      );
    }
    return baseUrl;
  }

  private resolveApiKey(): string | undefined {
    return cleanEnvValue(this.options.apiKey ?? process.env.MORPHEUS_API_KEY);
  }

  private resolveAgentId(model?: string): string {
    return (
      cleanEnvValue(this.options.agentId ?? process.env.MORPHEUS_AGENT_ID) ??
      cleanEnvValue(model) ??
      DEFAULT_MORPHEUS_AGENT_ID
    );
  }

  async listModels(
    _userId: string,
    _workspacePath?: string,
  ): Promise<AgentModelDescriptor[]> {
    if (!this.resolveBaseUrl()) {
      return [];
    }
    return [
      {
        id: this.resolveAgentId(),
        label: "Morpheus Canvas Agent",
        provider: "morpheus",
        isDefault: true,
      },
    ];
  }

  createSession(options: {
    model: string;
    workspacePath: string;
    userId: string;
    resumeSessionId?: string;
  }): AgentQuerySession {
    if (!options.userId) {
      throw new Error("Morpheus agent session requires an authenticated userId");
    }
    const baseUrl = this.requireBaseUrl();
    return new MorpheusQuerySession({
      client: this.clientFactory({
        baseUrl,
        apiKey: this.resolveApiKey(),
      }),
      agentId: this.resolveAgentId(options.model),
      userId: options.userId,
      transcripts: this.transcripts,
      resumeSessionId: options.resumeSessionId,
    });
  }

  async listSessions(
    options: AgentListSessionsRequest,
    userId: string,
  ): Promise<AgentSessionInfoEntry[]> {
    const offset = options.offset ?? 0;
    const limit = options.limit ?? 50;
    return [...this.transcripts.values()]
      .filter((entry) => entry.userId === userId)
      .sort((a, b) => b.lastModified - a.lastModified)
      .slice(offset, offset + limit)
      .map((entry) => ({
        sessionId: entry.sessionId,
        summary: entry.summary,
        lastModified: entry.lastModified,
        firstPrompt: entry.firstPrompt,
        createdAt: entry.createdAt,
        provider: "morpheus" as const,
      }));
  }

  async getSessionMessages(
    options: AgentGetSessionMessagesRequest,
    userId: string,
  ): Promise<AgentTranscriptMessage[]> {
    const entry = this.transcripts.get(
      morpheusTranscriptKey(userId, options.sessionId),
    );
    if (!entry || entry.userId !== userId) {
      return [];
    }
    return entry.messages.map((message) => ({ ...message }));
  }
}
