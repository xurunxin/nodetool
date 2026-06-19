import { describe, it, expect, beforeEach, vi } from "vitest";
import { initTestDb, Job } from "@nodetool-ai/models";
import {
  getProvider as getRuntimeProvider,
  isProviderConfigured,
  listRegisteredProviderIds
} from "@nodetool-ai/runtime";
import type {
  BaseProvider,
  NodeExecutor,
  ProcessingContext,
} from "@nodetool-ai/runtime";
import { UnifiedWebSocketRunner } from "../src/unified-websocket-runner.js";

vi.mock("@nodetool-ai/runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@nodetool-ai/runtime")>();
  return {
    ...actual,
    getProvider: vi.fn(actual.getProvider),
    isProviderConfigured: vi.fn(actual.isProviderConfigured),
    listRegisteredProviderIds: vi.fn(actual.listRegisteredProviderIds)
  };
});

function makeProvider(providerId: string): BaseProvider {
  return {
    provider: providerId,
    setMessageEmitter: vi.fn(),
  } as unknown as BaseProvider;
}

function makeChatProvider(providerId: string): BaseProvider {
  return {
    provider: providerId,
    setMessageEmitter: vi.fn(),
    async *generateMessagesTraced() {
      yield { type: "chunk", content: "ok" };
    },
    hasToolSupport: async () => false,
    getAvailableLanguageModels: async () => [],
  } as unknown as BaseProvider;
}

async function waitForFinishedJob(jobId: string): Promise<Job> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const job = (await Job.get(jobId)) as Job | null;
    if (job && job.status !== "running" && job.status !== "queued") {
      return job;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  const job = (await Job.get(jobId)) as Job | null;
  if (!job) {
    throw new Error(`Job ${jobId} was not persisted`);
  }
  throw new Error(`Job ${jobId} did not finish; status=${job.status}`);
}

describe("UnifiedWebSocketRunner provider resolution", () => {
  beforeEach(() => {
    initTestDb();
    vi.mocked(getRuntimeProvider).mockReset();
    vi.mocked(isProviderConfigured).mockReset();
    vi.mocked(listRegisteredProviderIds).mockReset();
    delete process.env.NODETOOL_MODEL_SURFACE;
  });

  it("defaults fresh inference requests to an API-visible provider", () => {
    const runner = new UnifiedWebSocketRunner({
      userId: "alice",
    });

    expect(
      (runner as unknown as { defaultProvider: string; defaultModel: string }),
    ).toEqual(
      expect.objectContaining({
        defaultProvider: "openai",
        defaultModel: "gpt-4o",
      }),
    );
  });

  it("treats the frontend empty provider sentinel and legacy model as unset", async () => {
    let capturedModel: string | undefined;
    const resolveProvider = vi.fn(async (providerId: string) => ({
      ...makeChatProvider(providerId),
      async *generateMessagesTraced(options: { model: string }) {
        capturedModel = options.model;
        yield { type: "chunk", content: "ok" };
      },
    } as unknown as BaseProvider));
    const runner = new UnifiedWebSocketRunner({
      userId: "alice",
      resolveProvider,
      resolveExecutor: () => makeProvider("unused") as unknown as NodeExecutor,
    });

    await runner.handleChatMessage({
      thread_id: "fresh-chat",
      content: "hello",
      provider: "empty",
      model: "gpt-oss:20b",
    });

    expect(resolveProvider).toHaveBeenCalledWith("openai", "alice");
    expect(capturedModel).toBe("gpt-4o");
  });

  it("installs the runner provider resolver on run_job execution contexts", async () => {
    const customProviderId = "custom:alpha_gateway";
    const resolveProvider = vi.fn(async (providerId: string) =>
      makeProvider(providerId),
    );
    const runner = new UnifiedWebSocketRunner({
      userId: "alice",
      resolveProvider,
      resolveExecutor: (): NodeExecutor => ({
        async process(
          _inputs: Record<string, unknown>,
          context?: ProcessingContext,
        ): Promise<Record<string, unknown>> {
          if (!context) {
            throw new Error("ProcessingContext is required");
          }
          const provider = await context.getProvider(customProviderId);
          return { output: provider.provider };
        },
      }),
    });

    const jobId = "custom-provider-context";
    await runner.runJob({
      job_id: jobId,
      user_id: "alice",
      graph: {
        nodes: [{ id: "n1", type: "test.ProviderNode" }],
        edges: [],
      },
    });

    const job = await waitForFinishedJob(jobId);

    expect(job.status).toBe("completed");
    expect(resolveProvider).toHaveBeenCalledWith(customProviderId, "alice");
  });

  it("filters local-only providers from configured provider discovery", async () => {
    vi.mocked(listRegisteredProviderIds).mockReturnValue(["openai", "ollama"]);
    vi.mocked(isProviderConfigured).mockResolvedValue(true);
    vi.mocked(getRuntimeProvider).mockImplementation(
      async (providerId: string) => makeProvider(providerId)
    );
    const runner = new UnifiedWebSocketRunner({
      userId: "alice"
    });

    const providers = await (
      runner as unknown as {
        getConfiguredProviders(userId: string): Promise<Record<string, BaseProvider>>;
      }
    ).getConfiguredProviders("alice");

    expect(Object.keys(providers)).toEqual(["openai"]);
    expect(isProviderConfigured).toHaveBeenCalledWith(
      "openai",
      expect.any(Function)
    );
    expect(isProviderConfigured).not.toHaveBeenCalledWith(
      "ollama",
      expect.any(Function)
    );
    expect(getRuntimeProvider).toHaveBeenCalledWith(
      "openai",
      expect.any(Function)
    );
    expect(getRuntimeProvider).not.toHaveBeenCalledWith(
      "ollama",
      expect.any(Function)
    );
  });
});
