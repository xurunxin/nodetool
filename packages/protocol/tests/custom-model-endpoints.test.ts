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
      baseUrl: "https://gateway.example.test/v1",
      enabled: true,
      models: [{ id: "test-chat", name: "Test Chat" }],
      createdAt: "2026-06-14T00:00:00.000Z",
      updatedAt: "2026-06-14T00:00:00.000Z",
    });

    expect(parsed.id).toBe("local_gateway");
  });

  it("allows public HTTPS hostnames that resemble IPv6 private prefixes", () => {
    expect(() =>
      customModelEndpointUpsertInputSchema.parse({
        id: "public-prefix",
        name: "Public Prefix",
        kind: "openai",
        baseUrl: "https://fc-public.example.test/v1",
        enabled: true,
        models: [{ id: "gpt-test", name: "GPT Test" }],
      }),
    ).not.toThrow();
  });

  it.each([
    "http://gateway.example.test/v1",
    "https://localhost:8080/v1",
    "https://127.0.0.1:8080/v1",
    "https://10.0.0.2/v1",
    "https://172.16.0.2/v1",
    "https://192.168.1.10/v1",
    "https://169.254.169.254/latest",
    "https://[::1]/v1",
    "https://[fd00::1]/v1",
    "https://metadata.google.internal/v1",
  ])("rejects unsafe custom endpoint URL %s", (baseUrl) => {
    expect(() =>
      customModelEndpointUpsertInputSchema.parse({
        id: "unsafe",
        name: "Unsafe",
        kind: "openai",
        baseUrl,
        enabled: true,
        models: [{ id: "gpt-test", name: "GPT Test" }],
      }),
    ).toThrow();
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

  it("rejects uppercase endpoint ids", () => {
    expect(() =>
      customModelEndpointUpsertInputSchema.parse({
        id: "CaseSensitive_1",
        name: "Bad",
        kind: "openai",
        baseUrl: "https://example.test",
        enabled: true,
        models: [{ id: "gpt-test", name: "GPT Test" }],
      }),
    ).toThrow();
  });
});
