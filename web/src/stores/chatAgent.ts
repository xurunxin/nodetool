/**
 * Generic agent mode for the unified chat.
 *
 * The UI talks to NodeTool's `/ws/agent` endpoint and lets the server choose
 * the concrete runtime provider: MorpheusCore by default when configured,
 * LLM fallback for local development, and Pi only when explicitly selected.
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
// Registers manifest/tool-call handlers on the agent socket.
import "../lib/tools/frontendToolsIpc";

type Set = StoreApi<GlobalChatState>["setState"];
type Get = StoreApi<GlobalChatState>["getState"];

export interface ChatAgentSlice {
  agentProvider: AgentProvider;
  agentModel: string;
  agentModels: AgentModelDescriptor[];
  agentModelsLoading: boolean;
  agentWorkspaceId: string | null;
  agentWorkspacePath: string | null;
  agentSessionByThread: Record<string, string>;
  agentThreadBySession: Record<string, string>;
  agentStreamUnsub: (() => void) | null;

  loadAgentModels: () => Promise<void>;
  setAgentProvider: (provider: AgentProvider) => void;
  setAgentModel: (model: string) => void;
  setAgentWorkspace: (
    workspaceId: string | null,
    workspacePath: string | null
  ) => void;
  sendAgentMessage: (threadId: string, text: string) => Promise<void>;
  stopAgent: (threadId: string) => void;
}

let loadAgentModelsToken = 0;

const liveAgentSessions = new Set<string>();
const turnHasAssistant = new Map<string, boolean>();

function upsertMessage(list: Message[], converted: Message): Message[] {
  const idx = list.findLastIndex((m) => m.id === converted.id);
  if (idx === -1) {
    return [...list, converted];
  }
  const next = [...list];
  next[idx] = converted;
  return next;
}

function handleAgentStream(event: AgentStreamEvent, set: Set, get: Get): void {
  const { sessionId, message, done } = event;
  const threadId = get().agentThreadBySession[sessionId];
  if (!threadId) {
    return;
  }

  if (done) {
    turnHasAssistant.delete(threadId);
    if (get().currentThreadId === threadId) {
      set({ status: "connected" });
    }
    return;
  }

  if (message.type === "system") {
    return;
  }

  const converted = agentMessageToNodeToolMessage(
    message as ProtocolAgentMessage
  );
  if (!converted) {
    return;
  }

  const isSuccessResult =
    message.type === "result" && message.subtype === "success";
  if (isSuccessResult && turnHasAssistant.get(threadId)) {
    return;
  }
  if (message.type === "assistant") {
    turnHasAssistant.set(threadId, true);
  }

  set((state) => ({
    messageCache: {
      ...state.messageCache,
      [threadId]: upsertMessage(state.messageCache[threadId] ?? [], converted)
    },
    status: state.currentThreadId === threadId ? "streaming" : state.status
  }));
}

function ensureAgentStream(set: Set, get: Get): void {
  if (get().agentStreamUnsub) {
    return;
  }
  const client = getAgentSocketClient();
  const onStream = (event: AgentStreamEvent): void =>
    handleAgentStream(event, set, get);
  client.on("stream", onStream);
  set({
    agentStreamUnsub: () => {
      client.off("stream", onStream);
    }
  });
}

function selectedAgentModel(
  models: AgentModelDescriptor[],
  modelId: string
): AgentModelDescriptor | null {
  return models.find((model) => model.id === modelId) ?? null;
}

async function loadModelsForProvider(
  provider: AgentProvider,
  workspacePath?: string | null
): Promise<AgentModelDescriptor[]> {
  return getAgentSocketClient().listModels({
    provider,
    workspacePath: workspacePath ?? undefined
  });
}

async function ensureAgentSession(
  threadId: string,
  set: Set,
  get: Get
): Promise<string> {
  const {
    agentSessionByThread,
    agentModel,
    agentModels,
    agentProvider,
    agentWorkspacePath
  } = get();
  const existing = agentSessionByThread[threadId];
  if (existing && liveAgentSessions.has(existing)) {
    return existing;
  }

  ensureAgentStream(set, get);

  const model = selectedAgentModel(agentModels, agentModel);
  const client = getAgentSocketClient();
  const sessionOptions: AgentSessionOptions = {
    provider: agentProvider,
    model: agentModel
  };
  if (agentProvider === "llm" && model?.chatProviderId) {
    sessionOptions.chatProviderId = model.chatProviderId;
  }
  if (agentProvider === "pi" && agentWorkspacePath) {
    sessionOptions.workspacePath = agentWorkspacePath;
  }
  if (existing) {
    sessionOptions.resumeSessionId = existing;
  }
  const sessionId = await client.createSession(sessionOptions);
  liveAgentSessions.add(sessionId);
  set((state) => ({
    agentSessionByThread: {
      ...state.agentSessionByThread,
      [threadId]: sessionId
    },
    agentThreadBySession: {
      ...state.agentThreadBySession,
      [sessionId]: threadId
    }
  }));
  return sessionId;
}

export function createChatAgentSlice(set: Set, get: Get): ChatAgentSlice {
  return {
    agentProvider: "morpheus",
    agentModel: "",
    agentModels: [],
    agentModelsLoading: false,
    agentWorkspaceId: null,
    agentWorkspacePath: null,
    agentSessionByThread: {},
    agentThreadBySession: {},
    agentStreamUnsub: null,

    loadAgentModels: async () => {
      const { agentProvider, agentWorkspacePath } = get();
      const token = ++loadAgentModelsToken;
      set({ agentModelsLoading: true });
      try {
        let models =
          agentProvider === "pi"
            ? await loadModelsForProvider("pi", agentWorkspacePath)
            : await loadModelsForProvider("morpheus");
        let nextProvider: AgentProvider =
          agentProvider === "pi" ? "pi" : "morpheus";

        if (models.length === 0 && agentProvider !== "pi") {
          models = await loadModelsForProvider("llm");
          nextProvider = "llm";
        }

        if (token !== loadAgentModelsToken) {
          return;
        }

        const fallback = models.find((m) => m.isDefault) ?? models[0] ?? null;
        set((state) => {
          const currentModel = selectedAgentModel(models, state.agentModel);
          const resolvedModel = currentModel ?? fallback;
          return {
            agentProvider: resolvedModel?.provider ?? nextProvider,
            agentModels: models,
            agentModel: resolvedModel?.id ?? "",
            agentModelsLoading: false
          };
        });
      } catch (error) {
        console.error("Failed to load agent models:", error);
        if (token === loadAgentModelsToken) {
          set({ agentModelsLoading: false });
        }
      }
    },

    setAgentProvider: (provider: AgentProvider) =>
      set({ agentProvider: provider }),

    setAgentModel: (model: string) =>
      set((state) => {
        const descriptor = selectedAgentModel(state.agentModels, model);
        return {
          agentModel: model,
          agentProvider: descriptor?.provider ?? state.agentProvider
        };
      }),

    setAgentWorkspace: (workspaceId, workspacePath) =>
      set({
        agentWorkspaceId: workspaceId,
        agentWorkspacePath: workspacePath
      }),

    sendAgentMessage: async (threadId: string, text: string) => {
      if (!text.trim()) {
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
        set({ status: "error", error: "Select an agent model first." });
        return;
      }

      const userMessage: Message = {
        type: "message",
        id: crypto.randomUUID(),
        role: "user",
        content: [{ type: "text", text }],
        thread_id: threadId,
        created_at: new Date().toISOString()
      };
      turnHasAssistant.set(threadId, false);
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
        await getAgentSocketClient().sendMessage(sessionId, text);
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
    }
  };
}
