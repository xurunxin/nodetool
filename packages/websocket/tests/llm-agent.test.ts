/**
 * LlmAgentSdkProvider + LlmAgentSession persistence and user scope.
 *
 * Tests that:
 *   - send() creates a Thread on first call, then persists user + assistant
 *     messages with agent_execution_id="llm-agent" and provider/model
 *     stamped from the session.
 *   - send() with `resumeSessionId` (== threadId) hydrates the existing
 *     transcript before the LLM call, so the model sees prior turns.
 *   - listSessions returns only threads belonging to the calling user, and
 *     skips threads whose first message lacks the llm-agent marker.
 *   - getSessionMessages refuses cross-user reads (returns empty even if
 *     the thread exists for another user).
 *
 * The harness providers are stubbed so the LLM provider path is exercised
 * in isolation.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  initTestDb,
  Thread,
  Message,
  Setting,
  Secret,
  clearSecretCache,
} from "@nodetool-ai/models";
import {
  CUSTOM_MODEL_ENDPOINTS_SETTING,
  customEndpointProviderId,
  customEndpointSecretKey,
} from "../src/custom-model-endpoints.js";
import {
  getProvider,
  isProviderConfigured,
  listRegisteredProviderIds,
} from "@nodetool-ai/runtime";

// ── Mocks ─────────────────────────────────────────────────────────────

// vi.mock factories run before module-scope `const`s are initialized, so
// declare the spy via vi.hoisted() and reference it from the factory.
// Mimics the real processChat shape: append the user message first
// (just like message-processor.ts line 110), then a fake assistant reply.
const {
  processChatSpy,
  resolveNodeToolProviderSpy,
  graphPlannerOptions,
} = vi.hoisted(() => ({
  processChatSpy: vi.fn(
    async (opts: { messages: any[]; userInput: string }) => {
      opts.messages.push({ role: "user", content: opts.userInput });
      opts.messages.push({ role: "assistant", content: "ok" });
      return opts.messages;
    },
  ),
  resolveNodeToolProviderSpy: vi.fn(async (providerId: string) => ({
    provider: providerId,
    hasToolSupport: async () => true,
    getAvailableLanguageModels: async () => [],
  })),
  graphPlannerOptions: [] as any[],
}));

vi.mock("@nodetool-ai/chat", () => ({
  processChat: processChatSpy,
}));

vi.mock("@nodetool-ai/agents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nodetool-ai/agents")>();
  return {
    ...actual,
    GraphPlanner: class {
      constructor(options: any) {
        graphPlannerOptions.push(options);
      }

      async *plan() {
        return { nodes: [], edges: [] };
      }
    },
  };
});

vi.mock("../src/agent/pi-agent.js", () => ({
  PiQuerySession: class {},
  listPiModels: async () => [],
  listPiSessions: async () => [],
  getPiSessionMessages: async () => [],
}));

vi.mock("../src/custom-provider-resolver.js", () => ({
  resolveNodeToolProvider: resolveNodeToolProviderSpy,
}));

vi.mock("@nodetool-ai/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nodetool-ai/runtime")>();
  return {
    ...actual,
    getProvider: vi.fn(async () => ({
      provider: "anthropic",
      hasToolSupport: async () => true,
      getAvailableLanguageModels: async () => [],
    })),
    isProviderConfigured: vi.fn(async () => true),
    listRegisteredProviderIds: vi.fn(() => ["anthropic"]),
  };
});

import {
  LlmAgentSdkProvider,
  setLlmAgentGraphPlannerRegistry,
} from "../src/agent/llm-agent.js";

// ── Helpers ───────────────────────────────────────────────────────────

const originalModelSurface = process.env.NODETOOL_MODEL_SURFACE;

function resetModelSurface(): void {
  if (originalModelSurface == null) {
    delete process.env.NODETOOL_MODEL_SURFACE;
    return;
  }
  process.env.NODETOOL_MODEL_SURFACE = originalModelSurface;
}

const makeTransport = () => ({
  streamMessage: vi.fn(),
  requestToolManifest: vi.fn(async () => []),
  executeTool: vi.fn(async () => ({})),
  abortTools: vi.fn(),
  isAlive: true,
});

const customEndpoint = (overrides: Record<string, unknown> = {}) => ({
  id: "custom_gateway",
  name: "Custom Gateway",
  kind: "openai",
  baseUrl: "https://custom.example.test/v1",
  enabled: true,
  models: [
    {
      id: "custom-chat",
      name: "Custom Chat",
      contextWindow: 128000,
    },
  ],
  createdAt: "2026-06-14T00:00:00.000Z",
  updatedAt: "2026-06-14T00:00:00.000Z",
  ...overrides,
});

async function saveCustomEndpoints(
  userId: string,
  endpoints: Array<Record<string, unknown>>,
): Promise<void> {
  await Setting.upsert({
    userId,
    key: CUSTOM_MODEL_ENDPOINTS_SETTING,
    value: JSON.stringify(endpoints),
    description: "Custom OpenAI/Anthropic-compatible model endpoints",
  });
}

async function saveRawCustomEndpointsSetting(
  userId: string,
  value: string,
): Promise<void> {
  await Setting.upsert({
    userId,
    key: CUSTOM_MODEL_ENDPOINTS_SETTING,
    value,
    description: "Custom OpenAI/Anthropic-compatible model endpoints",
  });
}

async function saveCustomEndpointSecret(
  userId: string,
  endpointId: string,
): Promise<void> {
  const key = customEndpointSecretKey(endpointId);
  await Secret.upsert({
    userId,
    key,
    value: "sk-test",
    description: "Test custom model endpoint API key",
  });
  clearSecretCache(userId, key);
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("LlmAgentSession persistence", () => {
  beforeEach(() => {
    initTestDb();
    delete process.env.NODETOOL_MODEL_SURFACE;
    processChatSpy.mockClear();
    resolveNodeToolProviderSpy.mockClear();
    graphPlannerOptions.length = 0;
  });

  afterEach(() => {
    resetModelSurface();
  });

  it("creates a Thread on first send() and persists user + assistant messages", async () => {
    const provider = new LlmAgentSdkProvider();
    const session = provider.createSession({
      model: "claude-sonnet-4-6",
      workspacePath: "",
      userId: "alice",
      chatProviderId: "anthropic",
    });

    const transport = makeTransport();
    await session.send("hello", transport, "tmp-id-1", []);

    // The session should have created exactly one thread for Alice.
    const [threads] = await Thread.paginate("alice", { limit: 10 });
    expect(threads).toHaveLength(1);
    const threadId = threads[0].id;

    // System prompt is intentionally NOT persisted — only the visible
    // transcript (user, assistant, tool messages) gets stored.
    const [rows] = await Message.paginate(threadId, { limit: 100 });
    const userRow = rows.find((r) => r.role === "user");
    const assistantRow = rows.find((r) => r.role === "assistant");
    expect(userRow).toBeDefined();
    expect(assistantRow).toBeDefined();
    expect(userRow?.content).toBe("hello");
    expect(assistantRow?.content).toBe("ok");
    // Marker + provider/model stamped so listSessions can find it later.
    expect(userRow?.agent_execution_id).toBe("llm-agent");
    expect(userRow?.provider).toBe("anthropic");
    expect(userRow?.model).toBe("claude-sonnet-4-6");
    expect(userRow?.user_id).toBe("alice");
  });

  it("does NOT persist the system prompt (server-side concern)", async () => {
    const provider = new LlmAgentSdkProvider();
    const session = provider.createSession({
      model: "m",
      workspacePath: "",
      userId: "alice",
      chatProviderId: "anthropic",
    });
    await session.send("hi", makeTransport(), "tmp", []);

    const [threads] = await Thread.paginate("alice", { limit: 10 });
    const [rows] = await Message.paginate(threads[0].id, { limit: 100 });
    expect(rows.find((r) => r.role === "system")).toBeUndefined();
  });

  it("hydrates conversation history from DB on resume (resumeSessionId)", async () => {
    // First session: create a thread with two turns of history.
    const first = new LlmAgentSdkProvider().createSession({
      model: "m",
      workspacePath: "",
      userId: "alice",
      chatProviderId: "anthropic",
    });
    await first.send("turn 1", makeTransport(), "tmp", []);
    await first.send("turn 2", makeTransport(), "tmp", []);

    const [threads] = await Thread.paginate("alice", { limit: 10 });
    const threadId = threads[0].id;

    // Snapshot the messages-on-entry length inside the spy, since the
    // default spy mutates the array after capture (the message reference
    // would otherwise reflect post-call state).
    let lengthOnEntry = -1;
    let firstRoleOnEntry: string | undefined;
    let secondRoleOnEntry: string | undefined;
    let thirdRoleOnEntry: string | undefined;
    processChatSpy.mockImplementationOnce(
      async (opts: { messages: any[]; userInput: string }) => {
        lengthOnEntry = opts.messages.length;
        firstRoleOnEntry = opts.messages[0]?.role;
        secondRoleOnEntry = opts.messages[1]?.role;
        thirdRoleOnEntry = opts.messages[2]?.role;
        opts.messages.push({ role: "user", content: opts.userInput });
        opts.messages.push({ role: "assistant", content: "ok" });
        return opts.messages;
      },
    );

    const second = new LlmAgentSdkProvider().createSession({
      model: "m",
      workspacePath: "",
      userId: "alice",
      chatProviderId: "anthropic",
      resumeSessionId: threadId,
    });
    await second.send("turn 3", makeTransport(), "tmp", []);

    // Hydrated 4 prior messages (2 user + 2 assistant) plus the server-side
    // system prompt, which is intentionally not persisted between sessions.
    expect(lengthOnEntry).toBe(5);
    expect(firstRoleOnEntry).toBe("system");
    expect(secondRoleOnEntry).toBe("user");
    expect(thirdRoleOnEntry).toBe("assistant");

    const [rowsAfterResume] = await Message.paginate(threadId, { limit: 100 });
    expect(rowsAfterResume).toHaveLength(6);
    expect(rowsAfterResume.find((r) => r.role === "system")).toBeUndefined();
  });

  it("refuses to resume a thread that belongs to another user", async () => {
    const aliceSession = new LlmAgentSdkProvider().createSession({
      model: "m",
      workspacePath: "",
      userId: "alice",
      chatProviderId: "anthropic",
    });
    await aliceSession.send("private", makeTransport(), "tmp", []);
    const [threads] = await Thread.paginate("alice", { limit: 10 });
    const aliceThreadId = threads[0].id;

    // Bob tries to resume Alice's thread. send() returns an error result
    // (and emits it via onMessage if provided) rather than throwing — the
    // renderer surfaces the error to the user. AgentRuntime.sendMessageStreaming
    // is what bridges onMessage to transport.streamMessage; we test the
    // session in isolation here, so assert on the return value directly.
    const bobSession = new LlmAgentSdkProvider().createSession({
      model: "m",
      workspacePath: "",
      userId: "bob",
      chatProviderId: "anthropic",
      resumeSessionId: aliceThreadId,
    });
    const out = await bobSession.send("steal?", makeTransport(), "tmp", []);

    const errorMsgs = out.filter((m) => m.is_error === true);
    expect(errorMsgs.length).toBeGreaterThan(0);
    expect(errorMsgs[0].errors?.[0]).toMatch(/not found for user bob/);

    // Ensure no rows got stamped under bob in Alice's thread.
    const [rows] = await Message.paginate(aliceThreadId, { limit: 100 });
    const bobRows = rows.filter((r) => r.user_id === "bob");
    expect(bobRows).toHaveLength(0);
  });

  it("resolves custom chat providers through the websocket custom resolver", async () => {
    const provider = new LlmAgentSdkProvider();
    const customProviderId = customEndpointProviderId("custom_gateway");
    const session = provider.createSession({
      model: "custom-chat",
      workspacePath: "",
      userId: "alice",
      chatProviderId: customProviderId,
    });

    await session.send("hello", makeTransport(), "tmp-id-1", []);

    expect(resolveNodeToolProviderSpy).toHaveBeenCalledWith(
      customProviderId,
      "alice",
    );
  });

  it("adds custom endpoints to graph planner model lookup", async () => {
    const customProviderId = customEndpointProviderId("custom_gateway");
    await saveCustomEndpoints("alice", [customEndpoint()]);
    await saveCustomEndpointSecret("alice", "custom_gateway");
    setLlmAgentGraphPlannerRegistry({} as never);
    processChatSpy.mockImplementationOnce(
      async (opts: {
        context: unknown;
        messages: any[];
        tools: Array<{ name: string; process: (...args: any[]) => Promise<unknown> }>;
        userInput: string;
      }) => {
        const plannerTool = opts.tools.find(
          (tool) => tool.name === "plan_workflow_graph",
        );
        await plannerTool?.process(opts.context, {
          objective: "build a graph",
          apply_to_canvas: false,
        });
        opts.messages.push({ role: "user", content: opts.userInput });
        opts.messages.push({ role: "assistant", content: "ok" });
        return opts.messages;
      },
    );
    const provider = new LlmAgentSdkProvider();
    const session = provider.createSession({
      model: "claude-sonnet",
      workspacePath: "",
      userId: "alice",
      chatProviderId: "anthropic",
    });

    await session.send("plan", makeTransport(), "tmp-id-1", []);

    const plannerProviders = graphPlannerOptions[0]?.providers;
    expect(plannerProviders).toHaveProperty(customProviderId);
    await expect(
      plannerProviders[customProviderId].getAvailableLanguageModels(),
    ).resolves.toEqual([
      {
        id: "custom-chat",
        name: "Custom Chat",
        provider: customProviderId,
      },
    ]);
  });

  it("rejects local-only chatProviderId in API-first mode before resolving the provider", async () => {
    const provider = new LlmAgentSdkProvider();
    const session = provider.createSession({
      model: "llama3",
      workspacePath: "",
      userId: "alice",
      chatProviderId: "ollama",
    });

    const result = await session.send("hello", makeTransport(), "tmp-id-1", []);

    expect(result).toContainEqual(
      expect.objectContaining({
        type: "result",
        subtype: "error",
        is_error: true,
        errors: [expect.stringMatching(/ollama.*disabled.*model surface/i)],
      }),
    );
    expect(resolveNodeToolProviderSpy).not.toHaveBeenCalled();
  });

  it("allows local-only chatProviderId in local-first mode", async () => {
    process.env.NODETOOL_MODEL_SURFACE = "local_first";
    const provider = new LlmAgentSdkProvider();
    const session = provider.createSession({
      model: "llama3",
      workspacePath: "",
      userId: "alice",
      chatProviderId: "ollama",
    });

    const result = await session.send("hello", makeTransport(), "tmp-id-1", []);

    expect(result).toContainEqual(
      expect.objectContaining({
        type: "result",
        subtype: "success",
        is_error: false,
      }),
    );
    expect(resolveNodeToolProviderSpy).toHaveBeenCalledWith("ollama", "alice");
  });
});

describe("LlmAgentSdkProvider listModels", () => {
  beforeEach(() => {
    initTestDb();
    delete process.env.NODETOOL_MODEL_SURFACE;
    vi.clearAllMocks();
    vi.mocked(listRegisteredProviderIds).mockReturnValue(["anthropic"]);
    vi.mocked(isProviderConfigured).mockResolvedValue(true);
    vi.mocked(getProvider).mockResolvedValue({
      provider: "anthropic",
      hasToolSupport: async () => true,
      getAvailableLanguageModels: async () => [],
    } as never);
  });

  afterEach(() => {
    resetModelSurface();
  });

  it("includes keyed custom endpoint models and skips disabled or keyless endpoints", async () => {
    const customProviderId = customEndpointProviderId("custom_gateway");
    await saveCustomEndpoints("alice", [
      customEndpoint(),
      customEndpoint({
        id: "keyless_gateway",
        name: "Keyless Gateway",
        models: [{ id: "keyless-chat", name: "Keyless Chat" }],
      }),
      customEndpoint({
        id: "disabled_gateway",
        name: "Disabled Gateway",
        enabled: false,
        models: [{ id: "disabled-chat", name: "Disabled Chat" }],
      }),
    ]);
    await saveCustomEndpointSecret("alice", "custom_gateway");

    const models = await new LlmAgentSdkProvider().listModels("alice");

    expect(models).toContainEqual(
      expect.objectContaining({
        id: "custom-chat",
        label: `Custom Chat (${customProviderId})`,
        provider: "llm",
        chatProviderId: customProviderId,
      }),
    );
    expect(models.map((model) => model.id)).not.toContain("keyless-chat");
    expect(models.map((model) => model.id)).not.toContain("disabled-chat");
  });

  it("includes custom endpoint models before truncating large provider catalogs", async () => {
    const customProviderId = customEndpointProviderId("custom_gateway");
    await saveCustomEndpoints("alice", [customEndpoint()]);
    await saveCustomEndpointSecret("alice", "custom_gateway");
    vi.mocked(getProvider).mockResolvedValueOnce({
      provider: "anthropic",
      hasToolSupport: async () => true,
      getAvailableLanguageModels: async () =>
        Array.from({ length: 220 }, (_value, index) => ({
          id: `claude-${index}`,
          name: `Claude ${index}`,
          provider: "anthropic",
        })),
    } as never);

    const models = await new LlmAgentSdkProvider().listModels("alice");

    expect(models).toHaveLength(200);
    expect(models[0]).toEqual(
      expect.objectContaining({
        id: "custom-chat",
        label: `Custom Chat (${customProviderId})`,
        provider: "llm",
        chatProviderId: customProviderId,
        isDefault: true,
      }),
    );
    expect(models.map((model) => model.id)).not.toContain("claude-199");
  });

  it("keeps standard provider models when custom endpoint metadata is invalid", async () => {
    vi.mocked(getProvider).mockResolvedValueOnce({
      provider: "anthropic",
      hasToolSupport: async () => true,
      getAvailableLanguageModels: async () => [
        {
          id: "claude-standard",
          name: "Claude Standard",
          provider: "anthropic",
        },
      ],
    } as never);
    await saveRawCustomEndpointsSetting("alice", "{invalid custom endpoints");

    const models = await new LlmAgentSdkProvider().listModels("alice");

    expect(models).toContainEqual(
      expect.objectContaining({
        id: "claude-standard",
        label: "Claude Standard (anthropic)",
        provider: "llm",
        chatProviderId: "anthropic",
        isDefault: true,
      }),
    );
  });

  it("hides local-only provider models in API-first mode", async () => {
    vi.mocked(listRegisteredProviderIds).mockReturnValue(["anthropic", "ollama"]);
    vi.mocked(getProvider).mockImplementation(
      async (providerId: string) =>
        ({
          provider: providerId,
          hasToolSupport: async () => true,
          getAvailableLanguageModels: async () => [
            {
              id: `${providerId}-chat`,
              name: `${providerId} Chat`,
              provider: providerId,
            },
          ],
        }) as never,
    );

    const models = await new LlmAgentSdkProvider().listModels("alice");

    expect(models).toContainEqual(
      expect.objectContaining({
        id: "anthropic-chat",
        chatProviderId: "anthropic",
      }),
    );
    expect(models.map((model) => model.id)).not.toContain("ollama-chat");
    expect(getProvider).not.toHaveBeenCalledWith(
      "ollama",
      expect.any(Function),
    );
  });

  it("shows local-only provider models in local-first mode", async () => {
    process.env.NODETOOL_MODEL_SURFACE = "local_first";
    vi.mocked(listRegisteredProviderIds).mockReturnValue(["anthropic", "ollama"]);
    vi.mocked(getProvider).mockImplementation(
      async (providerId: string) =>
        ({
          provider: providerId,
          hasToolSupport: async () => true,
          getAvailableLanguageModels: async () => [
            {
              id: `${providerId}-chat`,
              name: `${providerId} Chat`,
              provider: providerId,
            },
          ],
        }) as never,
    );

    const models = await new LlmAgentSdkProvider().listModels("alice");

    expect(models).toContainEqual(
      expect.objectContaining({
        id: "ollama-chat",
        chatProviderId: "ollama",
      }),
    );
  });
});

describe("LlmAgentSdkProvider listSessions", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("returns only threads belonging to the calling user", async () => {
    const aliceSession = new LlmAgentSdkProvider().createSession({
      model: "m",
      workspacePath: "",
      userId: "alice",
      chatProviderId: "anthropic",
    });
    await aliceSession.send("alice msg", makeTransport(), "tmp", []);

    const bobSession = new LlmAgentSdkProvider().createSession({
      model: "m",
      workspacePath: "",
      userId: "bob",
      chatProviderId: "anthropic",
    });
    await bobSession.send("bob msg", makeTransport(), "tmp", []);

    const aliceList = await new LlmAgentSdkProvider().listSessions(
      {},
      "alice",
    );
    expect(aliceList).toHaveLength(1);
    expect(aliceList[0].summary).toBe("alice msg");

    const bobList = await new LlmAgentSdkProvider().listSessions({}, "bob");
    expect(bobList).toHaveLength(1);
    expect(bobList[0].summary).toBe("bob msg");
  });

  it("skips threads whose first message lacks the llm-agent marker", async () => {
    // Insert a non-agent thread directly — simulates a regular chat
    // thread that happens to belong to the same user.
    const thread = await Thread.create({ user_id: "alice", title: "" });
    await Message.create({
      thread_id: thread.id,
      user_id: "alice",
      role: "user",
      content: "regular chat",
      // no agent_execution_id => not an LLM agent thread
    });

    // Now an actual LLM agent thread.
    const session = new LlmAgentSdkProvider().createSession({
      model: "m",
      workspacePath: "",
      userId: "alice",
      chatProviderId: "anthropic",
    });
    await session.send("agent msg", makeTransport(), "tmp", []);

    const list = await new LlmAgentSdkProvider().listSessions({}, "alice");
    expect(list).toHaveLength(1);
    expect(list[0].summary).toBe("agent msg");
  });

  it("refuses an empty userId", async () => {
    await expect(
      new LlmAgentSdkProvider().listSessions({}, ""),
    ).rejects.toThrow(/authenticated userId/i);
  });
});

describe("LlmAgentSdkProvider getSessionMessages", () => {
  beforeEach(() => {
    initTestDb();
  });

  it("refuses cross-user reads (returns empty for non-owner)", async () => {
    const session = new LlmAgentSdkProvider().createSession({
      model: "m",
      workspacePath: "",
      userId: "alice",
      chatProviderId: "anthropic",
    });
    await session.send("private", makeTransport(), "tmp", []);
    const [threads] = await Thread.paginate("alice", { limit: 10 });
    const threadId = threads[0].id;

    // Alice can read.
    const aliceMsgs = await new LlmAgentSdkProvider().getSessionMessages(
      { sessionId: threadId },
      "alice",
    );
    expect(aliceMsgs.length).toBeGreaterThan(0);

    // Bob cannot — returns empty even though the thread exists.
    const bobMsgs = await new LlmAgentSdkProvider().getSessionMessages(
      { sessionId: threadId },
      "bob",
    );
    expect(bobMsgs).toHaveLength(0);
  });

  it("filters out non-agent messages even within an owned thread", async () => {
    // Hand-craft a thread that mixes both kinds of messages — tests the
    // marker filter inside getSessionMessages.
    const thread = await Thread.create({ user_id: "alice", title: "" });
    await Message.create({
      thread_id: thread.id,
      user_id: "alice",
      role: "user",
      content: "agent message",
      agent_execution_id: "llm-agent",
    });
    await Message.create({
      thread_id: thread.id,
      user_id: "alice",
      role: "user",
      content: "non-agent leak",
      // no marker — should be skipped
    });

    const msgs = await new LlmAgentSdkProvider().getSessionMessages(
      { sessionId: thread.id },
      "alice",
    );
    expect(msgs).toHaveLength(1);
    expect(msgs[0].text).toBe("agent message");
  });
});
