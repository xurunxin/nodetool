import { describe, expect, it } from "vitest";
import type { AgentProvider } from "../src/agent-protocol.js";
import * as apiSchemas from "../src/api-schemas/index.js";
import {
  customModelEndpointSchema,
  customModelEndpointUpsertInputSchema
} from "../src/api-schemas/custom-model-endpoints.js";

describe("custom model endpoint schemas", () => {
  it("accepts OpenAI-compatible endpoint metadata", () => {
    const parsed = customModelEndpointSchema.parse({
      id: "local_gateway",
      name: "Local Gateway",
      kind: "openai",
      baseUrl: "http://127.0.0.1:8080/v1",
      enabled: true,
      models: [{ id: "test-chat", name: "Test Chat" }],
      createdAt: "2026-06-14T00:00:00.000Z",
      updatedAt: "2026-06-14T00:00:00.000Z"
    });

    expect(parsed.id).toBe("local_gateway");
    expect(parsed.models).toEqual([{ id: "test-chat", name: "Test Chat" }]);
  });

  it("accepts Anthropic-compatible endpoint metadata", () => {
    const parsed = customModelEndpointSchema.parse({
      id: "private_claude",
      name: "Private Claude",
      kind: "anthropic",
      baseUrl: "https://models.example.test/anthropic",
      enabled: false,
      models: [
        {
          id: "claude-test",
          name: "Claude Test",
          contextWindow: 200000
        }
      ],
      createdAt: "2026-06-14T00:00:00.000Z",
      updatedAt: "2026-06-14T00:00:00.000Z"
    });

    expect(parsed.enabled).toBe(false);
    expect(parsed.models[0]?.contextWindow).toBe(200000);
  });

  it("rejects endpoint ids that cannot be used in provider ids", () => {
    expect(() =>
      customModelEndpointUpsertInputSchema.parse({
        id: "bad id",
        name: "Bad",
        kind: "anthropic",
        baseUrl: "https://example.test",
        enabled: true,
        models: [{ id: "claude-test", name: "Claude Test" }]
      })
    ).toThrow();
  });

  it("allows Morpheus as an agent provider", () => {
    const provider: AgentProvider = "morpheus";

    expect(provider).toBe("morpheus");
  });

  it("exports custom model endpoints from the api schema index", () => {
    expect(apiSchemas.customModelEndpoints.customModelEndpointSchema).toBe(
      customModelEndpointSchema
    );
  });
});
