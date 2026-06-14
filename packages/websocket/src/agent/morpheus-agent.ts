import { randomUUID } from "node:crypto";
import { createLogger } from "@nodetool-ai/config";
import {
  MorpheusClient,
  type MorpheusCreateSessionOptions,
  type MorpheusPromptStreamRequest,
  type MorpheusSession,
  type MorpheusStreamEvent,
} from "./morpheus-client.js";
import type { AgentTransport } from "./transport.js";
import type {
  AgentGetSessionMessagesRequest,
  AgentListSessionsRequest,
  AgentMessage,
  AgentModelDescriptor,
  AgentModelParams,
  AgentSessionInfoEntry,
  AgentTranscriptMessage,
  FrontendToolManifest,
} from "./types.js";
import type { AgentQuerySession, AgentSdkProvider } from "./sdk-provider.js";

const log = createLogger("nodetool.websocket.agent.morpheus");

export const MORPHEUS_DEFAULT_AGENT_NAME = "nodetool-canvas";
const MORPHEUS_DEFAULT_BASE_URL = "http://localhost:3000";

type MorpheusEnv = Record<string, string | undefined>;

export interface MorpheusAgentClient {
  createSession(options?: MorpheusCreateSessionOptions): Promise<MorpheusSession>;
  streamPrompt(
    request: MorpheusPromptStreamRequest,
  ): AsyncGenerator<MorpheusStreamEvent>;
}

interface MorpheusAgentConfig {
  baseUrl: string;
  apiKey?: string;
  agentName: string;
}

interface MorpheusAgentProviderOptions {
  env?: MorpheusEnv;
  clientFactory?: (config: MorpheusAgentConfig) => MorpheusAgentClient;
}

interface MorpheusQuerySessionOptions {
  resumeSessionId?: string;
  modelParams?: AgentModelParams;
  config: MorpheusAgentConfig;
  client: MorpheusAgentClient;
}

type MorpheusToolCallEvent = Extract<MorpheusStreamEvent, { type: "tool_call" }>;
type EmitAgentMessage = (message: AgentMessage) => void;

export function resolveMorpheusAgentConfig(
  env: MorpheusEnv = process.env,
): MorpheusAgentConfig {
  return {
    baseUrl: env.MORPHEUS_BASE_URL ?? MORPHEUS_DEFAULT_BASE_URL,
    apiKey: env.MORPHEUS_API_KEY,
    agentName: env.MORPHEUS_AGENT_NAME ?? MORPHEUS_DEFAULT_AGENT_NAME,
  };
}

function defaultClientFactory(config: MorpheusAgentConfig): MorpheusAgentClient {
  return new MorpheusClient({
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });
}

function ensureConfigured(config: MorpheusAgentConfig): void {
  if (!config.baseUrl) {
    throw new Error("Morpheus agent requires MORPHEUS_BASE_URL");
  }
  if (!config.apiKey) {
    throw new Error("Morpheus agent requires MORPHEUS_API_KEY");
  }
}

function toThinkingLevel(
  params?: AgentModelParams,
): MorpheusPromptStreamRequest["thinkingLevel"] {
  return params?.reasoningEffort;
}

function resolveFrontendToolCall(
  event: MorpheusToolCallEvent,
): { name: string; args: unknown } | null {
  if (event.name.startsWith("ui_")) {
    return { name: event.name, args: event.arguments };
  }

  if (event.name !== "forward_to_frontend") {
    return null;
  }

  const forwardType = getStringField(event.arguments, "forwardType");
  const prefix = "nodetool:";
  if (!forwardType?.startsWith(prefix)) {
    return null;
  }

  const name = forwardType.slice(prefix.length).trim();
  if (!name) {
    return null;
  }
  return {
    name,
    args: parseForwardPayload(event.arguments.payload),
  };
}

function getStringField(
  record: Record<string, unknown>,
  key: string,
): string | null {
  const value = record[key];
  return typeof value === "string" ? value : null;
}

function parseForwardPayload(payload: unknown): unknown {
  if (payload === undefined || payload === null) {
    return {};
  }
  if (typeof payload !== "string") {
    return payload;
  }
  try {
    return JSON.parse(payload) as unknown;
  } catch {
    return { payload };
  }
}

function isToolInManifest(
  manifest: FrontendToolManifest[],
  name: string,
): boolean {
  return manifest.length === 0 || manifest.some((tool) => tool.name === name);
}

async function executeFrontendToolCall(options: {
  event: MorpheusToolCallEvent;
  sessionId: string;
  transport: AgentTransport | null;
  manifest: FrontendToolManifest[];
  emit: EmitAgentMessage;
}): Promise<void> {
  const { event, sessionId, transport, manifest, emit } = options;
  if (!transport?.isAlive) {
    return;
  }

  const frontendTool = resolveFrontendToolCall(event);
  if (!frontendTool) {
    return;
  }

  if (!isToolInManifest(manifest, frontendTool.name)) {
    emitFrontendToolResult(sessionId, event.id, frontendTool.name, {
      isError: true,
      result: null,
      error: `Frontend tool is not available: ${frontendTool.name}`,
    }, emit);
    return;
  }

  try {
    const result = await transport.executeTool(
      sessionId,
      event.id,
      frontendTool.name,
      frontendTool.args,
    );
    emitFrontendToolResult(
      sessionId,
      event.id,
      frontendTool.name,
      { isError: false, result },
      emit,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(
      `Morpheus frontend tool ${frontendTool.name} failed in session ${sessionId}: ${message}`,
    );
    emitFrontendToolResult(
      sessionId,
      event.id,
      frontendTool.name,
      { isError: true, result: null, error: message },
      emit,
    );
  }
}

function emitFrontendToolResult(
  sessionId: string,
  toolCallId: string,
  name: string,
  result: { isError: boolean; result: unknown; error?: string },
  emit: EmitAgentMessage,
): void {
  emit({
    type: "stream_event",
    uuid: randomUUID(),
    session_id: sessionId,
    event_type: "morpheus_frontend_tool_result",
    event: {
      toolCallId,
      name,
      result: result.result,
      isError: result.isError,
      ...(result.error ? { error: result.error } : {}),
    },
  });
}

export class MorpheusQuerySession implements AgentQuerySession {
  private readonly modelParams?: AgentModelParams;
  private readonly config: MorpheusAgentConfig;
  private readonly client: MorpheusAgentClient;
  private closed = false;
  private inFlight = false;
  private abortController: AbortController | null = null;
  private resolvedSessionId: string | null;

  constructor(options: MorpheusQuerySessionOptions) {
    this.modelParams = options.modelParams;
    this.config = options.config;
    this.client = options.client;
    this.resolvedSessionId = options.resumeSessionId ?? null;
  }

  async send(
    message: string,
    transport: AgentTransport | null,
    fallbackSessionId: string,
    manifest: FrontendToolManifest[],
    onMessage?: (message: AgentMessage) => void,
    _mcpServerUrl?: string | null,
  ): Promise<AgentMessage[]> {
    if (this.closed) {
      throw new Error("Cannot send to a closed session");
    }
    if (this.inFlight) {
      throw new Error("A Morpheus request is already in progress");
    }

    this.inFlight = true;
    this.abortController = new AbortController();
    const out: AgentMessage[] = [];
    const emit = (agentMessage: AgentMessage) => {
      out.push(agentMessage);
      onMessage?.(agentMessage);
    };

    let textUuid: string | null = null;
    let textBuffer = "";
    let sawTerminalEvent = false;

    try {
      const sessionId = await this.ensureRemoteSession();
      for await (const event of this.client.streamPrompt({
        query: message,
        sessionId,
        agentName: this.config.agentName,
        thinkingLevel: toThinkingLevel(this.modelParams),
        signal: this.abortController.signal,
      })) {
        const currentSessionId = this.resolveStreamSessionId(
          event,
          fallbackSessionId,
        );
        switch (event.type) {
          case "session":
            break;
          case "text_delta":
            textBuffer += event.text;
            if (!textUuid) {
              textUuid = randomUUID();
            }
            emit({
              type: "assistant",
              uuid: textUuid,
              session_id: currentSessionId,
              text: textBuffer,
              content: [{ type: "text", text: textBuffer }],
            });
            break;
          case "thinking_delta":
            emit({
              type: "stream_event",
              uuid: randomUUID(),
              session_id: currentSessionId,
              event_type: "morpheus_thinking_delta",
              event: { text: event.text },
            });
            break;
          case "tool_call":
            textUuid = null;
            textBuffer = "";
            emit({
              type: "assistant",
              uuid: event.id,
              session_id: currentSessionId,
              tool_calls: [
                {
                  id: event.id,
                  type: "function",
                  function: {
                    name: event.name,
                    arguments: JSON.stringify(event.arguments),
                  },
                },
              ],
              event_type: event.workDescription
                ? "morpheus_tool_call"
                : undefined,
              event: event.workDescription
                ? { workDescription: event.workDescription }
                : undefined,
            });
            await executeFrontendToolCall({
              event,
              sessionId: currentSessionId,
              transport,
              manifest,
              emit,
            });
            break;
          case "tool_result":
            emit({
              type: "stream_event",
              uuid: randomUUID(),
              session_id: currentSessionId,
              event_type: "morpheus_tool_result",
              event,
            });
            break;
          case "agent_end":
            emit({
              type: "stream_event",
              uuid: randomUUID(),
              session_id: currentSessionId,
              event_type: "morpheus_agent_end",
              event: { messages: event.messages },
            });
            break;
          case "done":
            sawTerminalEvent = true;
            emitSuccess(currentSessionId, emit);
            break;
          case "error":
            sawTerminalEvent = true;
            emitError(currentSessionId, event.message, emit);
            break;
        }
      }

      if (!sawTerminalEvent) {
        emitSuccess(this.resolvedSessionId ?? fallbackSessionId, emit);
      }
    } catch (error) {
      if (this.abortController.signal.aborted) {
        log.info("Morpheus turn was interrupted");
        return out;
      }
      const message = error instanceof Error ? error.message : String(error);
      log.error(
        "Morpheus agent session failed",
        error instanceof Error ? error : new Error(message),
      );
      emitError(this.resolvedSessionId ?? fallbackSessionId, message, emit);
    } finally {
      this.abortController = null;
      this.inFlight = false;
    }

    return out;
  }

  async interrupt(): Promise<void> {
    this.abortController?.abort();
  }

  close(): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.abortController?.abort();
  }

  private async ensureRemoteSession(): Promise<string> {
    if (this.resolvedSessionId) {
      return this.resolvedSessionId;
    }
    const session = await this.client.createSession({
      agentName: this.config.agentName,
      signal: this.abortController?.signal,
    });
    this.resolvedSessionId = session.id;
    return session.id;
  }

  private resolveStreamSessionId(
    event: MorpheusStreamEvent,
    fallbackSessionId: string,
  ): string {
    if (event.type === "session") {
      this.resolvedSessionId = event.sessionId;
      return event.sessionId;
    }
    return this.resolvedSessionId ?? fallbackSessionId;
  }
}

export class MorpheusAgentSdkProvider implements AgentSdkProvider {
  readonly name = "morpheus";
  private readonly env?: MorpheusEnv;
  private readonly clientFactory: (
    config: MorpheusAgentConfig,
  ) => MorpheusAgentClient;

  constructor(options: MorpheusAgentProviderOptions = {}) {
    this.env = options.env;
    this.clientFactory = options.clientFactory ?? defaultClientFactory;
  }

  async listModels(
    userId: string,
    _workspacePath?: string,
  ): Promise<AgentModelDescriptor[]> {
    if (!userId) {
      throw new Error("listModels requires an authenticated userId");
    }
    const config = resolveMorpheusAgentConfig(this.env);
    if (!config.apiKey) {
      return [];
    }
    return [
      {
        id: config.agentName,
        label: `MorpheusCore (${config.agentName})`,
        provider: "morpheus",
        isDefault: true,
        supportsReasoningEffort: true,
      },
    ];
  }

  createSession(options: {
    model: string;
    workspacePath: string;
    userId: string;
    resumeSessionId?: string;
    modelParams?: AgentModelParams;
  }): AgentQuerySession {
    if (!options.userId) {
      throw new Error("Morpheus agent session requires an authenticated userId");
    }
    const config = {
      ...resolveMorpheusAgentConfig(this.env),
      agentName: options.model || resolveMorpheusAgentConfig(this.env).agentName,
    };
    ensureConfigured(config);
    return new MorpheusQuerySession({
      resumeSessionId: options.resumeSessionId,
      modelParams: options.modelParams,
      config,
      client: this.clientFactory(config),
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

function emitSuccess(
  sessionId: string,
  emit: (message: AgentMessage) => void,
): void {
  emit({
    type: "result",
    uuid: randomUUID(),
    session_id: sessionId,
    subtype: "success",
  });
}

function emitError(
  sessionId: string,
  message: string,
  emit: (message: AgentMessage) => void,
): void {
  emit({
    type: "result",
    uuid: randomUUID(),
    session_id: sessionId,
    subtype: "error",
    is_error: true,
    errors: [message],
  });
}
