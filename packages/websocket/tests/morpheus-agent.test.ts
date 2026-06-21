import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { initTestDb } from "@nodetool-ai/models";
import type { AgentTransport } from "../src/agent/transport.js";
import type { FrontendToolManifest } from "../src/agent/types.js";
import type { MorpheusStreamEvent } from "../src/agent/morpheus-client.js";

const makeStubSession = (providerName: string) => ({
  async send() {
    return [];
  },
  async interrupt() {},
  close() {},
  providerName,
});

vi.mock("../src/agent/pi-agent.js", () => ({
  PiQuerySession: class {
    async send() {
      return [];
    }
    async interrupt() {}
    close() {}
  },
  listPiModels: async () => [
    { id: "pi-model", label: "Pi Model", provider: "pi" },
  ],
  listPiSessions: async () => [],
  getPiSessionMessages: async () => [],
}));

vi.mock("../src/agent/llm-agent.js", () => ({
  LlmAgentSdkProvider: class {
    readonly name = "llm";

    async listModels() {
      return [
        {
          id: "llm-model",
          label: "LLM Model",
          provider: "llm",
          isDefault: true,
        },
      ];
    }

    createSession() {
      return makeStubSession("llm");
    }

    async listSessions() {
      return [];
    }

    async getSessionMessages() {
      return [];
    }
  },
}));

import { getAgentRuntime } from "../src/agent/agent-runtime.js";
import { MorpheusAgentSdkProvider } from "../src/agent/morpheus-agent.js";

interface FakeMorpheusClient {
  createSession: ReturnType<typeof vi.fn>;
  streamPrompt: ReturnType<typeof vi.fn>;
  submitToolResult: ReturnType<typeof vi.fn>;
}

const makeTransport = (): AgentTransport => ({
  streamMessage: vi.fn(),
  requestToolManifest: vi.fn(async () => []),
  executeTool: vi.fn(async () => ({ ok: true })),
  abortTools: vi.fn(),
  isAlive: true,
});

const makeClient = (
  events: MorpheusStreamEvent[],
  onStream?: (options: {
    agentId: string;
    sessionId: string;
    prompt: string;
    signal?: AbortSignal;
  }) => void | Promise<void>,
): FakeMorpheusClient => ({
  createSession: vi.fn(async () => ({ id: "remote-session-1" })),
  submitToolResult: vi.fn(async () => undefined),
  streamPrompt: vi.fn((options) =>
    (async function* () {
      await onStream?.(options);
      for (const event of events) {
        yield event;
      }
    })(),
  ),
});

const settleWithin = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<
  | { status: "resolved"; value: T }
  | { status: "rejected"; reason: unknown }
  | { status: "timeout" }
> =>
  Promise.race([
    promise.then(
      (value) => ({ status: "resolved" as const, value }),
      (reason: unknown) => ({ status: "rejected" as const, reason }),
    ),
    new Promise<{ status: "timeout" }>((resolve) => {
      setTimeout(() => resolve({ status: "timeout" }), timeoutMs);
    }),
  ]);

describe("MorpheusAgentSdkProvider", () => {
  beforeEach(() => {
    initTestDb();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("lists one canvas agent model when configured and no models otherwise", async () => {
    const missing = new MorpheusAgentSdkProvider({
      baseUrl: "",
    });
    await expect(missing.listModels("alice")).resolves.toEqual([]);

    const provider = new MorpheusAgentSdkProvider({
      baseUrl: "https://morpheus.example",
      agentId: "custom-canvas",
    });
    await expect(provider.listModels("alice")).resolves.toEqual([
      {
        id: "custom-canvas",
        label: "Morpheus Canvas Agent",
        provider: "morpheus",
        isDefault: true,
      },
    ]);
  });

  it("passes agent id and frontend tool manifests to Morpheus streamPrompt", async () => {
    const client = makeClient([{ type: "done" }]);
    const provider = new MorpheusAgentSdkProvider({
      baseUrl: "https://morpheus.example",
      agentId: "canvas-agent",
      clientFactory: () => client,
    });
    const session = provider.createSession({
      model: "nodetool-canvas",
      workspacePath: "",
      userId: "alice",
    });
    const manifest: FrontendToolManifest[] = [
      {
        name: "ui_add_node",
        description: "Add a node",
        parameters: {
          type: "object",
          properties: { type: { type: "string" } },
        },
      },
    ];

    await session.send("build", makeTransport(), "ui-session-1", manifest);

    expect(client.createSession).toHaveBeenCalledWith("canvas-agent", "alice");
    expect(client.streamPrompt).toHaveBeenCalledWith(
      {
        agentId: "canvas-agent",
        sessionId: "remote-session-1",
        prompt: "build",
        tools: manifest,
        signal: expect.any(AbortSignal),
      },
    );
  });

  it("routes forward_to_frontend nodetool calls to renderer tools and returns tool results", async () => {
    const client = makeClient([
      {
        type: "tool_call",
        id: "tool-1",
        name: "forward_to_frontend",
        arguments: {
          forwardType: "nodetool:ui_add_node",
          title: "Add node",
          payload: JSON.stringify({ type: "nodetool.text.Text" }),
        },
      },
      { type: "done" },
    ]);
    const provider = new MorpheusAgentSdkProvider({
      baseUrl: "https://morpheus.example",
      clientFactory: () => client,
    });
    const session = provider.createSession({
      model: "nodetool-canvas",
      workspacePath: "",
      userId: "alice",
    });
    const transport = makeTransport();
    vi.mocked(transport.executeTool).mockResolvedValueOnce({ nodeId: "n1" });

    const messages = await session.send("add node", transport, "ui-session-1", []);

    expect(transport.executeTool).toHaveBeenCalledWith(
      "ui-session-1",
      "tool-1",
      "ui_add_node",
      { type: "nodetool.text.Text" },
    );
    expect(client.submitToolResult).toHaveBeenCalledWith({
      agentId: "nodetool-canvas",
      sessionId: "remote-session-1",
      toolCallId: "tool-1",
      name: "forward_to_frontend",
      result: { nodeId: "n1" },
      isError: false,
      error: undefined,
      signal: expect.any(AbortSignal),
    });
    expect(messages).toContainEqual(
      expect.objectContaining({
        type: "assistant",
        uuid: "tool-1",
        tool_calls: [
          {
            id: "tool-1",
            type: "function",
            function: {
              name: "forward_to_frontend",
              arguments: JSON.stringify({
                forwardType: "nodetool:ui_add_node",
                title: "Add node",
                payload: JSON.stringify({ type: "nodetool.text.Text" }),
              }),
            },
          },
        ],
      }),
    );
    const toolResult = messages.find(
      (message) =>
        message.type === "result" &&
        message.subtype === "tool_result" &&
        message.text === JSON.stringify({ nodeId: "n1" }),
    );
    expect(toolResult).toEqual(
      expect.objectContaining({
        type: "result",
        is_error: false,
      }),
    );
    expect(toolResult?.uuid).not.toBe("tool-1");
  });

  it("surfaces Morpheus tool-result delivery failures as local tool errors", async () => {
    const client = makeClient([
      {
        type: "tool_call",
        id: "tool-1",
        name: "forward_to_frontend",
        arguments: {
          forwardType: "nodetool:ui_add_node",
          payload: JSON.stringify({ type: "nodetool.text.Text" }),
        },
      },
      { type: "done" },
    ]);
    client.submitToolResult.mockRejectedValueOnce(new Error("delivery failed"));
    const provider = new MorpheusAgentSdkProvider({
      baseUrl: "https://morpheus.example",
      clientFactory: () => client,
    });
    const session = provider.createSession({
      model: "nodetool-canvas",
      workspacePath: "",
      userId: "alice",
    });
    const transport = makeTransport();
    vi.mocked(transport.executeTool).mockResolvedValueOnce({ nodeId: "n1" });

    const messages = await session.send("add node", transport, "ui-session-1", []);

    expect(client.submitToolResult).toHaveBeenCalledTimes(2);
    expect(client.submitToolResult).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        toolCallId: "tool-1",
        isError: true,
        error: "delivery failed",
      }),
    );
    expect(messages).toContainEqual(
      expect.objectContaining({
        type: "result",
        subtype: "tool_result",
        text: "Error: delivery failed",
        is_error: true,
        errors: ["delivery failed"],
      }),
    );
    expect(
      messages.some(
        (message) =>
          message.type === "result" &&
          message.subtype === "tool_result" &&
          message.text === JSON.stringify({ nodeId: "n1" }) &&
          !message.is_error,
      ),
    ).toBe(false);
  });

  it("routes direct Morpheus manifest tool calls to renderer tools", async () => {
    const client = makeClient([
      {
        type: "tool_call",
        id: "direct-tool-1",
        name: "ui_get_graph",
        arguments: { includeSelection: true },
      },
      { type: "done" },
    ]);
    const provider = new MorpheusAgentSdkProvider({
      baseUrl: "https://morpheus.example",
      clientFactory: () => client,
    });
    const session = provider.createSession({
      model: "nodetool-canvas",
      workspacePath: "",
      userId: "alice",
    });
    const transport = makeTransport();
    vi.mocked(transport.executeTool).mockResolvedValueOnce({
      nodes: [{ id: "n1" }],
    });
    const manifest: FrontendToolManifest[] = [
      {
        name: "ui_get_graph",
        description: "Read the current graph",
        parameters: {
          type: "object",
          properties: { includeSelection: { type: "boolean" } },
        },
      },
    ];

    const messages = await session.send(
      "inspect graph",
      transport,
      "ui-session-1",
      manifest,
    );

    expect(transport.executeTool).toHaveBeenCalledWith(
      "ui-session-1",
      "direct-tool-1",
      "ui_get_graph",
      { includeSelection: true },
    );
    expect(client.submitToolResult).toHaveBeenCalledWith({
      agentId: "nodetool-canvas",
      sessionId: "remote-session-1",
      toolCallId: "direct-tool-1",
      name: "ui_get_graph",
      result: { nodes: [{ id: "n1" }] },
      isError: false,
      error: undefined,
      signal: expect.any(AbortSignal),
    });
    expect(messages).toContainEqual(
      expect.objectContaining({
        type: "assistant",
        uuid: "direct-tool-1",
        tool_calls: [
          {
            id: "direct-tool-1",
            type: "function",
            function: {
              name: "ui_get_graph",
              arguments: JSON.stringify({ includeSelection: true }),
            },
          },
        ],
      }),
    );
    expect(messages).toContainEqual(
      expect.objectContaining({
        type: "result",
        subtype: "tool_result",
        text: JSON.stringify({ nodes: [{ id: "n1" }] }),
        is_error: false,
      }),
    );
  });

  it("keeps streamed Morpheus transcripts available after the live turn", async () => {
    const client = makeClient([
      { type: "text_delta", text: "built" },
      { type: "text_delta", text: " graph" },
      { type: "done" },
    ]);
    const provider = new MorpheusAgentSdkProvider({
      baseUrl: "https://morpheus.example",
      clientFactory: () => client,
    });
    const session = provider.createSession({
      model: "nodetool-canvas",
      workspacePath: "",
      userId: "alice",
    });

    await session.send("build a graph", makeTransport(), "ui-session-history", []);

    await expect(
      provider.getSessionMessages({ sessionId: "ui-session-history" }, "alice"),
    ).resolves.toEqual([
      expect.objectContaining({
        type: "user",
        session_id: "ui-session-history",
        text: "build a graph",
      }),
      expect.objectContaining({
        type: "assistant",
        session_id: "ui-session-history",
        text: "built graph",
      }),
    ]);
    await expect(provider.listSessions({}, "alice")).resolves.toContainEqual(
      expect.objectContaining({
        sessionId: "ui-session-history",
        provider: "morpheus",
        firstPrompt: "build a graph",
        summary: "built graph",
      }),
    );
  });

  it("persists Morpheus transcript history outside the provider instance", async () => {
    const client = makeClient([
      { type: "text_delta", text: "built" },
      { type: "done" },
    ]);
    const provider = new MorpheusAgentSdkProvider({
      baseUrl: "https://morpheus.example",
      clientFactory: () => client,
    });
    const session = provider.createSession({
      model: "nodetool-canvas",
      workspacePath: "",
      userId: "alice",
    });

    await session.send("build a graph", makeTransport(), "ui-session-history", []);

    const reloadedProvider = new MorpheusAgentSdkProvider({
      baseUrl: "https://morpheus.example",
      clientFactory: () => makeClient([]),
    });
    await expect(
      reloadedProvider.getSessionMessages(
        { sessionId: "ui-session-history" },
        "alice",
      ),
    ).resolves.toEqual([
      expect.objectContaining({
        type: "user",
        session_id: "ui-session-history",
        text: "build a graph",
      }),
      expect.objectContaining({
        type: "assistant",
        session_id: "ui-session-history",
        text: "built",
      }),
    ]);
    await expect(reloadedProvider.listSessions({}, "alice")).resolves.toContainEqual(
      expect.objectContaining({
        sessionId: "ui-session-history",
        provider: "morpheus",
        firstPrompt: "build a graph",
      }),
    );
  });

  it("resumes persisted Morpheus history with the stored remote session id", async () => {
    const firstClient = makeClient([{ type: "done" }]);
    const firstProvider = new MorpheusAgentSdkProvider({
      baseUrl: "https://morpheus.example",
      clientFactory: () => firstClient,
    });
    const firstSession = firstProvider.createSession({
      model: "nodetool-canvas",
      workspacePath: "",
      userId: "alice",
    });
    await firstSession.send("start", makeTransport(), "ui-session-history", []);

    const resumedClient = makeClient([{ type: "done" }]);
    const resumedProvider = new MorpheusAgentSdkProvider({
      baseUrl: "https://morpheus.example",
      clientFactory: () => resumedClient,
    });
    const resumedSession = resumedProvider.createSession({
      model: "nodetool-canvas",
      workspacePath: "",
      userId: "alice",
      resumeSessionId: "ui-session-history",
    });

    await resumedSession.send("continue", makeTransport(), "ui-session-history", []);

    expect(resumedClient.createSession).not.toHaveBeenCalled();
    expect(resumedClient.streamPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: "remote-session-1",
        prompt: "continue",
      }),
    );
  });

  it("leaves Morpheus server-side tool calls remote-only", async () => {
    const client = makeClient([
      {
        type: "tool_call",
        id: "server-tool-1",
        name: "execute_skill_script",
        arguments: { skillName: "clinical-assistant" },
      },
      { type: "done" },
    ]);
    const provider = new MorpheusAgentSdkProvider({
      baseUrl: "https://morpheus.example",
      clientFactory: () => client,
    });
    const session = provider.createSession({
      model: "nodetool-canvas",
      workspacePath: "",
      userId: "alice",
    });
    const transport = makeTransport();

    const messages = await session.send("run skill", transport, "ui-session-1", []);

    expect(transport.executeTool).not.toHaveBeenCalled();
    expect(messages).toContainEqual(
      expect.objectContaining({
        type: "assistant",
        uuid: "server-tool-1",
        tool_calls: [
          {
            id: "server-tool-1",
            type: "function",
            function: {
              name: "execute_skill_script",
              arguments: JSON.stringify({ skillName: "clinical-assistant" }),
            },
          },
        ],
      }),
    );
    expect(
      messages.some(
        (message) =>
          message.type === "result" &&
          message.subtype === "tool_result" &&
          message.uuid === "server-tool-1",
      ),
    ).toBe(false);
  });

  it("skips unsupported forward_to_frontend calls with a local transcript result", async () => {
    const client = makeClient([
      {
        type: "tool_call",
        id: "tool-unsupported",
        name: "forward_to_frontend",
        arguments: {
          forwardType: "external:open_panel",
          payload: JSON.stringify({ panel: "models" }),
        },
      },
      { type: "done" },
    ]);
    const provider = new MorpheusAgentSdkProvider({
      baseUrl: "https://morpheus.example",
      clientFactory: () => client,
    });
    const session = provider.createSession({
      model: "nodetool-canvas",
      workspacePath: "",
      userId: "alice",
    });
    const transport = makeTransport();

    const messages = await session.send("open panel", transport, "ui-session-1", []);

    expect(transport.executeTool).not.toHaveBeenCalled();
    expect(client.submitToolResult).toHaveBeenCalledWith({
      agentId: "nodetool-canvas",
      sessionId: "remote-session-1",
      toolCallId: "tool-unsupported",
      name: "forward_to_frontend",
      result: undefined,
      isError: true,
      error: expect.stringContaining("Unsupported forward_to_frontend"),
      signal: expect.any(AbortSignal),
    });
    const toolResult = messages.find(
      (message) =>
        message.type === "result" &&
        message.subtype === "tool_result" &&
        message.text.includes("Unsupported forward_to_frontend"),
    );
    expect(toolResult).toEqual(
      expect.objectContaining({
        type: "result",
        is_error: true,
      }),
    );
    expect(toolResult?.uuid).not.toBe("tool-unsupported");
  });

  it("accumulates Morpheus text deltas under one stable assistant message id", async () => {
    const client = makeClient([
      { type: "text_delta", text: "hel" },
      { type: "text_delta", text: "lo" },
      { type: "done" },
    ]);
    const provider = new MorpheusAgentSdkProvider({
      baseUrl: "https://morpheus.example",
      clientFactory: () => client,
    });
    const session = provider.createSession({
      model: "nodetool-canvas",
      workspacePath: "",
      userId: "alice",
    });

    const messages = await session.send("say hello", makeTransport(), "ui-session-1", []);
    const assistantMessages = messages.filter(
      (message) => message.type === "assistant",
    );

    expect(assistantMessages).toHaveLength(2);
    expect(assistantMessages[0].uuid).toBe(assistantMessages[1].uuid);
    expect(assistantMessages.map((message) => message.text)).toEqual([
      "hel",
      "hello",
    ]);
    expect(assistantMessages[1].content).toEqual([
      { type: "text", text: "hello" },
    ]);
  });

  it("emits a clear error result and stops consuming after Morpheus error events", async () => {
    const client = makeClient([
      { type: "error", message: "remote exploded" },
      { type: "done" },
    ]);
    const provider = new MorpheusAgentSdkProvider({
      baseUrl: "https://morpheus.example",
      clientFactory: () => client,
    });
    const session = provider.createSession({
      model: "nodetool-canvas",
      workspacePath: "",
      userId: "alice",
    });

    const messages = await session.send("fail", makeTransport(), "ui-session-1", []);

    expect(messages).toContainEqual(
      expect.objectContaining({
        type: "result",
        subtype: "error",
        is_error: true,
        errors: ["remote exploded"],
      }),
    );
    expect(
      messages.some(
        (message) =>
          message.type === "result" && message.subtype === "success",
      ),
    ).toBe(false);
  });

  it("aborts the active Morpheus stream on interrupt", async () => {
    let streamSignal: AbortSignal | undefined;
    let resolveStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      resolveStarted = resolve;
    });
    const client = makeClient([], async ({ signal }) => {
      streamSignal = signal;
      resolveStarted?.();
      await new Promise<void>((resolve) => {
        signal?.addEventListener("abort", () => resolve(), { once: true });
      });
    });
    const provider = new MorpheusAgentSdkProvider({
      baseUrl: "https://morpheus.example",
      clientFactory: () => client,
    });
    const session = provider.createSession({
      model: "nodetool-canvas",
      workspacePath: "",
      userId: "alice",
    });

    const sendPromise = session.send("wait", makeTransport(), "ui-session-1", []);
    await started;
    await session.interrupt();

    expect(streamSignal?.aborted).toBe(true);
    await expect(sendPromise).resolves.toEqual([]);
  });

  it("aborts active renderer tool calls on interrupt and resolves promptly", async () => {
    const client = makeClient([
      {
        type: "tool_call",
        id: "tool-1",
        name: "forward_to_frontend",
        arguments: {
          forwardType: "nodetool:ui_add_node",
          payload: JSON.stringify({ type: "nodetool.text.Text" }),
        },
      },
      { type: "done" },
    ]);
    const provider = new MorpheusAgentSdkProvider({
      baseUrl: "https://morpheus.example",
      clientFactory: () => client,
    });
    const session = provider.createSession({
      model: "nodetool-canvas",
      workspacePath: "",
      userId: "alice",
    });
    const transport = makeTransport();
    let resolveToolStarted: (() => void) | undefined;
    const toolStarted = new Promise<void>((resolve) => {
      resolveToolStarted = resolve;
    });
    vi.mocked(transport.executeTool).mockImplementationOnce(() => {
      resolveToolStarted?.();
      return new Promise<unknown>(() => undefined);
    });

    const sendPromise = session.send("add node", transport, "ui-session-1", []);
    await toolStarted;
    await session.interrupt();

    expect(transport.abortTools).toHaveBeenCalledWith("ui-session-1");
    const settled = await settleWithin(sendPromise, 100);
    expect(settled.status).toBe("resolved");
  });
});

describe("AgentRuntime Morpheus provider selection", () => {
  beforeEach(() => {
    getAgentRuntime().closeAllSessions();
    vi.stubEnv("MORPHEUS_BASE_URL", "");
    vi.stubEnv("MORPHEUS_API_KEY", "");
    vi.stubEnv("MORPHEUS_AGENT_ID", "");
  });

  afterEach(() => {
    getAgentRuntime().closeAllSessions();
    vi.unstubAllEnvs();
  });

  it("creates explicit Morpheus sessions without requiring workspacePath", async () => {
    vi.stubEnv("MORPHEUS_BASE_URL", "https://morpheus.example");

    await expect(
      getAgentRuntime().createSession(
        { provider: "morpheus", model: "nodetool-canvas" },
        "alice",
      ),
    ).resolves.toMatch(/^morpheus-session-/);
  });

  it("keeps the requested Morpheus resume session id as the socket session id", async () => {
    vi.stubEnv("MORPHEUS_BASE_URL", "https://morpheus.example");

    await expect(
      getAgentRuntime().createSession(
        {
          provider: "morpheus",
          model: "nodetool-canvas",
          resumeSessionId: "ui-session-history",
        },
        "alice",
      ),
    ).resolves.toBe("ui-session-history");
    await expect(
      getAgentRuntime().createSession(
        {
          provider: "morpheus",
          model: "nodetool-canvas",
          resumeSessionId: "ui-session-history",
        },
        "alice",
      ),
    ).resolves.toBe("ui-session-history");
  });

  it("uses Morpheus by default when configured and falls back to llm otherwise", async () => {
    vi.stubEnv("MORPHEUS_BASE_URL", "https://morpheus.example");
    await expect(
      getAgentRuntime().createSession({ model: "nodetool-canvas" }, "alice"),
    ).resolves.toMatch(/^morpheus-session-/);

    getAgentRuntime().closeAllSessions();
    vi.stubEnv("MORPHEUS_BASE_URL", "");

    await expect(
      getAgentRuntime().createSession(
        { model: "llm-model", chatProviderId: "anthropic" },
        "alice",
      ),
    ).resolves.toMatch(/^llm-session-/);
  });

  it("preserves explicit llm and pi provider behavior", async () => {
    vi.stubEnv("MORPHEUS_BASE_URL", "https://morpheus.example");

    await expect(
      getAgentRuntime().createSession(
        { provider: "llm", model: "llm-model", chatProviderId: "anthropic" },
        "alice",
      ),
    ).resolves.toMatch(/^llm-session-/);

    await expect(
      getAgentRuntime().createSession({ provider: "pi", model: "pi-model" }, "alice"),
    ).rejects.toThrow(/workspacePath is required/);
  });
});
