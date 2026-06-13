# API-First Morpheus B/S Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` for this plan when running several
> independent tasks, or `superpowers:executing-plans` when executing inline.
> Update each checkbox as it is completed, run the listed verification commands,
> and commit at the checkpoint named in each task.

**Goal:** Convert NodeTool toward an API-first B/S deployment surface, hide local
model capabilities by default, add configurable OpenAI/Anthropic-compatible model
services, and replace the default Pi chat agent with a MorpheusCore-backed canvas
agent while preserving the current `/ws/agent` canvas tool bridge.

**Architecture:** NodeTool remains the UI, canvas, workflow, storage, and tool
execution control plane. MorpheusCore becomes the remote agent runtime for chat
sessions. The client still talks to NodeTool through `/ws/agent`; NodeTool
adapts MorpheusCore session and stream events into the existing agent socket
protocol and executes canvas tool calls through the existing frontend tool
manifest.

**Tech Stack:** TypeScript, Fastify, tRPC, React, Zustand, ReactFlow, Vitest,
MorpheusCore REST/SSE.

**Spec:** `docs/superpowers/specs/2026-06-14-api-first-morpheus-bs-design.md`

---

## Scope Check

This is a master plan for a cross-cutting change. It is split into reviewable
phases so implementation can stop safely after any checkpoint.

In scope:

- Hide local model providers and local model-management UI by default.
- Keep an explicit advanced opt-in for local providers.
- Add persisted custom OpenAI-compatible and Anthropic-compatible endpoints.
- Wire custom endpoints into model listing and workflow provider resolution.
- Add a MorpheusCore agent provider behind the existing `/ws/agent` protocol.
- Rename frontend Pi-specific store/control names to generic agent names while
  keeping compatibility exports during the migration.
- Add a MorpheusCore `nodetool-canvas` profile, skill, and agent config.
- Document B/S deployment boundaries and the thin desktop shell direction.

Out of scope for this plan:

- Moving user asset execution to a remote desktop connector.
- Removing Pi SDK code from the repository.
- Migrating every legacy component name that is not touched by the default chat
  path.
- Building a full desktop shell. This plan only documents its contract.

---

## File Structure

Create in `G:/Projects/nodetool`:

- `packages/protocol/src/api-schemas/custom-model-endpoints.ts`
- `packages/protocol/tests/custom-model-endpoints.test.ts`
- `packages/websocket/src/model-surface.ts`
- `packages/websocket/src/custom-model-endpoints.ts`
- `packages/websocket/src/custom-provider-resolver.ts`
- `packages/websocket/src/trpc/routers/custom-model-endpoints.ts`
- `packages/websocket/src/agent/morpheus-client.ts`
- `packages/websocket/src/agent/morpheus-agent.ts`
- `packages/websocket/tests/model-surface.test.ts`
- `packages/websocket/tests/custom-model-endpoints.test.ts`
- `packages/websocket/tests/custom-provider-resolver.test.ts`
- `packages/websocket/tests/morpheus-client.test.ts`
- `packages/websocket/tests/morpheus-agent.test.ts`
- `web/src/stores/chatAgent.ts`
- `web/src/components/chat/composer/AgentComposerControls.tsx`
- `web/src/stores/__tests__/chatAgent.test.ts`
- `docs/deployment/api-first-bs.md`

Create in `G:/Projects/MetronX/MorpheusCore` during the MorpheusCore phase:

- `config/profiles/nodetool-canvas/BASE.md`
- `config/skills/nodetool-canvas/SKILL.md`
- `config/agents/nodetool-canvas.yaml`

Modify in `G:/Projects/nodetool`:

- `packages/protocol/src/agent-protocol.ts`
- `packages/protocol/src/api-schemas/index.ts`
- `packages/protocol/src/api-types.ts`
- `packages/websocket/src/trpc/router.ts`
- `packages/websocket/src/trpc/routers/models.ts`
- `packages/websocket/src/models-api.ts`
- `packages/websocket/src/plugins/websocket.ts`
- `packages/websocket/src/agent/agent-runtime.ts`
- `packages/websocket/src/agent/sdk-provider.ts`
- `packages/websocket/src/agent/types.ts`
- `web/src/stores/GlobalChatStore.ts`
- `web/src/stores/chatPi.ts`
- `web/src/components/chat/composer/PiComposerControls.tsx`
- `web/src/lib/agent/AgentSocketClient.ts`
- `docs/deployment-e2e-guide.md`

---

## Task 1: Protocol Types For Morpheus And Custom Endpoints

**Purpose:** Make the public protocol understand a generic Morpheus agent
provider and validate custom endpoint records before server or UI code depends
on them.

- [ ] Add `"morpheus"` to `AgentProvider` in
  `packages/protocol/src/agent-protocol.ts`.

```ts
export type AgentProvider = "pi" | "llm" | "morpheus";
```

- [ ] Create `packages/protocol/src/api-schemas/custom-model-endpoints.ts`.

```ts
import { z } from "zod";

export const customModelEndpointKindSchema = z.enum(["openai", "anthropic"]);

export const customModelEndpointModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  contextWindow: z.number().int().positive().optional()
});

export const customModelEndpointSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().min(1),
  kind: customModelEndpointKindSchema,
  baseUrl: z.string().url(),
  enabled: z.boolean().default(true),
  models: z.array(customModelEndpointModelSchema).min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export const customModelEndpointUpsertInputSchema =
  customModelEndpointSchema
    .omit({ createdAt: true, updatedAt: true })
    .extend({ apiKey: z.string().min(1).optional() });

export const customModelEndpointDeleteInputSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/)
});

export type CustomModelEndpoint = z.infer<typeof customModelEndpointSchema>;
export type CustomModelEndpointUpsertInput = z.infer<
  typeof customModelEndpointUpsertInputSchema
>;
```

- [ ] Export the new schema module from
  `packages/protocol/src/api-schemas/index.ts`.
- [ ] Add `CUSTOM_OPENAI` and `CUSTOM_ANTHROPIC` provider family constants in
  `packages/protocol/src/api-types.ts` only if existing UI filters require a
  stable family id. Keep endpoint instances represented as `custom:<endpointId>`
  in model records.
- [ ] Add `packages/protocol/tests/custom-model-endpoints.test.ts`.

```ts
import { describe, expect, it } from "vitest";
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
});
```

- [ ] Run `rtk npm run test --workspace=packages/protocol -- custom-model-endpoints`.
- [ ] Run `rtk npm run typecheck --workspace=packages/protocol`.
- [ ] Commit checkpoint: `feat(protocol): add custom endpoint agent protocol`.

---

## Task 2: API-First Model Surface Guard

**Purpose:** Centralize the rule that production and API-first deployments hide
local-only providers and local model-management actions unless explicitly
enabled.

- [ ] Create `packages/websocket/src/model-surface.ts`.

```ts
export const MODEL_SURFACE_MODES = ["api_first", "local_first"] as const;
export type ModelSurfaceMode = (typeof MODEL_SURFACE_MODES)[number];

const LOCAL_ONLY_PROVIDER_IDS = new Set([
  "ollama",
  "lmstudio",
  "llama_cpp",
  "vllm",
  "transformers_js"
]);

export function getModelSurfaceMode(
  env: NodeJS.ProcessEnv = process.env
): ModelSurfaceMode {
  return env["NODETOOL_MODEL_SURFACE"] === "local_first"
    ? "local_first"
    : "api_first";
}

export function isLocalModelManagementEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return getModelSurfaceMode(env) === "local_first";
}

export function isProviderVisibleForSurface(
  providerId: string,
  mode: ModelSurfaceMode = getModelSurfaceMode()
): boolean {
  if (mode === "local_first") {
    return true;
  }
  return !LOCAL_ONLY_PROVIDER_IDS.has(providerId.toLowerCase());
}

export function filterProviderIdsForSurface(
  providerIds: string[],
  mode: ModelSurfaceMode = getModelSurfaceMode()
): string[] {
  return providerIds.filter((providerId) =>
    isProviderVisibleForSurface(providerId, mode)
  );
}

export function filterModelsForSurface<
  T extends { provider?: string | null; model_type?: string | null }
>(models: T[], mode: ModelSurfaceMode = getModelSurfaceMode()): T[] {
  return models.filter((model) => {
    const providerId = model.provider ?? model.model_type ?? "";
    return isProviderVisibleForSurface(providerId, mode);
  });
}
```

- [ ] Add `packages/websocket/tests/model-surface.test.ts`.

```ts
import { describe, expect, it } from "vitest";
import {
  filterModelsForSurface,
  filterProviderIdsForSurface,
  getModelSurfaceMode,
  isLocalModelManagementEnabled
} from "../src/model-surface.js";

describe("model surface", () => {
  it("defaults to api_first", () => {
    expect(getModelSurfaceMode({})).toBe("api_first");
    expect(isLocalModelManagementEnabled({})).toBe(false);
  });

  it("hides local-only provider ids in api_first mode", () => {
    expect(
      filterProviderIdsForSurface(["openai", "ollama", "anthropic"], "api_first")
    ).toEqual(["openai", "anthropic"]);
  });

  it("keeps local providers in local_first mode", () => {
    expect(
      filterProviderIdsForSurface(["openai", "ollama"], "local_first")
    ).toEqual(["openai", "ollama"]);
  });

  it("filters model records by provider", () => {
    expect(
      filterModelsForSurface(
        [
          { id: "a", provider: "openai" },
          { id: "b", provider: "vllm" }
        ],
        "api_first"
      )
    ).toEqual([{ id: "a", provider: "openai" }]);
  });
});
```

- [ ] Run `rtk npm run test --workspace=packages/websocket -- model-surface`.
- [ ] Commit checkpoint: `feat(server): add api-first model surface guard`.

---

## Task 3: Apply Model Surface To Server Model APIs

**Purpose:** Make the default server response API-first while preserving
developer opt-in for local providers.

- [ ] In `packages/websocket/src/trpc/routers/models.ts`, import the surface
  helpers and apply them in `providers`, `recommended`, `availableForKind`,
  `all`, and every local-management procedure.

```ts
import {
  filterModelsForSurface,
  filterProviderIdsForSurface,
  isLocalModelManagementEnabled
} from "../../model-surface.js";
```

- [ ] Change provider listing to filter registered providers before
  instantiating them.

```ts
const providerIds = filterProviderIdsForSurface(
  await getAvailableProviderIds(ctx.userId)
);
```

- [ ] Change model lists that merge hosted, curated, and discovered models to
  call `filterModelsForSurface` on the final array.
- [ ] Guard local-only tRPC methods. This applies to HuggingFace cache
  management, Transformers.js cache management, Ollama model info, and Ollama
  pull APIs.

```ts
if (!isLocalModelManagementEnabled()) {
  return { models: [] };
}
```

Use the return shape already used by each procedure. For boolean probes, return
`false`. For delete/pull mutations, throw a `TRPCError` with code
`FORBIDDEN` and message `"Local model management is disabled"`.

- [ ] Apply the same surface helpers to `packages/websocket/src/models-api.ts`
  so the REST compatibility path matches tRPC.
- [ ] Add server tests that prove:
  - `ollama`, `lmstudio`, `llama_cpp`, `vllm`, and `transformers_js` are hidden
    when `NODETOOL_MODEL_SURFACE` is unset.
  - Hosted API providers remain visible.
  - `NODETOOL_MODEL_SURFACE=local_first` restores local provider visibility.
  - Local management mutations reject in API-first mode.
- [ ] Run `rtk npm run test --workspace=packages/websocket -- models`.
- [ ] Run `rtk npm run typecheck --workspace=packages/websocket`.
- [ ] Commit checkpoint: `feat(server): hide local model surface by default`.

---

## Task 4: Persist Custom Endpoint Metadata And Secrets

**Purpose:** Store custom endpoint metadata in settings and API keys in the
secret store using deterministic secret names.

- [ ] Create `packages/websocket/src/custom-model-endpoints.ts`.

```ts
import {
  customModelEndpointSchema,
  type CustomModelEndpoint,
  type CustomModelEndpointUpsertInput
} from "@nodetool-ai/protocol/api-schemas/custom-model-endpoints.js";
import { Setting, Secret, clearSecretCache } from "@nodetool-ai/models";

export const CUSTOM_MODEL_ENDPOINTS_SETTING = "custom_model_endpoints";

export function customEndpointProviderId(endpointId: string): string {
  return `custom:${endpointId}`;
}

export function customEndpointSecretKey(endpointId: string): string {
  return `CUSTOM_MODEL_ENDPOINT_${endpointId.toUpperCase()}_API_KEY`;
}

export async function listCustomModelEndpoints(
  userId: string
): Promise<CustomModelEndpoint[]> {
  const setting = await Setting.find(userId, CUSTOM_MODEL_ENDPOINTS_SETTING);
  if (!setting) {
    return [];
  }
  const raw = JSON.parse(setting.getValue()) as unknown;
  return customModelEndpointSchema.array().parse(raw);
}

export async function upsertCustomModelEndpoint(
  userId: string,
  input: CustomModelEndpointUpsertInput
): Promise<CustomModelEndpoint> {
  const now = new Date().toISOString();
  const endpoints = await listCustomModelEndpoints(userId);
  const existing = endpoints.find((endpoint) => endpoint.id === input.id);
  const endpoint = customModelEndpointSchema.parse({
    id: input.id,
    name: input.name,
    kind: input.kind,
    baseUrl: input.baseUrl,
    enabled: input.enabled,
    models: input.models,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  });
  const next = [
    ...endpoints.filter((candidate) => candidate.id !== input.id),
    endpoint
  ].sort((a, b) => a.name.localeCompare(b.name));

  await Setting.upsert({
    userId,
    key: CUSTOM_MODEL_ENDPOINTS_SETTING,
    value: JSON.stringify(next),
    description: "Custom OpenAI/Anthropic-compatible model endpoints"
  });

  if (input.apiKey && input.apiKey !== "****") {
    const key = customEndpointSecretKey(input.id);
    await Secret.upsert({
      userId,
      key,
      value: input.apiKey,
      description: `API key for custom model endpoint ${input.name}`
    });
    clearSecretCache(userId, key);
  }

  return endpoint;
}

export async function deleteCustomModelEndpoint(
  userId: string,
  endpointId: string
): Promise<boolean> {
  const endpoints = await listCustomModelEndpoints(userId);
  const next = endpoints.filter((endpoint) => endpoint.id !== endpointId);
  if (next.length === endpoints.length) {
    return false;
  }
  await Setting.upsert({
    userId,
    key: CUSTOM_MODEL_ENDPOINTS_SETTING,
    value: JSON.stringify(next),
    description: "Custom OpenAI/Anthropic-compatible model endpoints"
  });
  await Secret.deleteSecret(userId, customEndpointSecretKey(endpointId));
  clearSecretCache(userId, customEndpointSecretKey(endpointId));
  return true;
}
```

- [ ] Create `packages/websocket/src/trpc/routers/custom-model-endpoints.ts`.

```ts
import {
  customModelEndpointDeleteInputSchema,
  customModelEndpointUpsertInputSchema
} from "@nodetool-ai/protocol/api-schemas/custom-model-endpoints.js";
import { router, protectedProcedure } from "../index.js";
import {
  deleteCustomModelEndpoint,
  listCustomModelEndpoints,
  upsertCustomModelEndpoint
} from "../../custom-model-endpoints.js";

export const customModelEndpointsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => ({
    endpoints: await listCustomModelEndpoints(ctx.userId)
  })),
  upsert: protectedProcedure
    .input(customModelEndpointUpsertInputSchema)
    .mutation(async ({ ctx, input }) => ({
      endpoint: await upsertCustomModelEndpoint(ctx.userId, input)
    })),
  delete: protectedProcedure
    .input(customModelEndpointDeleteInputSchema)
    .mutation(async ({ ctx, input }) => ({
      deleted: await deleteCustomModelEndpoint(ctx.userId, input.id)
    }))
});
```

- [ ] Register the router in `packages/websocket/src/trpc/router.ts` as
  `customModelEndpoints`.
- [ ] Add `packages/websocket/tests/custom-model-endpoints.test.ts` using the
  same mocked `Setting` and `Secret` style as `trpc-settings.test.ts`.
- [ ] Test that `"****"` preserves the existing secret by skipping
  `Secret.upsert`.
- [ ] Test that delete removes metadata and calls `Secret.deleteSecret`.
- [ ] Run `rtk npm run test --workspace=packages/websocket -- custom-model-endpoints`.
- [ ] Commit checkpoint: `feat(server): persist custom model endpoints`.

---

## Task 5: Resolve Custom Endpoints As Runtime Providers

**Purpose:** Make custom endpoint records usable by workflow nodes, direct chat,
and model selectors.

- [ ] Create `packages/websocket/src/custom-provider-resolver.ts`.

```ts
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
  AnthropicProvider,
  OpenAIProvider,
  getProvider,
  type BaseProvider
} from "@nodetool-ai/runtime";
import { getSecret as getStoredSecret } from "@nodetool-ai/models";
import {
  customEndpointProviderId,
  customEndpointSecretKey,
  listCustomModelEndpoints
} from "./custom-model-endpoints.js";

export async function resolveNodeToolProvider(
  providerId: string,
  userId: string
): Promise<BaseProvider> {
  const normalized = providerId.toLowerCase();
  if (!normalized.startsWith("custom:")) {
    return getProvider(normalized, (key) =>
      getStoredSecret(key, userId).then((value) => value ?? undefined)
    );
  }

  const endpointId = providerId.slice("custom:".length);
  const endpoint = (await listCustomModelEndpoints(userId)).find(
    (candidate) => candidate.id === endpointId && candidate.enabled
  );
  if (!endpoint) {
    throw new Error(`Custom model endpoint "${endpointId}" is not configured`);
  }

  const apiKey = await getStoredSecret(customEndpointSecretKey(endpointId), userId);
  if (!apiKey) {
    throw new Error(`API key for custom model endpoint "${endpointId}" is missing`);
  }

  if (endpoint.kind === "openai") {
    return new OpenAIProvider(
      { OPENAI_API_KEY: apiKey },
      {
        providerId: customEndpointProviderId(endpoint.id) as never,
        clientFactory: (key) => new OpenAI({ apiKey: key, baseURL: endpoint.baseUrl })
      }
    );
  }

  const provider = new AnthropicProvider(
    { ANTHROPIC_API_KEY: apiKey },
    {
      clientFactory: (key) =>
        new Anthropic({ authToken: key, baseURL: endpoint.baseUrl })
    }
  );
  (provider as { provider: string }).provider = customEndpointProviderId(endpoint.id);
  return provider;
}
```

- [ ] Replace `resolveProvider` in `packages/websocket/src/plugins/websocket.ts`
  with a thin call to `resolveNodeToolProvider(providerId, userId)`.
- [ ] Update `packages/websocket/src/openai-api.ts` only if the OpenAI
  compatibility API should accept `custom:<endpointId>` model/provider routing
  in this phase. If implemented, make it delegate to `resolveNodeToolProvider`.
- [ ] Add custom endpoint models into `packages/websocket/src/trpc/routers/models.ts`.

```ts
const customModels = (await listCustomModelEndpoints(ctx.userId))
  .filter((endpoint) => endpoint.enabled)
  .flatMap((endpoint) =>
    endpoint.models.map((model) => ({
      id: model.id,
      name: model.name,
      provider: customEndpointProviderId(endpoint.id),
      context_window: model.contextWindow ?? null
    }))
  );
```

- [ ] Ensure `availableForKind({ kind: "text_generation" })` includes custom
  endpoint models.
- [ ] Add `packages/websocket/tests/custom-provider-resolver.test.ts` proving:
  - non-custom providers delegate to `getProvider`;
  - `custom:<id>` resolves OpenAI-compatible endpoints with a custom base URL;
  - `custom:<id>` resolves Anthropic-compatible endpoints with a custom base URL;
  - disabled endpoints are rejected.
- [ ] Run `rtk npm run test --workspace=packages/websocket -- custom-provider-resolver`.
- [ ] Run `rtk npm run typecheck --workspace=packages/websocket`.
- [ ] Commit checkpoint: `feat(server): resolve custom model providers`.

---

## Task 6: MorpheusCore Client And Event Mapping

**Purpose:** Add a small MorpheusCore API client that converts REST/SSE events
to the existing NodeTool agent message stream.

- [ ] Create `packages/websocket/src/agent/morpheus-client.ts`.

```ts
export interface MorpheusClientOptions {
  baseUrl: string;
  apiKey?: string;
  fetchFn?: typeof fetch;
}

export interface MorpheusSession {
  id: string;
}

export type MorpheusStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "thinking_delta"; text: string }
  | {
      type: "tool_call";
      id: string;
      name: string;
      arguments: Record<string, unknown>;
    }
  | { type: "done" }
  | { type: "error"; message: string };

export class MorpheusClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly fetchFn: typeof fetch;

  constructor(options: MorpheusClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, "");
    this.apiKey = options.apiKey;
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  private headers(): Record<string, string> {
    return {
      "content-type": "application/json",
      ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {})
    };
  }

  async createSession(agentId: string, userId: string): Promise<MorpheusSession> {
    const response = await this.fetchFn(`${this.baseUrl}/api/v1/sessions`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ agentId, userId })
    });
    if (!response.ok) {
      throw new Error(`Morpheus session create failed: ${response.status}`);
    }
    const body = (await response.json()) as { id?: string; sessionId?: string };
    const id = body.sessionId ?? body.id;
    if (!id) {
      throw new Error("Morpheus session response did not include an id");
    }
    return { id };
  }

  async *streamPrompt(input: {
    sessionId: string;
    prompt: string;
    signal?: AbortSignal;
    tools: Array<Record<string, unknown>>;
  }): AsyncGenerator<MorpheusStreamEvent> {
    const response = await this.fetchFn(`${this.baseUrl}/api/v1/prompt/stream`, {
      method: "POST",
      headers: this.headers(),
      signal: input.signal,
      body: JSON.stringify({
        sessionId: input.sessionId,
        prompt: input.prompt,
        tools: input.tools
      })
    });
    if (!response.ok || !response.body) {
      throw new Error(`Morpheus prompt stream failed: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const read = await reader.read();
      if (read.done) {
        break;
      }
      buffer += decoder.decode(read.value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const event = parseMorpheusSseFrame(frame);
        if (event) {
          yield event;
        }
      }
    }
  }
}

export function parseMorpheusSseFrame(
  frame: string
): MorpheusStreamEvent | null {
  const dataLine = frame
    .split("\n")
    .find((line) => line.startsWith("data:"));
  if (!dataLine) {
    return null;
  }
  const payload = JSON.parse(dataLine.slice("data:".length).trim()) as {
    type?: string;
    text?: string;
    delta?: string;
    id?: string;
    name?: string;
    arguments?: Record<string, unknown>;
    error?: string;
  };

  if (payload.type === "text_delta") {
    return { type: "text_delta", text: payload.delta ?? payload.text ?? "" };
  }
  if (payload.type === "thinking_delta") {
    return { type: "thinking_delta", text: payload.delta ?? payload.text ?? "" };
  }
  if (payload.type === "toolcall_end" || payload.type === "tool_call") {
    return {
      type: "tool_call",
      id: payload.id ?? crypto.randomUUID(),
      name: payload.name ?? "",
      arguments: payload.arguments ?? {}
    };
  }
  if (payload.type === "done") {
    return { type: "done" };
  }
  if (payload.type === "error") {
    return { type: "error", message: payload.error ?? "Morpheus stream error" };
  }
  return null;
}
```

- [ ] Add `packages/websocket/tests/morpheus-client.test.ts` for SSE parsing,
  stream chunk framing, and failed response handling.
- [ ] Run `rtk npm run test --workspace=packages/websocket -- morpheus-client`.
- [ ] Commit checkpoint: `feat(agent): add morpheus stream client`.

---

## Task 7: Morpheus Agent Provider Behind `/ws/agent`

**Purpose:** Replace Pi as the default remote agent path without changing the
frontend canvas tool bridge contract.

- [ ] Extend `packages/websocket/src/agent/sdk-provider.ts` provider options
  with `morpheusBaseUrl`, `morpheusApiKey`, and `morpheusAgentId`.
- [ ] Create `packages/websocket/src/agent/morpheus-agent.ts`.

```ts
import type {
  AgentMessage,
  AgentModelDescriptor,
  FrontendToolManifest
} from "./types.js";
import type { AgentTransport } from "./transport.js";
import type { AgentQuerySession, AgentSdkProvider } from "./sdk-provider.js";
import { MorpheusClient } from "./morpheus-client.js";

function toMorpheusTools(
  manifest: FrontendToolManifest[]
): Array<Record<string, unknown>> {
  return manifest.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters
  }));
}

export class MorpheusQuerySession implements AgentQuerySession {
  private readonly client: MorpheusClient;
  private readonly morpheusSessionId: string;
  private abortController: AbortController | null = null;
  private messageCounter = 0;

  constructor(options: {
    client: MorpheusClient;
    morpheusSessionId: string;
  }) {
    this.client = options.client;
    this.morpheusSessionId = options.morpheusSessionId;
  }

  async send(
    message: string,
    transport: AgentTransport | null,
    _sessionId: string,
    manifest: FrontendToolManifest[],
    onMessage?: (message: AgentMessage) => void
  ): Promise<AgentMessage[]> {
    this.abortController = new AbortController();
    const messages: AgentMessage[] = [];

    const emit = (agentMessage: AgentMessage) => {
      messages.push(agentMessage);
      onMessage?.(agentMessage);
    };

    const makeMessage = (
      type: AgentMessage["type"],
      fields: Omit<AgentMessage, "type" | "uuid" | "session_id">
    ): AgentMessage => ({
      type,
      uuid: `${this.morpheusSessionId}-${++this.messageCounter}`,
      session_id: this.morpheusSessionId,
      ...fields
    });

    for await (const event of this.client.streamPrompt({
      sessionId: this.morpheusSessionId,
      prompt: message,
      tools: toMorpheusTools(manifest),
      signal: this.abortController.signal
      })) {
      if (event.type === "text_delta") {
        emit(makeMessage("stream_event", { text: event.text }));
      }
      if (event.type === "thinking_delta") {
        emit(makeMessage("stream_event", { text: event.text }));
      }
      if (event.type === "tool_call") {
        const result = await transport?.executeTool(event.name, event.arguments);
        emit(
          makeMessage("result", {
            text: typeof result === "string" ? result : JSON.stringify(result),
            subtype: "tool_result",
            event_type: "tool_result",
            event: {
              toolCallId: event.id,
              name: event.name,
              result
            }
          })
        );
      }
      if (event.type === "error") {
        throw new Error(event.message);
      }
    }

    return messages;
  }

  async interrupt(): Promise<void> {
    this.abortController?.abort();
  }

  close(): void {
    this.abortController?.abort();
  }
}

export class MorpheusAgentSdkProvider implements AgentSdkProvider {
  readonly name = "morpheus";

  async listModels(): Promise<AgentModelDescriptor[]> {
    return [
      {
        id: "nodetool-canvas",
        label: "Morpheus Canvas Agent",
        provider: "morpheus"
      }
    ];
  }

  createSession(options: {
    model: string;
    userId: string;
    resumeSessionId?: string;
  }): AgentQuerySession {
    const client = new MorpheusClient({
      baseUrl: process.env["MORPHEUS_BASE_URL"] ?? "http://127.0.0.1:8787",
      apiKey: process.env["MORPHEUS_API_KEY"]
    });
    return new MorpheusQuerySession({
      client,
      morpheusSessionId: options.resumeSessionId ?? options.model
    });
  }
}
```

The snippet defines the shape. During implementation, create the Morpheus
session before constructing `MorpheusQuerySession` because `createSession` in
`AgentSdkProvider` is currently synchronous. There are two acceptable ways to
make that work:

- Make `AgentSdkProvider.createSession` async and update `AgentRuntime`.
- Keep `createSession` sync and make the first `send` lazily create the remote
  Morpheus session.

Choose the async interface if TypeScript impact stays within
`packages/websocket/src/agent/*` and tests. Choose lazy create if the async
interface expands into unrelated callers.

- [ ] Register `morpheus: new MorpheusAgentSdkProvider()` in
  `packages/websocket/src/agent/agent-runtime.ts`.
- [ ] Change workspace requirement in `AgentRuntime.createSession`:

```ts
const requiresWorkspace = options.provider === "pi";
```

- [ ] Change default agent provider selection to `"morpheus"` when
  `MORPHEUS_BASE_URL` is configured. Keep `"llm"` as fallback for pure local
  development.
- [ ] Preserve Pi support behind explicit provider `"pi"`.
- [ ] Add `packages/websocket/tests/morpheus-agent.test.ts` proving:
  - Morpheus sessions do not require `workspacePath`;
  - frontend tool manifests are forwarded to Morpheus;
  - Morpheus tool calls invoke `transport.executeTool`;
  - `interrupt()` aborts the active stream.
- [ ] Run `rtk npm run test --workspace=packages/websocket -- morpheus-agent`.
- [ ] Run `rtk npm run typecheck --workspace=packages/websocket`.
- [ ] Commit checkpoint: `feat(agent): add morpheus provider`.

---

## Task 8: Frontend Generic Agent Store And Controls

**Purpose:** Remove Pi naming from the default UI path and make Morpheus the
normal chat agent without breaking existing imports in one large change.

- [ ] Create `web/src/stores/chatAgent.ts` by moving current `chatPi.ts` logic
  to generic names:
  - `piModel` -> `agentModel`
  - `piModels` -> `agentModels`
  - `piWorkspaceId` -> `agentWorkspaceId`
  - `piWorkspacePath` -> `agentWorkspacePath`
  - `piSessionByThread` -> `agentSessionByThread`
  - `piThreadBySession` -> `agentThreadBySession`
  - `loadPiModels` -> `loadAgentModels`
  - `sendPiMessage` -> `sendAgentMessage`
  - `stopPi` -> `stopAgent`
- [ ] Default `provider` to `"morpheus"` when agent models include provider
  `"morpheus"`; otherwise fall back to `"llm"`.
- [ ] Keep `web/src/stores/chatPi.ts` as a compatibility re-export.

```ts
export * from "./chatAgent";
```

- [ ] Update `web/src/stores/GlobalChatStore.ts` to compose the generic agent
  slice.
- [ ] Create `web/src/components/chat/composer/AgentComposerControls.tsx` from
  `PiComposerControls.tsx`.
- [ ] Make `PiComposerControls.tsx` a compatibility re-export or thin wrapper.
- [ ] Remove the default `isElectron || !isProduction` availability gate for
  Morpheus and LLM agents. Keep workspace selection visible only when provider
  is `"pi"`.
- [ ] Use existing UI primitives when editing controls. Do not introduce raw MUI
  imports in changed component files.
- [ ] Add `web/src/stores/__tests__/chatAgent.test.ts` for:
  - default provider selection;
  - session mapping by thread;
  - `provider: "morpheus"` create-session payload without `workspacePath`;
  - `provider: "pi"` create-session payload with `workspacePath`.
- [ ] Run `rtk npm test --workspace=web -- chatAgent`.
- [ ] Run `rtk npm run typecheck --workspace=web`.
- [ ] Commit checkpoint: `refactor(web): generalize chat agent store`.

---

## Task 9: MorpheusCore `nodetool-canvas` Profile And Skill

**Purpose:** Give MorpheusCore a loadable agent configuration that knows it is
serving NodeTool canvas operations through frontend tool calls.

Run this task with `cwd=G:/Projects/MetronX/MorpheusCore`.

- [ ] Create `config/profiles/nodetool-canvas/BASE.md`.

```md
# Nodetool Canvas Agent

You are the MorpheusCore runtime behind NodeTool's canvas assistant.

## Operating Contract

- Treat NodeTool as the source of truth for canvas, workflow, node registry,
  storage, and frontend state.
- Use only tools supplied by the NodeTool session.
- Do not invent node types, property names, handles, model records, workflow ids,
  or asset ids.
- Search NodeTool nodes and models through the provided tools before creating or
  editing graph state.
- Return concise user-facing summaries after tool execution finishes.
- Ask one direct clarification question when the requested graph operation
  cannot be completed from available context.

## Tool Use

- Use frontend tool calls for canvas inspection and mutation.
- Use `execute_skill_script(skillName="nodetool-canvas", script="scripts/validate_graph.mjs", args=["workflow_123"])`
  only for MorpheusCore-side helper scripts that belong to this profile.
- Use `forward_to_frontend` only when NodeTool explicitly exposes that tool in
  the current session and pass the exact tool name plus JSON arguments supplied
  by NodeTool's manifest.
```

- [ ] Create `config/skills/nodetool-canvas/SKILL.md`.

```md
# nodetool-canvas

Use this skill when a MorpheusCore agent is asked to inspect, create, or modify
NodeTool workflows through the NodeTool frontend tool bridge.

## Rules

1. Call the available NodeTool search/list tools before choosing node types,
   handles, or model records.
2. Pass complete model records returned by NodeTool model search tools into node
   properties. Do not pass only a model id when the node expects a model object.
3. Prefer generic NodeTool AI nodes before provider-specific nodes unless the
   user requests a provider.
4. Verify the graph once after edits by calling the available graph inspection
   tool.
5. Summarize what changed in short bullets.
```

- [ ] Create `config/agents/nodetool-canvas.yaml` using the existing
  MorpheusCore agent config schema. Include:
  - id: `nodetool-canvas`
  - profile: `nodetool-canvas`
  - skills: `["nodetool-canvas"]`
  - model provider and model fields matching the MorpheusCore environment used
    for this deployment.
- [ ] Run the MorpheusCore verification command that loads profiles and agents.
  If no dedicated command exists, run the repo's normal typecheck or config
  validation command and record the output in the implementation summary.
- [ ] Commit checkpoint in MorpheusCore:
  `feat(agent): add nodetool canvas profile`.

---

## Task 10: Deployment Documentation And Acceptance Tests

**Purpose:** Make the B/S deployment story explicit and leave the desktop path as
a thin shell over the same server API.

- [ ] Create `docs/deployment/api-first-bs.md` covering:
  - Required server env: `NODETOOL_ENV=production`,
    `NODETOOL_MODEL_SURFACE=api_first`, `SECRETS_MASTER_KEY`,
    `MORPHEUS_BASE_URL`, and optional `MORPHEUS_API_KEY`.
  - Custom endpoint configuration through the new tRPC router.
  - Local provider opt-in through `NODETOOL_MODEL_SURFACE=local_first`.
  - Desktop shell contract: browser shell loads remote NodeTool URL, stores no
    model weights, and only adds native OS integration.
- [ ] Update `docs/deployment-e2e-guide.md` with a short link to the new
  API-first B/S guide.
- [ ] Add an integration test or documented manual smoke test for:
  - production server lists hosted and custom models, not local providers;
  - `/ws/agent` creates a Morpheus session without local workspace;
  - Morpheus tool call reaches `AgentSocketTransport.executeTool`;
  - a custom OpenAI-compatible endpoint can generate a text response.
- [ ] Run full verification in `G:/Projects/nodetool`:

```bash
rtk npm run typecheck
rtk npm run lint
rtk npm run test
```

- [ ] Commit checkpoint: `docs: document api-first bs deployment`.

---

## Execution Order

1. Task 1: protocol types.
2. Task 2: server model-surface helper.
3. Task 3: apply API-first filtering to model APIs.
4. Task 4: custom endpoint persistence API.
5. Task 5: dynamic custom provider resolution.
6. Task 6: MorpheusCore client.
7. Task 7: Morpheus agent provider.
8. Task 8: frontend generic agent migration.
9. Task 9: MorpheusCore profile and skill.
10. Task 10: deployment docs and final verification.

Tasks 1-5 can be implemented without a live MorpheusCore server. Tasks 6-7 can
use mocked fetch streams first, then a live MorpheusCore smoke test. Task 9 runs
in the MorpheusCore repository. Task 10 should be the final integration pass.

---

## Rollback Plan

- If custom endpoints cause runtime regressions, revert Tasks 4-5 and keep the
  API-first local-provider hiding from Tasks 1-3.
- If MorpheusCore integration is blocked by server API mismatch, keep the
  generic frontend rename and default to `"llm"` while recording the required
  MorpheusCore API change.
- If frontend migration expands too far, keep `chatPi.ts` compatibility exports
  and migrate only composer controls used by the default chat path.

---

## Final Acceptance

- `NODETOOL_MODEL_SURFACE` unset: local model providers and local model download
  controls are hidden.
- `NODETOOL_MODEL_SURFACE=local_first`: local providers and local model
  management return.
- A user can create a custom OpenAI-compatible endpoint with manual model ids and
  use it from a text-generation workflow node.
- A user can create a custom Anthropic-compatible endpoint with manual model ids
  and use it from a text-generation workflow node.
- `/ws/agent` can list and create a Morpheus agent session.
- MorpheusCore can request a NodeTool canvas tool call and NodeTool can return
  the tool result through the existing frontend bridge.
- The web client can connect to a remote NodeTool server using `VITE_API_URL`.
- The documentation names the remaining desktop work as a thin shell, not a
  second agent/runtime implementation.
