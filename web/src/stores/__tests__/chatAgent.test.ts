import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";
import { createChatAgentSlice, type ChatAgentSlice } from "../chatAgent";
import type {
  AgentModelDescriptor,
  AgentStreamEvent
} from "../../lib/agent/agentTypes";

jest.mock("../../lib/tools/frontendToolsIpc", () => ({}));

const mockAgentClient = {
  listModels: jest.fn(),
  createSession: jest.fn(),
  sendMessage: jest.fn(),
  stopExecution: jest.fn(),
  on: jest.fn(),
  off: jest.fn()
};

jest.mock("../../lib/agent/AgentSocketClient", () => ({
  getAgentSocketClient: () => mockAgentClient
}));

type TestChatAgentStore = ChatAgentSlice & {
  status: "connected" | "loading" | "streaming" | "error" | "stopping";
  error: string | null;
  currentThreadId: string | null;
  messageCache: Record<string, unknown[]>;
};

const morpheusModel: AgentModelDescriptor = {
  id: "morpheus/default",
  label: "Morpheus Default",
  provider: "morpheus",
  isDefault: true
};

const llmModel: AgentModelDescriptor = {
  id: "claude-sonnet",
  label: "Claude Sonnet",
  provider: "llm",
  chatProviderId: "anthropic",
  isDefault: true
};

const piModel: AgentModelDescriptor = {
  id: "pi/claude",
  label: "Pi Claude",
  provider: "pi",
  isDefault: true
};

function createTestStore(): StoreApi<TestChatAgentStore> {
  return createStore<TestChatAgentStore>()((set, get) => ({
    status: "connected",
    error: null,
    currentThreadId: null,
    messageCache: {},
    ...createChatAgentSlice(
      set as StoreApi<never>["setState"],
      get as StoreApi<never>["getState"]
    )
  }));
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("chatAgent store slice", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAgentClient.createSession.mockResolvedValue("session-default");
    mockAgentClient.sendMessage.mockResolvedValue(undefined);
    mockAgentClient.stopExecution.mockResolvedValue(undefined);
    mockAgentClient.on.mockReturnValue(undefined);
    mockAgentClient.off.mockReturnValue(undefined);
    Object.defineProperty(global, "crypto", {
      value: { randomUUID: jest.fn(() => "message-id") },
      configurable: true
    });
  });

  it("prefers Morpheus models during default provider discovery", async () => {
    mockAgentClient.listModels.mockImplementation(
      async ({ provider }: { provider?: string }) =>
        provider === "morpheus" ? [morpheusModel] : [llmModel]
    );
    const store = createTestStore();

    await store.getState().loadAgentModels();

    expect(mockAgentClient.listModels).toHaveBeenCalledWith({
      provider: "morpheus"
    });
    expect(store.getState().agentProvider).toBe("morpheus");
    expect(store.getState().agentModel).toBe("morpheus/default");
    expect(store.getState().agentModels).toEqual([morpheusModel]);
  });

  it("falls back to LLM models when Morpheus is unavailable", async () => {
    mockAgentClient.listModels.mockImplementation(
      async ({ provider }: { provider?: string }) =>
        provider === "morpheus" ? [] : [llmModel]
    );
    const store = createTestStore();

    await store.getState().loadAgentModels();

    expect(mockAgentClient.listModels).toHaveBeenNthCalledWith(1, {
      provider: "morpheus"
    });
    expect(mockAgentClient.listModels).toHaveBeenNthCalledWith(2, {
      provider: "llm"
    });
    expect(store.getState().agentProvider).toBe("llm");
    expect(store.getState().agentModel).toBe("claude-sonnet");
    expect(store.getState().agentModels).toEqual([llmModel]);
  });

  it("maps agent sessions by chat thread", async () => {
    mockAgentClient.listModels.mockResolvedValue([morpheusModel]);
    mockAgentClient.createSession.mockResolvedValue("session-a");
    const store = createTestStore();
    store.setState({ agentModel: "morpheus/default" });

    await store.getState().sendAgentMessage("thread-a", "hello");

    expect(store.getState().agentSessionByThread["thread-a"]).toBe(
      "session-a"
    );
    expect(store.getState().agentThreadBySession["session-a"]).toBe(
      "thread-a"
    );
    expect(mockAgentClient.sendMessage).toHaveBeenCalledWith(
      "session-a",
      "hello"
    );
  });

  it("creates a new session after switching provider for an existing thread", async () => {
    mockAgentClient.createSession
      .mockResolvedValueOnce("session-morpheus")
      .mockResolvedValueOnce("session-llm");
    const store = createTestStore();
    store.setState({
      agentProvider: "morpheus",
      agentModel: "morpheus/default",
      agentModels: [morpheusModel]
    });
    await store.getState().sendAgentMessage("thread-a", "first");

    store.getState().setAgentProvider("llm");
    store.setState({
      agentModel: "claude-sonnet",
      agentModels: [llmModel]
    });
    await store.getState().sendAgentMessage("thread-a", "second");

    expect(mockAgentClient.createSession).toHaveBeenCalledTimes(2);
    expect(mockAgentClient.createSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        provider: "llm",
        model: "claude-sonnet"
      })
    );
    expect(mockAgentClient.sendMessage).toHaveBeenLastCalledWith(
      "session-llm",
      "second"
    );
  });

  it("creates a new session after changing model for an existing thread", async () => {
    mockAgentClient.createSession
      .mockResolvedValueOnce("session-old-model")
      .mockResolvedValueOnce("session-new-model");
    const store = createTestStore();
    store.setState({
      agentProvider: "llm",
      agentModel: "claude-haiku",
      agentModels: [
        { ...llmModel, id: "claude-haiku", label: "Claude Haiku" },
        llmModel
      ]
    });
    await store.getState().sendAgentMessage("thread-a", "first");

    store.getState().setAgentModel("claude-sonnet");
    await store.getState().sendAgentMessage("thread-a", "second");

    expect(mockAgentClient.createSession).toHaveBeenCalledTimes(2);
    expect(mockAgentClient.createSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        provider: "llm",
        model: "claude-sonnet"
      })
    );
  });

  it("records the real LLM thread id for resume while live sends keep using the socket session", async () => {
    mockAgentClient.createSession.mockResolvedValue("llm-session-1");
    let streamHandler: ((event: AgentStreamEvent) => void) | undefined;
    mockAgentClient.on.mockImplementation(
      (eventName: string, handler: (event: AgentStreamEvent) => void) => {
        if (eventName === "stream") {
          streamHandler = handler;
        }
      }
    );
    const store = createTestStore();
    const resumeState = () =>
      store.getState() as TestChatAgentStore & {
        agentResumeSessionByThread?: Record<string, string>;
      };
    store.setState({
      agentProvider: "llm",
      agentModel: "claude-sonnet",
      agentModels: [llmModel],
      currentThreadId: "chat-thread",
      status: "loading"
    });

    await store.getState().sendAgentMessage("chat-thread", "hello");
    expect(mockAgentClient.sendMessage).toHaveBeenCalledWith(
      "llm-session-1",
      "hello"
    );

    streamHandler?.({
      sessionId: "llm-session-1",
      done: false,
      message: {
        type: "assistant",
        uuid: "assistant-1",
        session_id: "db-thread-1",
        text: "ok",
        content: [{ type: "text", text: "ok" }]
      }
    });

    expect(store.getState().agentSessionByThread["chat-thread"]).toBe(
      "llm-session-1"
    );
    expect(resumeState().agentResumeSessionByThread?.["chat-thread"]).toBe(
      "db-thread-1"
    );
    expect(store.getState().agentThreadBySession["llm-session-1"]).toBe(
      "chat-thread"
    );
    expect(store.getState().agentThreadBySession["db-thread-1"]).toBe(
      "chat-thread"
    );

    streamHandler?.({
      sessionId: "llm-session-1",
      done: true,
      message: {
        type: "system",
        uuid: "done-1",
        session_id: "llm-session-1"
      }
    });
    expect(store.getState().status).toBe("connected");

    await store.getState().sendAgentMessage("chat-thread", "again");

    expect(mockAgentClient.createSession).toHaveBeenCalledTimes(1);
    expect(mockAgentClient.sendMessage).toHaveBeenLastCalledWith(
      "llm-session-1",
      "again"
    );
  });

  it("ignores delayed LLM stream events from replaced socket sessions", async () => {
    mockAgentClient.createSession
      .mockResolvedValueOnce("llm-session-old")
      .mockResolvedValueOnce("llm-session-new");
    let streamHandler: ((event: AgentStreamEvent) => void) | undefined;
    mockAgentClient.on.mockImplementation(
      (eventName: string, handler: (event: AgentStreamEvent) => void) => {
        if (eventName === "stream") {
          streamHandler = handler;
        }
      }
    );
    const store = createTestStore();
    const resumeState = () =>
      store.getState() as TestChatAgentStore & {
        agentResumeSessionByThread?: Record<string, string>;
      };
    store.setState({
      agentProvider: "llm",
      agentModel: "claude-haiku",
      agentModels: [
        { ...llmModel, id: "claude-haiku", label: "Claude Haiku" },
        llmModel
      ]
    });

    await store.getState().sendAgentMessage("thread-llm", "first");
    streamHandler?.({
      sessionId: "llm-session-old",
      done: false,
      message: {
        type: "assistant",
        uuid: "assistant-old",
        session_id: "db-thread-old",
        text: "old",
        content: [{ type: "text", text: "old" }]
      }
    });
    expect(resumeState().agentResumeSessionByThread?.["thread-llm"]).toBe(
      "db-thread-old"
    );

    store.getState().setAgentModel("claude-sonnet");
    await store.getState().sendAgentMessage("thread-llm", "second");
    expect(mockAgentClient.sendMessage).toHaveBeenLastCalledWith(
      "llm-session-new",
      "second"
    );

    streamHandler?.({
      sessionId: "llm-session-new",
      done: false,
      message: {
        type: "assistant",
        uuid: "assistant-new",
        session_id: "db-thread-new",
        text: "new",
        content: [{ type: "text", text: "new" }]
      }
    });
    expect(resumeState().agentResumeSessionByThread?.["thread-llm"]).toBe(
      "db-thread-new"
    );

    streamHandler?.({
      sessionId: "llm-session-old",
      done: false,
      message: {
        type: "assistant",
        uuid: "assistant-old-delayed",
        session_id: "db-thread-old-delayed",
        text: "late",
        content: [{ type: "text", text: "late" }]
      }
    });

    expect(resumeState().agentResumeSessionByThread?.["thread-llm"]).toBe(
      "db-thread-new"
    );
  });

  it("resumes LLM sessions with the real thread id after the live socket session is gone", async () => {
    mockAgentClient.createSession.mockResolvedValue("llm-session-resumed");
    const store = createTestStore();
    store.setState({
      agentProvider: "llm",
      agentModel: "claude-sonnet",
      agentModels: [llmModel],
      agentSessionByThread: {
        "thread-llm": "llm-session-after-reload"
      },
      agentThreadBySession: {},
      agentSessionConfigByThread: {
        "thread-llm": {
          provider: "llm",
          model: "claude-sonnet",
          workspacePath: null,
          chatProviderId: "anthropic"
        }
      },
      agentResumeSessionByThread: {
        "thread-llm": "db-thread-1"
      }
    } as Partial<TestChatAgentStore> & {
      agentResumeSessionByThread: Record<string, string>;
    });

    await store.getState().sendAgentMessage("thread-llm", "after reload");

    expect(mockAgentClient.createSession).toHaveBeenCalledWith({
      provider: "llm",
      model: "claude-sonnet",
      chatProviderId: "anthropic",
      resumeSessionId: "db-thread-1"
    });
    expect(mockAgentClient.sendMessage).toHaveBeenCalledWith(
      "llm-session-resumed",
      "after reload"
    );
  });

  it("does not resume persisted temporary LLM socket session ids", async () => {
    mockAgentClient.createSession.mockResolvedValue("llm-session-new");
    const store = createTestStore();
    store.setState({
      agentProvider: "llm",
      agentModel: "claude-sonnet",
      agentModels: [llmModel],
      agentSessionByThread: {
        "thread-llm": "llm-session-stale-test"
      },
      agentSessionConfigByThread: {
        "thread-llm": {
          provider: "llm",
          model: "claude-sonnet",
          workspacePath: null,
          chatProviderId: "anthropic"
        }
      }
    });

    await store.getState().sendAgentMessage("thread-llm", "resume me");

    expect(mockAgentClient.createSession).toHaveBeenCalledWith({
      provider: "llm",
      model: "claude-sonnet",
      chatProviderId: "anthropic"
    });
  });

  it("creates a new session after changing Pi workspace for an existing thread", async () => {
    mockAgentClient.createSession
      .mockResolvedValueOnce("session-workspace-a")
      .mockResolvedValueOnce("session-workspace-b");
    const store = createTestStore();
    store.setState({
      agentProvider: "pi",
      agentModel: "pi/claude",
      agentModels: [piModel],
      agentWorkspaceId: "workspace-a",
      agentWorkspacePath: "G:/Projects/a"
    });
    await store.getState().sendAgentMessage("thread-a", "first");

    store
      .getState()
      .setAgentWorkspace("workspace-b", "G:/Projects/b");
    await store.getState().sendAgentMessage("thread-a", "second");

    expect(mockAgentClient.createSession).toHaveBeenCalledTimes(2);
    expect(mockAgentClient.createSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        provider: "pi",
        model: "pi/claude",
        workspacePath: "G:/Projects/b"
      })
    );
  });

  it("drops stale model loads after the provider changes", async () => {
    const morpheusLoad = deferred<AgentModelDescriptor[]>();
    mockAgentClient.listModels.mockReturnValueOnce(morpheusLoad.promise);
    const store = createTestStore();

    const load = store.getState().loadAgentModels();
    store.getState().setAgentProvider("llm");
    morpheusLoad.resolve([morpheusModel]);
    await load;

    expect(store.getState().agentProvider).toBe("llm");
    expect(store.getState().agentModel).toBe("");
    expect(store.getState().agentModels).toEqual([]);
  });

  it("omits workspacePath when creating a Morpheus agent session", async () => {
    mockAgentClient.createSession.mockResolvedValue("session-morpheus");
    const store = createTestStore();
    store.setState({
      agentProvider: "morpheus",
      agentModel: "morpheus/default",
      agentWorkspaceId: "workspace-1",
      agentWorkspacePath: "G:/Projects/sample"
    });

    await store.getState().sendAgentMessage("thread-m", "paint the graph");

    const payload = mockAgentClient.createSession.mock.calls[0][0];
    expect(payload).toMatchObject({
      provider: "morpheus",
      model: "morpheus/default"
    });
    expect(payload).not.toHaveProperty("workspacePath");
  });

  it("does not pass stale persisted session ids when creating Morpheus sessions", async () => {
    mockAgentClient.createSession.mockResolvedValue("session-morpheus-new");
    const store = createTestStore();
    store.setState({
      agentProvider: "morpheus",
      agentModel: "morpheus/default",
      agentModels: [morpheusModel],
      agentSessionByThread: {
        "thread-m": "persisted-local-session"
      },
      agentSessionConfigByThread: {
        "thread-m": {
          provider: "morpheus",
          model: "morpheus/default",
          workspacePath: null,
          chatProviderId: null
        }
      }
    });

    await store.getState().sendAgentMessage("thread-m", "paint the graph");

    expect(mockAgentClient.createSession).toHaveBeenCalledWith({
      provider: "morpheus",
      model: "morpheus/default"
    });
  });

  it("includes workspacePath when creating a Pi agent session", async () => {
    mockAgentClient.createSession.mockResolvedValue("session-pi");
    const store = createTestStore();
    store.setState({
      agentProvider: "pi",
      agentModel: "pi/claude",
      agentModels: [piModel],
      agentWorkspaceId: "workspace-1",
      agentWorkspacePath: "G:/Projects/sample"
    });

    await store.getState().sendAgentMessage("thread-pi", "inspect files");

    expect(mockAgentClient.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "pi",
        model: "pi/claude",
        workspacePath: "G:/Projects/sample"
      })
    );
  });

  it("resumes legacy persisted Pi sessions when no session config was migrated", async () => {
    mockAgentClient.createSession.mockResolvedValue("session-pi-resumed");
    const store = createTestStore();
    store.setState({
      agentProvider: "pi",
      agentModel: "pi/claude",
      agentModels: [piModel],
      agentWorkspaceId: "workspace-1",
      agentWorkspacePath: "G:/Projects/sample",
      agentSessionByThread: {
        "thread-pi": "legacy-pi-session"
      },
      agentSessionConfigByThread: {}
    });

    await store.getState().sendAgentMessage("thread-pi", "continue");

    expect(mockAgentClient.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "pi",
        model: "pi/claude",
        workspacePath: "G:/Projects/sample",
        resumeSessionId: "legacy-pi-session"
      })
    );
    expect(mockAgentClient.sendMessage).toHaveBeenCalledWith(
      "session-pi-resumed",
      "continue"
    );
  });

  it("keeps Pi workspace-only by erroring before session creation without a workspace", async () => {
    const store = createTestStore();
    store.setState({
      agentProvider: "pi",
      agentModel: "pi/claude",
      agentModels: [piModel],
      agentWorkspaceId: null,
      agentWorkspacePath: null
    });

    await store.getState().sendAgentMessage("thread-pi", "inspect files");

    expect(mockAgentClient.createSession).not.toHaveBeenCalled();
    expect(store.getState().status).toBe("error");
    expect(store.getState().error).toBe(
      "Select a workspace before chatting with the Pi agent."
    );
  });
});
