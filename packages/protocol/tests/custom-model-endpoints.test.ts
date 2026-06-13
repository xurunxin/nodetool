import { describe, expect, it } from "vitest";
import {
  customModelEndpointSchema,
  customModelEndpointUpsertInputSchema,
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
      updatedAt: "2026-06-14T00:00:00.000Z",
    });

    expect(parsed.id).toBe("local_gateway");
  });

  it("rejects endpoint ids that cannot be used in provider ids", () => {
    expect(() =>
      customModelEndpointUpsertInputSchema.parse({
        id: "bad id",
        name: "Bad",
        kind: "anthropic",
        baseUrl: "https://example.test",
        enabled: true,
        models: [{ id: "claude-test", name: "Claude Test" }],
      }),
    ).toThrow();
  });
});
