import type { GlobalChatState } from "../GlobalChatStore";
import type { ChatAgentSlice } from "../chatAgent";
import { createChatAgentSlice } from "../chatAgent";

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

jest.mock("../../lib/tools/frontendToolsIpc", () => ({}));

type HarnessState = Partial<GlobalChatState> & ChatAgentSlice;

function createHarness(overrides: Partial<HarnessState> = {}) {
  let state: HarnessState;
  const set = (
    patch:
      | Partial<HarnessState>
      | ((current: HarnessState) => Partial<HarnessState>)
  ) => {
    const next = typeof patch === "function" ? patch(state) : patch;
    state = { ...state, ...next };
  };
  const get = () => state as GlobalChatState;
  state = {
    messageCache: {},
    status: "connected",
    error: null,
    currentThreadId: null,
    ...createChatAgentSlice(set as never, get as never),
    ...overrides
  } as HarnessState;

  return {
    get state() {
      return state;
    }
  };
}

describe("chatAgent slice", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAgentClient.sendMessage.mockResolvedValue(undefined);
    mockAgentClient.stopExecution.mockResolvedValue(undefined);
  });

  it("prefers Morpheus models when available", async () => {
    mockAgentClient.listModels.mockResolvedValueOnce([
      {
        id: "nodetool-canvas",
        label: "MorpheusCore (nodetool-canvas)",
        provider: "morpheus",
        isDefault: true
      }
    ]);
    const harness = createHarness();

    await harness.state.loadAgentModels();

    expect(mockAgentClient.listModels).toHaveBeenCalledWith({
      provider: "morpheus"
    });
    expect(harness.state.agentProvider).toBe("morpheus");
    expect(harness.state.agentModel).toBe("nodetool-canvas");
  });

  it("falls back to LLM models when Morpheus is unavailable", async () => {
    mockAgentClient.listModels
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "claude-sonnet",
          label: "Claude Sonnet",
          provider: "llm",
          chatProviderId: "anthropic",
          isDefault: true
        }
      ]);
    const harness = createHarness();

    await harness.state.loadAgentModels();

    expect(mockAgentClient.listModels).toHaveBeenNthCalledWith(1, {
      provider: "morpheus"
    });
    expect(mockAgentClient.listModels).toHaveBeenNthCalledWith(2, {
      provider: "llm"
    });
    expect(harness.state.agentProvider).toBe("llm");
    expect(harness.state.agentModel).toBe("claude-sonnet");
  });

  it("creates Morpheus sessions without workspacePath", async () => {
    mockAgentClient.createSession.mockResolvedValueOnce("morph-session-1");
    const harness = createHarness({
      agentProvider: "morpheus",
      agentModel: "nodetool-canvas"
    });

    await harness.state.sendAgentMessage("thread-1", "hello");

    expect(mockAgentClient.createSession).toHaveBeenCalledWith({
      provider: "morpheus",
      model: "nodetool-canvas"
    });
    expect(mockAgentClient.sendMessage).toHaveBeenCalledWith(
      "morph-session-1",
      "hello"
    );
    expect(harness.state.agentSessionByThread["thread-1"]).toBe(
      "morph-session-1"
    );
  });

  it("keeps workspacePath for explicit Pi sessions", async () => {
    mockAgentClient.createSession.mockResolvedValueOnce("pi-session-1");
    const harness = createHarness({
      agentProvider: "pi",
      agentModel: "anthropic/claude",
      agentWorkspacePath: "G:/Projects/nodetool"
    });

    await harness.state.sendAgentMessage("thread-1", "hello");

    expect(mockAgentClient.createSession).toHaveBeenCalledWith({
      provider: "pi",
      model: "anthropic/claude",
      workspacePath: "G:/Projects/nodetool"
    });
  });
});
