import { createStore } from "zustand/vanilla";
import type { StoreApi } from "zustand/vanilla";
import { createChatAgentSlice, type ChatAgentSlice } from "../chatAgent";
import type { AgentModelDescriptor } from "../../lib/agent/agentTypes";

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
