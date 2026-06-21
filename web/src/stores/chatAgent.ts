/**
 * Generic agent mode for the unified chat.
 *
 * The `/ws/agent` route can be backed by MorpheusCore, the generic LLM agent,
 * or the legacy workspace-aware Pi agent. This slice maps one agent session to
 * each chat thread and streams renderer-facing agent messages into the normal
 * chat message cache.
 */

import type { StoreApi } from "zustand";
import type { Message } from "./ApiTypes";
import type { GlobalChatState } from "./GlobalChatStore";
import type {
  AgentMessage as ProtocolAgentMessage,
  AgentModelDescriptor,
  AgentProvider,
  AgentSessionOptions,
  AgentStreamEvent
} from "../lib/agent/agentTypes";
import { agentMessageToNodeToolMessage } from "../utils/agentMessageAdapter";
import { getAgentSocketClient } from "../lib/agent/AgentSocketClient";
// Importing this module registers the manifest/tool-call handlers on the agent
// socket so server-side agents can drive the live workflow graph.
import "../lib/tools/frontendToolsIpc";

type Set = StoreApi<GlobalChatState>["setState"];
type Get = StoreApi<GlobalChatState>["getState"];

export interface ChatAgentSlice {
  agentModel: string;
  agentModels: AgentModelDescriptor[];
  agentModelsLoading: boolean;
  agentProvider: AgentProvider;
  agentWorkspaceId: string | null;
  agentWorkspacePath: string | null;
  agentSessionByThread: Record<string, string>;
  agentThreadBySession: Record<string, string>;
  agentResumeSessionByThread: Record<string, string>;
  agentSessionConfigByThread: Record<string, AgentSessionConfig>;
  agentStreamUnsub: (() => void) | null;

  loadAgentModels: () => Promise<void>;
  setAgentModel: (model: string) => void;
  setAgentProvider: (provider: AgentProvider) => void;
  setAgentWorkspace: (
    workspaceId: string | null,
    workspacePath: string | null
  ) => void;
  sendAgentMessage: (threadId: string, text: string) => Promise<void>;
  stopAgent: (threadId: string) => void;

  /** @deprecated Use `agentModel`. */
  piModel: string;
  /** @deprecated Use `agentModels`. */
  piModels: AgentModelDescriptor[];
  /** @deprecated Use `agentModelsLoading`. */
  piModelsLoading: boolean;
  /** @deprecated Use `agentWorkspaceId`. */
  piWorkspaceId: string | null;
  /** @deprecated Use `agentWorkspacePath`. */
  piWorkspacePath: string | null;
  /** @deprecated Use `agentSessionByThread`. */
  piSessionByThread: Record<string, string>;
  /** @deprecated Use `agentThreadBySession`. */
  piThreadBySession: Record<string, string>;
  /** @deprecated Use `agentStreamUnsub`. */
  piStreamUnsub: (() => void) | null;
  /** @deprecated Use `loadAgentModels`. */
  loadPiModels: () => Promise<void>;
  /** @deprecated Use `setAgentModel`. */
  setPiModel: (model: string) => void;
  /** @deprecated Use `setAgentWorkspace`. */
  setPiWorkspace: (
    workspaceId: string | null,
    workspacePath: string | null
  ) => void;
  /** @deprecated Use `sendAgentMessage`; this forces provider `pi`. */
  sendPiMessage: (threadId: string, text: string) => Promise<void>;
  /** @deprecated Use `stopAgent`. */
  stopPi: (threadId: string) => void;
}

export interface AgentSessionConfig {
  provider: AgentProvider;
  model: string;
  workspacePath: string | null;
  chatProviderId: string | null;
}

const DEFAULT_AGENT_PROVIDER: AgentProvider = "morpheus";
const FALLBACK_AGENT_PROVIDER: AgentProvider = "llm";

// Bumped on each loadAgentModels call; stale responses are dropped so a slow
// reply cannot clobber a newer provider/workspace catalog.
let loadAgentModelsToken = 0;

// Sessions created/loaded during this app run. A persisted session id that
// is not here is resumed (reattached) on next use rather than reused blindly.
const liveSessions = new Set<string>();
// Per-thread guard so a "result" message does not duplicate assistant text
// already streamed in the same turn.
const turnHasAssistant = new Map<string, boolean>();
const turnAssistantMessageIds = new Map<string, globalThis.Set<string>>();

export function agentModelSelectionKey(model: AgentModelDescriptor): string {
  return model.chatProviderId
    ? `${model.chatProviderId}::${model.id}`
    : model.id;
}

function agentModelMatchesSelection(
  model: AgentModelDescriptor,
  selection: string
): boolean {
  return model.id === selection || agentModelSelectionKey(model) === selection;
}

function upsertMessage(list: Message[], converted: Message): Message[] {
  const idx = list.findLastIndex((m) => m.id === converted.id);
  if (idx === -1) {
    return [...list, converted];
  }
  const next = [...list];
  next[idx] = converted;
  return next;
}

function textContent(message: Message): string {
  if (typeof message.content === "string") {
    return message.content;
  }
  if (!Array.isArray(message.content)) {
    return "";
  }
  return message.content
    .map((part) =>
      typeof part === "object" && part !== null && "text" in part
        ? String(part.text ?? "")
        : ""
    )
    .join("");
}

function turnAssistantText(threadId: string, messages: Message[]): string {
  const assistantIds = turnAssistantMessageIds.get(threadId);
  if (!assistantIds) {
    return "";
  }
  return messages
    .filter(
      (candidate) =>
        typeof candidate.id === "string" &&
        assistantIds.has(candidate.id) &&
        candidate.type === "message" &&
        candidate.role === "assistant"
    )
    .map(textContent)
    .join("");
}

function mirrorAgentState(
  patch: Partial<
    Pick<
      ChatAgentSlice,
      | "agentModel"
      | "agentModels"
      | "agentModelsLoading"
      | "agentWorkspaceId"
      | "agentWorkspacePath"
      | "agentSessionByThread"
      | "agentThreadBySession"
      | "agentResumeSessionByThread"
      | "agentSessionConfigByThread"
      | "agentStreamUnsub"
    >
  >
): Partial<GlobalChatState> {
  const mirrored: Partial<GlobalChatState> = { ...patch };
  if (patch.agentModel !== undefined) {
    mirrored.piModel = patch.agentModel;
  }
  if (patch.agentModels !== undefined) {
    mirrored.piModels = patch.agentModels;
  }
  if (patch.agentModelsLoading !== undefined) {
    mirrored.piModelsLoading = patch.agentModelsLoading;
  }
  if (patch.agentWorkspaceId !== undefined) {
    mirrored.piWorkspaceId = patch.agentWorkspaceId;
  }
  if (patch.agentWorkspacePath !== undefined) {
    mirrored.piWorkspacePath = patch.agentWorkspacePath;
  }
  if (patch.agentSessionByThread !== undefined) {
    mirrored.piSessionByThread = patch.agentSessionByThread;
  }
  if (patch.agentThreadBySession !== undefined) {
    mirrored.piThreadBySession = patch.agentThreadBySession;
  }
  if (patch.agentStreamUnsub !== undefined) {
    mirrored.piStreamUnsub = patch.agentStreamUnsub;
  }
  return mirrored;
}

function invalidateAgentModelLoads(): void {
  loadAgentModelsToken += 1;
}

function pickDefaultModel(models: AgentModelDescriptor[]): string {
  const model = models.find((m) => m.isDefault) ?? models[0] ?? null;
  return model ? agentModelSelectionKey(model) : "";
}

function selectedAgentModelDescriptor(
  state: GlobalChatState
): AgentModelDescriptor | undefined {
  return state.agentModels.find((model) =>
    agentModelMatchesSelection(model, state.agentModel)
  );
}

function buildSessionConfig(state: GlobalChatState): AgentSessionConfig {
  const descriptor = selectedAgentModelDescriptor(state);
  return {
    provider: state.agentProvider,
    model: descriptor?.id ?? state.agentModel,
    workspacePath:
      state.agentProvider === "pi" ? state.agentWorkspacePath ?? null : null,
    chatProviderId:
      state.agentProvider === "llm" ? descriptor?.chatProviderId ?? null : null
  };
}

function sessionConfigsMatch(
  left: AgentSessionConfig | undefined,
  right: AgentSessionConfig
): boolean {
  return (
    !!left &&
    left.provider === right.provider &&
    left.model === right.model &&
    left.workspacePath === right.workspacePath &&
    left.chatProviderId === right.chatProviderId
  );
}

function isTemporaryLlmSessionId(sessionId: string): boolean {
  return sessionId.startsWith("llm-session-");
}

function maybePromoteLlmSessionId(
  socketSessionId: string,
  threadId: string,
  message: ProtocolAgentMessage,
  set: Set,
  get: Get
): void {
  const realSessionId = message.session_id;
  const state = get();
  if (
    !realSessionId ||
    realSessionId === socketSessionId ||
    state.agentSessionConfigByThread[threadId]?.provider !== "llm" ||
    state.agentSessionByThread[threadId] !== socketSessionId
  ) {
    return;
  }

  set((state) => {
    if (state.agentSessionByThread[threadId] !== socketSessionId) {
      return state;
    }
    if (
      state.agentResumeSessionByThread[threadId] === realSessionId &&
      state.agentThreadBySession[realSessionId] === threadId
    ) {
      return state;
    }
    return mirrorAgentState({
      agentResumeSessionByThread: {
        ...state.agentResumeSessionByThread,
        [threadId]: realSessionId
      },
      agentThreadBySession: {
        ...state.agentThreadBySession,
        [socketSessionId]: threadId,
        [realSessionId]: threadId
      }
    });
  });
}

function handleAgentStream(event: AgentStreamEvent, set: Set, get: Get): void {
  const { sessionId, message, done } = event;
  const threadId = get().agentThreadBySession[sessionId];
  if (!threadId) {
    return;
  }
  const finishTurn = (): void => {
    turnHasAssistant.delete(threadId);
    turnAssistantMessageIds.delete(threadId);
    if (get().currentThreadId === threadId) {
      set({ status: "connected" });
    }
  };

  maybePromoteLlmSessionId(
    sessionId,
    threadId,
    message as ProtocolAgentMessage,
    set,
    get
  );

  if (message.type === "system") {
    if (done) {
      finishTurn();
    }
    return;
  }

  const converted = agentMessageToNodeToolMessage(message as ProtocolAgentMessage);
  if (!converted) {
    if (done) {
      finishTurn();
    }
    return;
  }

  const isSuccessResult =
    message.type === "result" && message.subtype === "success";
  if (isSuccessResult && turnHasAssistant.get(threadId)) {
    const existing = get().messageCache[threadId] ?? [];
    const streamedText = turnAssistantText(threadId, existing);
    if (streamedText && streamedText === textContent(converted)) {
      if (done) {
        finishTurn();
      }
      return;
    }
  }
  if (message.type === "assistant") {
    turnHasAssistant.set(threadId, true);
    const assistantIds =
      turnAssistantMessageIds.get(threadId) ?? new globalThis.Set<string>();
    if (typeof converted.id === "string") {
      assistantIds.add(converted.id);
      turnAssistantMessageIds.set(threadId, assistantIds);
    }
  }

  set((state) => ({
    messageCache: {
      ...state.messageCache,
      [threadId]: upsertMessage(state.messageCache[threadId] ?? [], converted)
    },
    status: state.currentThreadId === threadId ? "streaming" : state.status
  }));
  if (done) {
    finishTurn();
  }
}

function ensureAgentStream(set: Set, get: Get): void {
  if (get().agentStreamUnsub) {
    return;
  }
  const client = getAgentSocketClient();
  const onStream = (event: AgentStreamEvent): void =>
    handleAgentStream(event, set, get);
  client.on("stream", onStream);
  const unsubscribe = (): void => {
    client.off("stream", onStream);
  };
  set(mirrorAgentState({ agentStreamUnsub: unsubscribe }));
}

async function listModelsForProvider(
  provider: AgentProvider,
  workspacePath: string | null
): Promise<AgentModelDescriptor[]> {
  const request =
    provider === "pi" && workspacePath
      ? { provider, workspacePath }
      : { provider };
  return getAgentSocketClient().listModels(request);
}

async function discoverDefaultProviderModels(
  workspacePath: string | null
): Promise<{ provider: AgentProvider; models: AgentModelDescriptor[] }> {
  try {
    const morpheusModels = await listModelsForProvider(
      DEFAULT_AGENT_PROVIDER,
      workspacePath
    );
    if (morpheusModels.length > 0) {
      return { provider: DEFAULT_AGENT_PROVIDER, models: morpheusModels };
    }
  } catch (error) {
    console.warn("Failed to load Morpheus agent models:", error);
  }
  const llmModels = await listModelsForProvider(
    FALLBACK_AGENT_PROVIDER,
    workspacePath
  );
  return { provider: FALLBACK_AGENT_PROVIDER, models: llmModels };
}

async function ensureAgentSession(
  threadId: string,
  set: Set,
  get: Get
): Promise<string> {
  const state = get();
  const { agentSessionByThread, agentProvider, agentWorkspacePath } = state;
  const config = buildSessionConfig(state);
  const existing = agentSessionByThread[threadId];
  const llmResumeSessionId =
    state.agentResumeSessionByThread[threadId] ??
    (existing && !isTemporaryLlmSessionId(existing) ? existing : undefined);
  const existingConfig = state.agentSessionConfigByThread[threadId];
  const canReuseExisting = sessionConfigsMatch(existingConfig, config);
  const canResumeLegacyPiSession =
    agentProvider === "pi" &&
    existingConfig === undefined &&
    typeof existing === "string" &&
    existing.length > 0 &&
    !!agentWorkspacePath;
  const canResumeExisting = canReuseExisting || canResumeLegacyPiSession;
  if (existing && liveSessions.has(existing) && canResumeExisting) {
    if (agentProvider === "llm" && typeof state.memoryEnabled === "boolean") {
      await getAgentSocketClient().setMemoryEnabled(
        existing,
        state.memoryEnabled
      );
    }
    return existing;
  }

  ensureAgentStream(set, get);

  const options: AgentSessionOptions = {
    provider: agentProvider,
    model: config.model
  };
  if (canResumeExisting) {
    if (agentProvider === "llm") {
      if (llmResumeSessionId) {
        options.resumeSessionId = llmResumeSessionId;
      }
    } else if (existing) {
      options.resumeSessionId = existing;
    }
  }
  if (agentProvider === "pi" && agentWorkspacePath) {
    options.workspacePath = agentWorkspacePath;
  }
  if (agentProvider === "llm") {
    if (typeof state.memoryEnabled === "boolean") {
      options.memoryEnabled = state.memoryEnabled;
    }
    const descriptor = selectedAgentModelDescriptor(state);
    if (descriptor?.chatProviderId) {
      options.chatProviderId = descriptor.chatProviderId;
    }
  }

  const sessionId = await getAgentSocketClient().createSession(options);
  liveSessions.add(sessionId);
  set((current) => {
    const agentSessionByThreadNext = {
      ...current.agentSessionByThread,
      [threadId]: sessionId
    };
    const agentThreadBySessionNext = {
      ...current.agentThreadBySession,
      [sessionId]: threadId
    };
    const agentSessionConfigByThreadNext = {
      ...current.agentSessionConfigByThread,
      [threadId]: config
    };
    const {
      [threadId]: _previousResumeSessionId,
      ...resumeSessionsWithoutThread
    } = current.agentResumeSessionByThread;
    const agentResumeSessionByThreadNext =
      agentProvider === "llm" && canResumeExisting && llmResumeSessionId
        ? {
            ...current.agentResumeSessionByThread,
            [threadId]: llmResumeSessionId
          }
        : resumeSessionsWithoutThread;
    return mirrorAgentState({
      agentSessionByThread: agentSessionByThreadNext,
      agentThreadBySession: agentThreadBySessionNext,
      agentResumeSessionByThread: agentResumeSessionByThreadNext,
      agentSessionConfigByThread: agentSessionConfigByThreadNext
    });
  });
  return sessionId;
}

function setProvider(set: Set, provider: AgentProvider): void {
  invalidateAgentModelLoads();
  set({
    agentProvider: provider,
    ...mirrorAgentState({
      agentModel: "",
      agentModels: [],
      agentModelsLoading: false
    })
  });
}

export function createChatAgentSlice(set: Set, get: Get): ChatAgentSlice {
  return {
    agentModel: "",
    agentModels: [],
    agentModelsLoading: false,
    agentProvider: DEFAULT_AGENT_PROVIDER,
    agentWorkspaceId: null,
    agentWorkspacePath: null,
    agentSessionByThread: {},
    agentThreadBySession: {},
    agentResumeSessionByThread: {},
    agentSessionConfigByThread: {},
    agentStreamUnsub: null,

    piModel: "",
    piModels: [],
    piModelsLoading: false,
    piWorkspaceId: null,
    piWorkspacePath: null,
    piSessionByThread: {},
    piThreadBySession: {},
    piStreamUnsub: null,

    loadAgentModels: async () => {
      const { agentProvider, agentWorkspacePath } = get();
      const requestedProvider = agentProvider;
      const requestedWorkspacePath = agentWorkspacePath;
      const token = ++loadAgentModelsToken;
      set(mirrorAgentState({ agentModelsLoading: true }));
      try {
        const result =
          agentProvider === DEFAULT_AGENT_PROVIDER
            ? await discoverDefaultProviderModels(agentWorkspacePath)
            : {
                provider: agentProvider,
                models: await listModelsForProvider(
                  agentProvider,
                  agentWorkspacePath
                )
              };
        if (token !== loadAgentModelsToken) {
          return;
        }
        const current = get();
        if (
          current.agentProvider !== requestedProvider ||
          current.agentWorkspacePath !== requestedWorkspacePath
        ) {
          return;
        }
        set((state) => {
          const model = result.models.some((m) =>
            agentModelMatchesSelection(m, state.agentModel)
          )
            ? state.agentModel
            : pickDefaultModel(result.models);
          return {
            agentProvider: result.provider,
            ...mirrorAgentState({
              agentModels: result.models,
              agentModel: model,
              agentModelsLoading: false
            })
          };
        });
      } catch (error) {
        console.error("Failed to load agent models:", error);
        if (token === loadAgentModelsToken) {
          set(mirrorAgentState({ agentModelsLoading: false }));
        }
      }
    },

    setAgentModel: (model: string) => {
      invalidateAgentModelLoads();
      set(
        mirrorAgentState({
          agentModel: model,
          agentModelsLoading: false
        })
      );
    },

    setAgentProvider: (provider: AgentProvider) => setProvider(set, provider),

    setAgentWorkspace: (workspaceId, workspacePath) => {
      invalidateAgentModelLoads();
      set(
        mirrorAgentState({
          agentWorkspaceId: workspaceId,
          agentWorkspacePath: workspacePath,
          agentModelsLoading: false
        })
      );
    },

    sendAgentMessage: async (threadId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        return;
      }
      const { agentProvider, agentWorkspacePath, agentModel } = get();
      if (agentProvider === "pi" && !agentWorkspacePath) {
        set({
          status: "error",
          error: "Select a workspace before chatting with the Pi agent."
        });
        return;
      }
      if (!agentModel) {
        set({
          status: "error",
          error:
            agentProvider === "pi"
              ? "Select a Pi model first."
              : "Select an agent model first."
        });
        return;
      }

      const userMessage: Message = {
        type: "message",
        id: crypto.randomUUID(),
        role: "user",
        content: [{ type: "text", text: trimmed }],
        thread_id: threadId,
        created_at: new Date().toISOString()
      };
      turnHasAssistant.set(threadId, false);
      turnAssistantMessageIds.set(threadId, new globalThis.Set<string>());
      set((state) => ({
        messageCache: {
          ...state.messageCache,
          [threadId]: [...(state.messageCache[threadId] ?? []), userMessage]
        },
        status: "loading",
        error: null
      }));

      try {
        const sessionId = await ensureAgentSession(threadId, set, get);
        await getAgentSocketClient().sendMessage(sessionId, trimmed);
      } catch (error) {
        set({
          status: "error",
          error: `Failed to send message: ${
            error instanceof Error ? error.message : String(error)
          }`
        });
      }
    },

    stopAgent: (threadId: string) => {
      const sessionId = get().agentSessionByThread[threadId];
      if (!sessionId) {
        set({ status: "connected" });
        return;
      }
      set({ status: "stopping" });
      getAgentSocketClient()
        .stopExecution(sessionId)
        .then(() => set({ status: "connected" }))
        .catch((err: unknown) => {
          console.error("Failed to stop agent execution:", err);
          set({
            status: "error",
            error:
              err instanceof Error
                ? `Failed to stop: ${err.message}`
                : "Failed to stop agent execution"
          });
        });
    },

    loadPiModels: async () => {
      if (get().agentProvider !== "pi") {
        setProvider(set, "pi");
      }
      await get().loadAgentModels();
    },

    setPiModel: (model: string) => get().setAgentModel(model),

    setPiWorkspace: (workspaceId, workspacePath) =>
      get().setAgentWorkspace(workspaceId, workspacePath),

    sendPiMessage: async (threadId: string, text: string) => {
      if (get().agentProvider !== "pi") {
        set({ agentProvider: "pi" });
      }
      await get().sendAgentMessage(threadId, text);
    },

    stopPi: (threadId: string) => get().stopAgent(threadId)
  };
}
