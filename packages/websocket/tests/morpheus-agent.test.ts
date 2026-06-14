import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentMessage,
  FrontendToolManifest,
} from "../src/agent/types.js";
import type { AgentTransport } from "../src/agent/transport.js";
import type {
  MorpheusStreamEvent,
} from "../src/agent/morpheus-client.js";
import {
  MORPHEUS_DEFAULT_AGENT_NAME,
  MorpheusAgentSdkProvider,
  type MorpheusAgentClient,
} from "../src/agent/morpheus-agent.js";

vi.mock("../src/agent/pi-agent.js", () => ({
  PiQuerySession: class {
    async send() {
      return [];
    }
    async interrupt() {}
    close() {}
  },
  listPiModels: async () => [],
  listPiSessions: async () => [],
  getPiSessionMessages: async () => [],
}));

vi.mock("@nodetool-ai/chat", () => ({
  processChat: vi.fn(),
}));

vi.mock("@nodetool-ai/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nodetool-ai/runtime")>();
  return {
    ...actual,
    getProvider: vi.fn(),
    isProviderConfigured: vi.fn(async () => true),
    listRegisteredProviderIds: vi.fn(() => []),
  };
});

function makeTransport(): AgentTransport {
  return {
    streamMessage: vi.fn(),
    requestToolManifest: vi.fn(async () => []),
    executeTool: vi.fn(async () => ({})),
    abortTools: vi.fn(),
    isAlive: true,
  };
}

function makeClient(events: MorpheusStreamEvent[]): MorpheusAgentClient {
  return {
    createSession: vi.fn(async () => ({
      id: "morph-session-1",
      agentName: MORPHEUS_DEFAULT_AGENT_NAME,
      raw: {},
    })),
    streamPrompt: vi.fn(async function* () {
      for (const event of events) {
        yield event;
      }
    }),
  };
}

describe("MorpheusAgentSdkProvider", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it("lists the configured MorpheusCore agent as a default model", async () => {
    const provider = new MorpheusAgentSdkProvider({
      env: {
        MORPHEUS_BASE_URL: "http://localhost:3000",
        MORPHEUS_API_KEY: "sk-test",
        MORPHEUS_AGENT_NAME: "nodetool-canvas",
      },
    });

    await expect(provider.listModels("alice")).resolves.toEqual([
      {
        id: "nodetool-canvas",
        label: "MorpheusCore (nodetool-canvas)",
        provider: "morpheus",
        isDefault: true,
        supportsReasoningEffort: true,
      },
    ]);
  });

  it("streams Morpheus events as NodeTool agent messages", async () => {
    const client = makeClient([
      { type: "session", sessionId: "morph-session-1" },
      { type: "text_delta", text: "Hel" },
      { type: "text_delta", text: "lo" },
      { type: "thinking_delta", text: "checking graph" },
      {
        type: "tool_call",
        id: "call_1",
        name: "forward_to_frontend",
        arguments: {
          forwardType: "nodetool:ui_graph",
          payload: "{\"action\":\"inspect\"}",
        },
        workDescription: "Forwarding to canvas",
      },
      {
        type: "tool_result",
        id: "call_1",
        name: "forward_to_frontend",
        result: { details: { forwarded: true } },
        isError: false,
        details: null,
      },
      { type: "done" },
    ]);
    const provider = new MorpheusAgentSdkProvider({
      env: {
        MORPHEUS_BASE_URL: "http://localhost:3000",
        MORPHEUS_API_KEY: "sk-test",
      },
      clientFactory: () => client,
    });
    const session = provider.createSession({
      model: "nodetool-canvas",
      workspacePath: "",
      userId: "alice",
      modelParams: { reasoningEffort: "high" },
    });
    const streamed: AgentMessage[] = [];

    const output = await session.send(
      "inspect the canvas",
      makeTransport(),
      "tmp-session",
      [] satisfies FrontendToolManifest[],
      (message) => streamed.push(message),
    );

    expect(output).toEqual(streamed);
    expect(client.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ agentName: "nodetool-canvas" }),
    );
    expect(client.streamPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "inspect the canvas",
        sessionId: "morph-session-1",
        agentName: "nodetool-canvas",
        thinkingLevel: "high",
      }),
    );
    expect(streamed).toEqual([
      expect.objectContaining({
        type: "assistant",
        session_id: "morph-session-1",
        text: "Hel",
        content: [{ type: "text", text: "Hel" }],
      }),
      expect.objectContaining({
        type: "assistant",
        session_id: "morph-session-1",
        text: "Hello",
        content: [{ type: "text", text: "Hello" }],
      }),
      expect.objectContaining({
        type: "stream_event",
        session_id: "morph-session-1",
        event_type: "morpheus_thinking_delta",
        event: { text: "checking graph" },
      }),
      expect.objectContaining({
        type: "assistant",
        session_id: "morph-session-1",
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: {
              name: "forward_to_frontend",
              arguments: JSON.stringify({
                forwardType: "nodetool:ui_graph",
                payload: "{\"action\":\"inspect\"}",
              }),
            },
          },
        ],
      }),
      expect.objectContaining({
        type: "stream_event",
        session_id: "morph-session-1",
        event_type: "morpheus_tool_result",
        event: expect.objectContaining({
          id: "call_1",
          name: "forward_to_frontend",
          isError: false,
        }),
      }),
      expect.objectContaining({
        type: "result",
        session_id: "morph-session-1",
        subtype: "success",
      }),
    ]);
  });

  it("uses resumeSessionId without creating a new remote session", async () => {
    const client = makeClient([{ type: "done" }]);
    const provider = new MorpheusAgentSdkProvider({
      env: {
        MORPHEUS_BASE_URL: "http://localhost:3000",
        MORPHEUS_API_KEY: "sk-test",
      },
      clientFactory: () => client,
    });
    const session = provider.createSession({
      model: "nodetool-canvas",
      workspacePath: "",
      userId: "alice",
      resumeSessionId: "existing-session",
    });

    await session.send("continue", null, "tmp-session", []);

    expect(client.createSession).not.toHaveBeenCalled();
    expect(client.streamPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ sessionId: "existing-session" }),
    );
  });

  it("turns Morpheus stream errors into result error messages", async () => {
    const client = makeClient([
      { type: "session", sessionId: "morph-session-1" },
      { type: "error", code: "AGENT_ERROR", message: "boom" },
    ]);
    const provider = new MorpheusAgentSdkProvider({
      env: {
        MORPHEUS_BASE_URL: "http://localhost:3000",
        MORPHEUS_API_KEY: "sk-test",
      },
      clientFactory: () => client,
    });
    const session = provider.createSession({
      model: "nodetool-canvas",
      workspacePath: "",
      userId: "alice",
    });

    const output = await session.send("fail", null, "tmp-session", []);

    expect(output).toEqual([
      expect.objectContaining({
        type: "result",
        session_id: "morph-session-1",
        subtype: "error",
        is_error: true,
        errors: ["boom"],
      }),
    ]);
  });
});

describe("AgentRuntime Morpheus provider", () => {
  beforeEach(() => {
    vi.stubEnv("MORPHEUS_BASE_URL", "http://localhost:3000");
    vi.stubEnv("MORPHEUS_API_KEY", "sk-test");
  });

  it("does not require a workspace path for Morpheus sessions", async () => {
    const { getAgentRuntime } = await import(
      "../src/agent/agent-runtime.js"
    );

    await expect(
      getAgentRuntime().createSession(
        {
          provider: "morpheus",
          model: "nodetool-canvas",
        },
        "alice",
      ),
    ).resolves.toMatch(/^morpheus-session-/);
  });

  it("uses Morpheus as the default agent provider when configured", async () => {
    const { getAgentRuntime } = await import(
      "../src/agent/agent-runtime.js"
    );

    await expect(
      getAgentRuntime().createSession(
        {
          model: "nodetool-canvas",
        },
        "alice",
      ),
    ).resolves.toMatch(/^morpheus-session-/);
  });
});
