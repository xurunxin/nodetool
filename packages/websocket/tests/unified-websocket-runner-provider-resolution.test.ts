import { describe, it, expect, beforeEach, vi } from "vitest";
import { initTestDb, Job } from "@nodetool-ai/models";
import type {
  BaseProvider,
  NodeExecutor,
  ProcessingContext,
} from "@nodetool-ai/runtime";
import { UnifiedWebSocketRunner } from "../src/unified-websocket-runner.js";

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
  });

  it("defaults fresh inference requests to an API-visible provider", () => {
    const runner = new UnifiedWebSocketRunner({
      userId: "alice",
    });

    expect(
      (runner as unknown as { defaultProvider: string }).defaultProvider,
    ).toBe("openai");
  });

  it("treats the frontend empty provider sentinel as unset", async () => {
    const resolveProvider = vi.fn(async (providerId: string) =>
      makeChatProvider(providerId),
    );
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
});
