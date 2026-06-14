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

export interface MorpheusToolDescriptor {
  name: string;
  description?: string;
  parameters: unknown;
}

export interface MorpheusClientLike {
  createSession(agentId: string, userId: string): Promise<{ id: string }>;
  streamPrompt(options: {
    sessionId: string;
    prompt: string;
    signal?: AbortSignal;
    tools?: MorpheusToolDescriptor[];
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

const toMorpheusTools = (
  manifest: FrontendToolManifest[],
): MorpheusToolDescriptor[] =>
  manifest.map((entry) => ({
    name: entry.name,
    description: entry.description,
    parameters: entry.parameters ?? {
      type: "object",
      properties: {},
    },
  }));

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
      out.push(msg);
      onMessage?.(msg);
    };

    const textState: { uuid: string | null; buffer: string } = {
      uuid: null,
      buffer: "",
    };

    try {
      const remoteSessionId = await this.ensureRemoteSession();
      const signal = this.abortController.signal;
      const stream = this.options.client.streamPrompt({
        sessionId: remoteSessionId,
        prompt: message,
        signal,
        tools: toMorpheusTools(manifest),
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

        try {
          const result = await this.executeToolWithAbort(
            transport,
            sessionId,
            event,
            signal,
          );
          emit({
            type: "result",
            uuid: event.id,
            session_id: sessionId,
            subtype: "tool_result",
            text: stringifyToolResult(result),
            is_error: false,
          });
        } catch (error) {
          const errMsg = error instanceof Error ? error.message : String(error);
          emit({
            type: "result",
            uuid: event.id,
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
      return await raceWithAbort(
        Promise.resolve().then(() =>
          transport.executeTool(
            sessionId,
            event.id,
            event.name,
            event.arguments,
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
      resumeSessionId: options.resumeSessionId,
    });
  }

  async listSessions(
    _options: AgentListSessionsRequest,
    _userId: string,
  ): Promise<AgentSessionInfoEntry[]> {
    return [];
  }

  async getSessionMessages(
    _options: AgentGetSessionMessagesRequest,
    _userId: string,
  ): Promise<AgentTranscriptMessage[]> {
    return [];
  }
}
