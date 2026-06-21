import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import modelsRoutes from "../src/routes/models.js";

vi.mock("@nodetool-ai/runtime", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/runtime")>();
  return {
    ...actual,
    listRegisteredProviderIds: vi.fn().mockReturnValue([]),
    isProviderConfigured: vi.fn(),
    getProvider: vi.fn()
  };
});

vi.mock("../src/custom-model-endpoints.js", async (orig) => {
  const actual = await orig<typeof import("../src/custom-model-endpoints.js")>();
  return {
    ...actual,
    listEnabledCustomModelEndpoints: vi.fn()
  };
});

import {
  customEndpointProviderId,
  listEnabledCustomModelEndpoints
} from "../src/custom-model-endpoints.js";

describe("REST models Fastify route", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(listEnabledCustomModelEndpoints).mockResolvedValue([
      {
        id: "custom_gateway",
        name: "Custom Gateway",
        kind: "openai",
        baseUrl: "https://custom.example.test/v1",
        enabled: true,
        models: [],
        createdAt: "2026-06-14T00:00:00.000Z",
        updatedAt: "2026-06-14T00:00:00.000Z"
      }
    ]);

    app = Fastify({ logger: false });
    app.decorateRequest("userId", null);
    app.addHook("onRequest", async (req) => {
      req.userId = "user-42";
    });
    await app.register(modelsRoutes);
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it("serves /api/models/providers through Fastify and forwards auth user", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/models/providers"
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([
      {
        provider: customEndpointProviderId("custom_gateway"),
        capabilities: ["generate_message", "generate_messages"]
      }
    ]);
    expect(listEnabledCustomModelEndpoints).toHaveBeenCalledWith("user-42");
  });
});
