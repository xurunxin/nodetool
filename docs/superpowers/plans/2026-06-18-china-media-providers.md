# China Media Providers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add direct China-region video and image generation/editing support for Alibaba DashScope/Wanxiang, Volcengine Ark Seedance/Seedream, and Kling.

**Architecture:** Add provider IDs/settings and three direct node packages that share a small media-request utility layer in `@nodetool-ai/nodes-utils`. Provider-specific nodes build official vendor payloads, submit/poll async tasks where needed, download result media, and return NodeTool image/video refs. Generic provider model discovery is registered after direct nodes work so common image/video nodes can also list China-region models.

**Tech Stack:** TypeScript ESM, NodeTool `BaseNode` decorators, `ProcessingContext`, `fetch`, Vitest, existing monorepo npm workspaces.

---

## File Structure

- Modify `package.json`: add three workspaces.
- Modify `tsconfig.build.json`: add three project references.
- Modify `packages/protocol/src/api-types.ts`: add provider IDs.
- Modify `packages/runtime/src/providers/index.ts`: register provider classes.
- Create `packages/runtime/src/providers/dashscope-provider.ts`: DashScope model catalog and generic image/video capability wrappers.
- Create `packages/runtime/src/providers/volcengine-ark-provider.ts`: Ark model catalog and generic image/video capability wrappers.
- Create `packages/runtime/src/providers/kling-provider.ts`: Kling model catalog and generic image/video capability wrappers.
- Modify `packages/websocket/src/settings-registry.ts`: add `DASHSCOPE_API_KEY`, `ARK_API_KEY`, `KLING_API_KEY`.
- Modify `web/src/components/menus/APIKeysTab.tsx`: add provider cards for DashScope, Volcengine Ark, and Kling.
- Modify `packages/nodes-utils/src/index.ts`: export China media helpers.
- Create `packages/nodes-utils/src/china-media.ts`: prompt/resource compiler, media URL conversion, async polling helpers.
- Create `packages/nodes-utils/tests/china-media.test.ts`: compiler and polling tests.
- Create `packages/kling-nodes/**`: Kling nodes and tests.
- Create `packages/volcengine-nodes/**`: Seedance/Seedream nodes and tests.
- Create `packages/dashscope-nodes/**`: Wanxiang nodes and tests.

Use the existing `packages/minimax-nodes` package as the shape reference for node package `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/index.ts`, `static readonly requiredSettings`, `autoSaveAsset`, and media ref return values.

## Task 1: Workspace, Settings, and Provider Registry

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.build.json`
- Modify: `packages/protocol/src/api-types.ts`
- Modify: `packages/websocket/src/settings-registry.ts`
- Modify: `web/src/components/menus/APIKeysTab.tsx`
- Modify: `packages/runtime/src/providers/index.ts`
- Create: `packages/runtime/src/providers/dashscope-provider.ts`
- Create: `packages/runtime/src/providers/volcengine-ark-provider.ts`
- Create: `packages/runtime/src/providers/kling-provider.ts`

- [ ] **Step 1: Write provider registry tests**

Create `packages/runtime/tests/china-media-providers.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import {
  getProviderSecretKey,
  listRegisteredProviderIds
} from "../src/providers/provider-registry.js";

describe("China media provider registry", () => {
  it("registers China-region media providers with their secret keys", () => {
    expect(listRegisteredProviderIds()).toContain(PROVIDER_IDS.DASHSCOPE);
    expect(listRegisteredProviderIds()).toContain(PROVIDER_IDS.VOLCENGINE_ARK);
    expect(listRegisteredProviderIds()).toContain(PROVIDER_IDS.KLING);

    expect(getProviderSecretKey(PROVIDER_IDS.DASHSCOPE)).toBe("DASHSCOPE_API_KEY");
    expect(getProviderSecretKey(PROVIDER_IDS.VOLCENGINE_ARK)).toBe("ARK_API_KEY");
    expect(getProviderSecretKey(PROVIDER_IDS.KLING)).toBe("KLING_API_KEY");
  });
});
```

- [ ] **Step 2: Run the provider registry test and verify it fails**

Run:

```bash
npm run test --workspace=packages/runtime -- china-media-providers.test.ts
```

Expected: FAIL because `PROVIDER_IDS.DASHSCOPE`, `PROVIDER_IDS.VOLCENGINE_ARK`, and `PROVIDER_IDS.KLING` do not exist yet.

- [ ] **Step 3: Add workspace and TypeScript project references**

In root `package.json`, add these workspaces next to the other node packages:

```json
"packages/dashscope-nodes",
"packages/volcengine-nodes",
"packages/kling-nodes",
```

In `tsconfig.build.json`, add:

```json
{ "path": "packages/dashscope-nodes" },
{ "path": "packages/volcengine-nodes" },
{ "path": "packages/kling-nodes" },
```

- [ ] **Step 4: Add provider IDs**

In `packages/protocol/src/api-types.ts`, add these constants to `PROVIDER_IDS`:

```ts
DASHSCOPE: "dashscope",
VOLCENGINE_ARK: "volcengine_ark",
KLING: "kling",
```

- [ ] **Step 5: Add provider setting entries**

In `packages/websocket/src/settings-registry.ts`, add:

```ts
sec(
  "DASHSCOPE_API_KEY",
  "DashScope",
  "Alibaba Model Studio / DashScope API key for Wanxiang image and video generation. Get yours at https://bailian.console.aliyun.com/"
);
sec(
  "ARK_API_KEY",
  "Volcengine Ark",
  "Volcengine Ark API key for Doubao Seedance and Seedream media generation. Get yours at https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey"
);
sec(
  "KLING_API_KEY",
  "Kling",
  "Kling AI Open Platform API key for Kling video and image generation. Get yours at https://klingai.com/dev/api-key"
);
```

- [ ] **Step 6: Add API key UI metadata**

In `web/src/components/menus/APIKeysTab.tsx`, add three `PROVIDER_META` entries:

```ts
{
  key: "DASHSCOPE_API_KEY",
  name: "Alibaba DashScope",
  description: "Wanxiang image and video generation for China-region workflows.",
  category: "other",
  docsUrl: "https://help.aliyun.com/zh/model-studio/model-api-reference/"
},
{
  key: "ARK_API_KEY",
  name: "Volcengine Ark",
  description: "Doubao Seedance video and Seedream image generation.",
  category: "other",
  docsUrl: "https://www.volcengine.com/docs/82379"
},
{
  key: "KLING_API_KEY",
  name: "Kling",
  description: "Kling China-region image and video generation.",
  category: "other",
  docsUrl: "https://klingai.com/document-api/guides/get-started/overview"
},
```

- [ ] **Step 7: Add minimal provider classes**

Create `packages/runtime/src/providers/dashscope-provider.ts`:

```ts
import { BaseProvider } from "./base-provider.js";
import type { ImageModel, Message, ProviderStreamItem, VideoModel } from "./types.js";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";

export class DashScopeProvider extends BaseProvider {
  constructor(private readonly apiKey: string) {
    super(PROVIDER_IDS.DASHSCOPE);
  }

  static override requiredSecrets(): string[] {
    return ["DASHSCOPE_API_KEY"];
  }

  async getAvailableImageModels(): Promise<ImageModel[]> {
    return [
      { provider: this.provider, id: "wan2.7-image-pro", name: "Wanxiang 2.7 Image Pro", supported_tasks: ["text-to-image", "image-to-image"] }
    ];
  }

  async getAvailableVideoModels(): Promise<VideoModel[]> {
    return [
      { provider: this.provider, id: "wan2.7-i2v-2026-04-25", name: "Wanxiang 2.7 Image to Video", supported_tasks: ["image-to-video"] }
    ];
  }

  async generateMessage(): Promise<Message> {
    throw new Error("dashscope does not support chat generation in this provider");
  }

  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    throw new Error("dashscope does not support chat streaming in this provider");
  }
}
```

Create `packages/runtime/src/providers/volcengine-ark-provider.ts`:

```ts
import { BaseProvider } from "./base-provider.js";
import type { ImageModel, Message, ProviderStreamItem, VideoModel } from "./types.js";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";

export class VolcengineArkProvider extends BaseProvider {
  constructor(private readonly apiKey: string) {
    super(PROVIDER_IDS.VOLCENGINE_ARK);
  }

  static override requiredSecrets(): string[] {
    return ["ARK_API_KEY"];
  }

  async getAvailableImageModels(): Promise<ImageModel[]> {
    return [
      { provider: this.provider, id: "doubao-seedream-5-0-260128", name: "Doubao Seedream 5.0", supported_tasks: ["text-to-image", "image-to-image"] },
      { provider: this.provider, id: "doubao-seedream-4-0-250828", name: "Doubao Seedream 4.0", supported_tasks: ["text-to-image", "image-to-image"] }
    ];
  }

  async getAvailableVideoModels(): Promise<VideoModel[]> {
    return [
      { provider: this.provider, id: "doubao-seedance-2-0-260128", name: "Doubao Seedance 2.0", supported_tasks: ["text-to-video", "image-to-video"] }
    ];
  }

  async generateMessage(): Promise<Message> {
    throw new Error("volcengine_ark media provider does not support chat generation");
  }

  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    throw new Error("volcengine_ark media provider does not support chat streaming");
  }
}
```

Create `packages/runtime/src/providers/kling-provider.ts`:

```ts
import { BaseProvider } from "./base-provider.js";
import type { ImageModel, Message, ProviderStreamItem, VideoModel } from "./types.js";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";

export class KlingProvider extends BaseProvider {
  constructor(private readonly apiKey: string) {
    super(PROVIDER_IDS.KLING);
  }

  static override requiredSecrets(): string[] {
    return ["KLING_API_KEY"];
  }

  async getAvailableImageModels(): Promise<ImageModel[]> {
    return [
      { provider: this.provider, id: "kling-image-3-0", name: "Kling Image 3.0", supported_tasks: ["text-to-image", "image-to-image"] }
    ];
  }

  async getAvailableVideoModels(): Promise<VideoModel[]> {
    return [
      { provider: this.provider, id: "kling-v3-0-turbo", name: "Kling 3.0 Turbo", supported_tasks: ["text-to-video", "image-to-video"] },
      { provider: this.provider, id: "kling-3.0-omni", name: "Kling 3.0 Omni", supported_tasks: ["text-to-video", "image-to-video"] }
    ];
  }

  async generateMessage(): Promise<Message> {
    throw new Error("kling media provider does not support chat generation");
  }

  async *generateMessages(): AsyncGenerator<ProviderStreamItem> {
    throw new Error("kling media provider does not support chat streaming");
  }
}
```

- [ ] **Step 8: Register provider classes**

In `packages/runtime/src/providers/index.ts`, import/export/register the three providers:

```ts
import { DashScopeProvider } from "./dashscope-provider.js";
import { VolcengineArkProvider } from "./volcengine-ark-provider.js";
import { KlingProvider } from "./kling-provider.js";

export { DashScopeProvider };
export { VolcengineArkProvider };
export { KlingProvider };

registerBuiltinProvider(PROVIDER_IDS.DASHSCOPE, DashScopeProvider, { DASHSCOPE_API_KEY: "" });
registerBuiltinProvider(PROVIDER_IDS.VOLCENGINE_ARK, VolcengineArkProvider, { ARK_API_KEY: "" });
registerBuiltinProvider(PROVIDER_IDS.KLING, KlingProvider, { KLING_API_KEY: "" });
```

- [ ] **Step 9: Run tests and commit**

Run:

```bash
npm run test --workspace=packages/runtime -- china-media-providers.test.ts
npm run typecheck:web
```

Expected: provider registry test PASS; web typecheck PASS.

Commit:

```bash
git add package.json tsconfig.build.json packages/protocol/src/api-types.ts packages/runtime/src/providers/index.ts packages/runtime/src/providers/dashscope-provider.ts packages/runtime/src/providers/volcengine-ark-provider.ts packages/runtime/src/providers/kling-provider.ts packages/runtime/tests/china-media-providers.test.ts packages/websocket/src/settings-registry.ts web/src/components/menus/APIKeysTab.tsx
git commit -m "feat: register china media providers"
```

## Task 2: Shared China Media Utility Layer

**Files:**
- Create: `packages/nodes-utils/src/china-media.ts`
- Modify: `packages/nodes-utils/src/index.ts`
- Create: `packages/nodes-utils/tests/china-media.test.ts`

- [ ] **Step 1: Write compiler and polling tests**

Create `packages/nodes-utils/tests/china-media.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import {
  compilePromptResources,
  createDataUrl,
  inferImageMime,
  pollTask
} from "../src/china-media.js";

describe("compilePromptResources", () => {
  it("keeps prompt text and binds referenced resources by field name", () => {
    const compiled = compilePromptResources({
      prompt: "Use @hero as the first frame and keep the logo visible.",
      resources: {
        hero: { role: "first_frame", mediaType: "image", ref: { type: "image", uri: "https://cdn.example/hero.png" } }
      }
    });

    expect(compiled.prompt).toBe("Use hero as the first frame and keep the logo visible.");
    expect(compiled.bindings).toEqual([
      { name: "hero", role: "first_frame", mediaType: "image", ref: { type: "image", uri: "https://cdn.example/hero.png" } }
    ]);
  });

  it("throws for missing @resource mentions", () => {
    expect(() =>
      compilePromptResources({
        prompt: "Animate @missing",
        resources: {}
      })
    ).toThrow("Prompt references @missing, but no matching resource was provided");
  });
});

describe("media helpers", () => {
  it("detects jpeg and png bytes", () => {
    expect(inferImageMime(new Uint8Array([0xff, 0xd8, 0xff]))).toBe("image/jpeg");
    expect(inferImageMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBe("image/png");
  });

  it("creates data URLs", () => {
    expect(createDataUrl(new Uint8Array([1, 2, 3]), "image/png")).toBe("data:image/png;base64,AQID");
  });
});

describe("pollTask", () => {
  it("polls until the task succeeds", async () => {
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce({ status: "running" })
      .mockResolvedValueOnce({ status: "succeeded", url: "https://cdn.example/out.mp4" });

    const result = await pollTask({
      getStatus,
      isDone: (status) => status.status === "succeeded",
      isFailed: (status) => status.status === "failed",
      intervalMs: 1,
      timeoutMs: 100
    });

    expect(result).toEqual({ status: "succeeded", url: "https://cdn.example/out.mp4" });
    expect(getStatus).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
npm run test --workspace=packages/nodes-utils -- china-media.test.ts
```

Expected: FAIL because `../src/china-media.js` does not exist.

- [ ] **Step 3: Implement shared helpers**

Create `packages/nodes-utils/src/china-media.ts`:

```ts
export type PromptResourceRole =
  | "first_frame"
  | "last_frame"
  | "reference_image"
  | "reference_video"
  | "mask"
  | "source_image";

export type PromptResourceMediaType = "image" | "video";

export interface PromptResourceInput {
  role: PromptResourceRole;
  mediaType: PromptResourceMediaType;
  ref: unknown;
}

export interface PromptResourceBinding extends PromptResourceInput {
  name: string;
}

export interface CompiledPromptResources {
  prompt: string;
  bindings: PromptResourceBinding[];
}

export function compilePromptResources(args: {
  prompt: string;
  resources: Record<string, PromptResourceInput>;
}): CompiledPromptResources {
  const seen = new Set<string>();
  const prompt = args.prompt.replace(/@([A-Za-z0-9_-]+)/g, (_match, name: string) => {
    const resource = args.resources[name];
    if (!resource) {
      throw new Error(`Prompt references @${name}, but no matching resource was provided`);
    }
    seen.add(name);
    return name;
  });

  const bindings = [...seen].map((name) => ({ name, ...args.resources[name] }));
  return { prompt, bindings };
}

export function inferImageMime(bytes: Uint8Array): "image/jpeg" | "image/png" | "image/webp" {
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return "image/webp";
  return "image/png";
}

export function createDataUrl(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

export async function downloadBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status} ${await response.text()}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

export async function pollTask<T>(args: {
  getStatus: () => Promise<T>;
  isDone: (status: T) => boolean;
  isFailed: (status: T) => boolean;
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}): Promise<T> {
  const started = Date.now();
  const intervalMs = args.intervalMs ?? 5000;
  const timeoutMs = args.timeoutMs ?? 10 * 60 * 1000;

  while (true) {
    if (args.signal?.aborted) throw new Error("Task polling aborted");
    const status = await args.getStatus();
    if (args.isDone(status)) return status;
    if (args.isFailed(status)) {
      throw new Error(`Media generation task failed: ${JSON.stringify(status)}`);
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Media generation task timed out after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
```

Modify `packages/nodes-utils/src/index.ts`:

```ts
export * from "./china-media.js";
```

- [ ] **Step 4: Run tests and commit**

Run:

```bash
npm run test --workspace=packages/nodes-utils -- china-media.test.ts
npm run lint:packages
```

Expected: tests PASS; lint PASS.

Commit:

```bash
git add packages/nodes-utils/src/china-media.ts packages/nodes-utils/src/index.ts packages/nodes-utils/tests/china-media.test.ts
git commit -m "feat: add china media helper utilities"
```

## Task 3: Kling Direct Nodes

**Files:**
- Create: `packages/kling-nodes/package.json`
- Create: `packages/kling-nodes/tsconfig.json`
- Create: `packages/kling-nodes/vitest.config.ts`
- Create: `packages/kling-nodes/src/kling-base.ts`
- Create: `packages/kling-nodes/src/nodes/image-to-video.ts`
- Create: `packages/kling-nodes/src/nodes/text-to-video.ts`
- Create: `packages/kling-nodes/src/nodes/image-generation.ts`
- Create: `packages/kling-nodes/src/index.ts`
- Create: `packages/kling-nodes/tests/kling-base.test.ts`
- Create: `packages/kling-nodes/tests/registration.test.ts`

- [ ] **Step 1: Write Kling request builder tests**

Create `packages/kling-nodes/tests/kling-base.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildKlingImageToVideoBody,
  klingCreatePath,
  parseKlingTaskResult
} from "../src/kling-base.js";

describe("Kling request builders", () => {
  it("builds image-to-video contents with prompt and first frame", () => {
    expect(
      buildKlingImageToVideoBody({
        prompt: "A product shot",
        firstFrameUrl: "data:image/png;base64,AQID",
        duration: 5,
        resolution: "1080p",
        watermark: false
      })
    ).toEqual({
      contents: [
        { type: "prompt", text: "A product shot" },
        { type: "first_frame", url: "data:image/png;base64,AQID" }
      ],
      settings: { duration: 5, resolution: "1080p" },
      options: { watermark_info: { enabled: false } }
    });
  });

  it("maps model ids to official create paths", () => {
    expect(klingCreatePath("/v1/videos/image2video")).toBe("https://api-beijing.klingai.com/v1/videos/image2video");
  });

  it("extracts generated media url from a succeeded task", () => {
    expect(parseKlingTaskResult({ data: [{ status: "succeeded", outputs: [{ type: "video", url: "https://cdn.example/out.mp4" }] }] })).toBe("https://cdn.example/out.mp4");
  });
});
```

- [ ] **Step 2: Scaffold Kling package**

Use package metadata matching `@nodetool-ai/minimax-nodes`, with name `@nodetool-ai/kling-nodes`, dependencies on `@nodetool-ai/node-sdk`, `@nodetool-ai/runtime`, and `@nodetool-ai/nodes-utils`.

- [ ] **Step 3: Implement Kling base**

Create `packages/kling-nodes/src/kling-base.ts` with these exported functions:

```ts
import { downloadBytes, pollTask } from "@nodetool-ai/nodes-utils";

export const KLING_BASE_URL = "https://api-beijing.klingai.com";
export const KLING_VIDEO_MODELS = ["kling-v3-0-turbo"] as const;
export const KLING_RESOLUTIONS = ["720p", "1080p"] as const;
export const KLING_DURATIONS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const;

export function getKlingApiKey(secrets: Record<string, string>): string {
  const key = secrets?.KLING_API_KEY || process.env.KLING_API_KEY || "";
  if (!key) throw new Error("KLING_API_KEY is not configured");
  return key;
}

export function klingHeaders(apiKey: string): Record<string, string> {
  return { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" };
}

export function klingCreatePath(model: string, task: "text-to-video" | "image-to-video" | "image-generation"): string {
  if (task === "image-to-video") return `/image-to-video/${model}`;
  if (task === "text-to-video") return `/text-to-video/${model}`;
  return `/image-generation/${model}`;
}

export function buildKlingImageToVideoBody(args: {
  prompt: string;
  firstFrameUrl: string;
  duration: number;
  resolution: string;
  watermark: boolean;
}): Record<string, unknown> {
  return {
    contents: [
      { type: "prompt", text: args.prompt },
      { type: "first_frame", url: args.firstFrameUrl }
    ],
    settings: { duration: args.duration, resolution: args.resolution },
    options: { watermark_info: { enabled: args.watermark } }
  };
}

export function parseKlingTaskResult(data: unknown): string {
  const root = data as { data?: Array<{ outputs?: Array<{ type?: string; url?: string }> }> };
  const output = root.data?.flatMap((item) => item.outputs ?? []).find((item) => item.url);
  if (!output?.url) throw new Error(`Kling task returned no media URL: ${JSON.stringify(data)}`);
  return output.url;
}

export async function submitKlingTask(apiKey: string, path: string, body: Record<string, unknown>): Promise<string> {
  const response = await fetch(`${KLING_BASE_URL}${path}`, {
    method: "POST",
    headers: klingHeaders(apiKey),
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`Kling submit failed: ${response.status} ${await response.text()}`);
  const data = (await response.json()) as { data?: { id?: string }; task_id?: string };
  const taskId = data.data?.id ?? data.task_id;
  if (!taskId) throw new Error(`Kling submit returned no task id: ${JSON.stringify(data)}`);
  return taskId;
}

export async function waitForKlingResult(apiKey: string, taskId: string): Promise<Uint8Array> {
  const status = await pollTask({
    getStatus: async () => {
      const response = await fetch(`${KLING_BASE_URL}/tasks?task_ids=${encodeURIComponent(taskId)}`, {
        headers: klingHeaders(apiKey)
      });
      if (!response.ok) throw new Error(`Kling task query failed: ${response.status} ${await response.text()}`);
      return response.json();
    },
    isDone: (value) => JSON.stringify(value).includes("succeeded"),
    isFailed: (value) => JSON.stringify(value).includes("failed"),
    intervalMs: 5000,
    timeoutMs: 20 * 60 * 1000
  });
  return downloadBytes(parseKlingTaskResult(status));
}
```

- [ ] **Step 4: Implement Kling nodes**

Create node classes:

- `KlingImageToVideoNode`: inputs `image`, `prompt`; fields `model`, `duration`, `resolution`, `watermark`; converts image bytes to data URL with `inferImageMime/createDataUrl`; calls `submitKlingTask` and `waitForKlingResult`; returns `{ output: { type: "video", data: base64 } }`.
- `KlingTextToVideoNode`: inputs `prompt`; fields `model`, `duration`, `resolution`, `watermark`; builds `contents` with only `{ type: "prompt", text }`.
- `KlingImageGenerationNode`: inputs `prompt`; fields `model`, `resolution`, `watermark`; returns an image ref.

Use static fields:

```ts
static readonly requiredSettings = ["KLING_API_KEY"];
static readonly autoSaveAsset = true;
static readonly body = "content_card";
```

- [ ] **Step 5: Run Kling tests and commit**

Run:

```bash
npm run test --workspace=@nodetool-ai/kling-nodes
npm run build --workspace=@nodetool-ai/kling-nodes
```

Expected: tests PASS; package build PASS.

Commit:

```bash
git add packages/kling-nodes package.json tsconfig.build.json
git commit -m "feat: add kling media nodes"
```

## Task 4: Volcengine Ark Seedance and Seedream Nodes

**Files:**
- Create: `packages/volcengine-nodes/**`
- Test: `packages/volcengine-nodes/tests/volcengine-base.test.ts`

- [ ] **Step 1: Write request builder tests**

Create `packages/volcengine-nodes/tests/volcengine-base.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildSeedanceContent,
  buildSeedreamBody,
  parseSeedanceResultUrl
} from "../src/volcengine-base.js";

describe("Volcengine request builders", () => {
  it("builds Seedance multimodal content", () => {
    expect(
      buildSeedanceContent({
        prompt: "First-person product ad",
        imageUrls: ["https://cdn.example/a.png"],
        videoUrls: ["https://cdn.example/ref.mp4"]
      })
    ).toEqual([
      { type: "text", text: "First-person product ad" },
      { type: "image_url", image_url: { url: "https://cdn.example/a.png" }, role: "reference_image" },
      { type: "video_url", video_url: { url: "https://cdn.example/ref.mp4" }, role: "reference_video" }
    ]);
  });

  it("builds Seedream image generation body", () => {
    expect(
      buildSeedreamBody({
        model: "doubao-seedream-5-0-260128",
        prompt: "A poster",
        images: ["data:image/png;base64,AQID"],
        size: "2K",
        watermark: false
      })
    ).toEqual({
      model: "doubao-seedream-5-0-260128",
      prompt: "A poster",
      image: ["data:image/png;base64,AQID"],
      size: "2K",
      response_format: "url",
      watermark: false
    });
  });

  it("extracts Seedance video_url", () => {
    expect(parseSeedanceResultUrl({ content: { video_url: "https://cdn.example/out.mp4" } })).toBe("https://cdn.example/out.mp4");
  });
});
```

- [ ] **Step 2: Scaffold Volcengine package**

Mirror `packages/kling-nodes` package setup, with package name `@nodetool-ai/volcengine-nodes`.

- [ ] **Step 3: Implement Volcengine base**

Create `src/volcengine-base.ts` with:

- `ARK_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3"`
- `getArkApiKey(secrets)`
- `arkHeaders(apiKey)`
- `buildSeedanceContent({ prompt, imageUrls, videoUrls })`
- `buildSeedreamBody({ model, prompt, images, size, watermark })`
- `submitSeedanceTask(apiKey, body)`
- `waitForSeedanceResult(apiKey, taskId)`
- `generateSeedreamImage(apiKey, body)`
- `parseSeedanceResultUrl(data)`
- `parseSeedreamImageUrls(data)`

Use official endpoints:

```ts
const SEEDANCE_TASKS_PATH = "/contents/generations/tasks";
const SEEDREAM_IMAGES_PATH = "/images/generations";
```

- [ ] **Step 4: Implement Seedance nodes**

Create:

- `VolcengineSeedanceTextToVideoNode`
- `VolcengineSeedanceImageToVideoNode`
- `VolcengineSeedanceReferenceToVideoNode`

Use fields:

```ts
model: "doubao-seedance-2-0-260128"
prompt: string
image / reference_images / reference_videos
duration: number
ratio: "16:9" | "9:16" | "1:1" | "4:3" | "3:4"
resolution: "720p" | "1080p"
watermark: boolean
return_last_frame: boolean
```

Map images/videos to `content[]` entries with `reference_image` and `reference_video` roles.

- [ ] **Step 5: Implement Seedream nodes**

Create:

- `VolcengineSeedreamTextToImageNode`
- `VolcengineSeedreamImageEditNode`
- `VolcengineSeedreamMultiReferenceImageNode`

Use fields:

```ts
model: "doubao-seedream-5-0-260128"
prompt: string
image / images
size: "2K" | "3K" | "4K" | "2048x2048" | "2848x1600" | "1600x2848"
watermark: boolean
```

Return the first generated image as a NodeTool image ref.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
npm run test --workspace=@nodetool-ai/volcengine-nodes
npm run build --workspace=@nodetool-ai/volcengine-nodes
```

Expected: tests PASS; package build PASS.

Commit:

```bash
git add packages/volcengine-nodes package.json tsconfig.build.json
git commit -m "feat: add volcengine media nodes"
```

## Task 5: DashScope / Wanxiang Nodes

**Files:**
- Create: `packages/dashscope-nodes/**`
- Test: `packages/dashscope-nodes/tests/dashscope-base.test.ts`

- [ ] **Step 1: Write DashScope request builder tests**

Create `packages/dashscope-nodes/tests/dashscope-base.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  buildWanxImageToVideoBody,
  parseDashScopeTaskId,
  parseWanxResultUrl
} from "../src/dashscope-base.js";

describe("DashScope request builders", () => {
  it("builds Wanxiang image-to-video body", () => {
    expect(
      buildWanxImageToVideoBody({
        model: "wan2.7-i2v-2026-04-25",
        prompt: "Move slowly",
        firstFrameUrl: "data:image/png;base64,AQID",
        duration: 5,
        resolution: "720P",
        watermark: false
      })
    ).toEqual({
      model: "wan2.7-i2v-2026-04-25",
      input: {
        prompt: "Move slowly",
        media: [{ type: "first_frame", url: "data:image/png;base64,AQID" }]
      },
      parameters: { duration: 5, resolution: "720P", watermark: false }
    });
  });

  it("extracts task id", () => {
    expect(parseDashScopeTaskId({ output: { task_id: "task-1" } })).toBe("task-1");
  });

  it("extracts video url", () => {
    expect(parseWanxResultUrl({ output: { video_url: "https://cdn.example/out.mp4" } })).toBe("https://cdn.example/out.mp4");
  });
});
```

- [ ] **Step 2: Scaffold DashScope package**

Mirror `packages/kling-nodes` package setup, with package name `@nodetool-ai/dashscope-nodes`.

- [ ] **Step 3: Implement DashScope base**

Create `src/dashscope-base.ts` with:

- `DASHSCOPE_BASE_URL = "https://dashscope.aliyuncs.com"`
- `getDashScopeApiKey(secrets)`
- `dashScopeHeaders(apiKey, async = false)`
- `buildWanxImageToVideoBody(args)`
- `buildWanxTextToVideoBody(args)`
- `buildWanxImageEditBody(args)`
- `submitDashScopeTask(apiKey, path, body)`
- `waitForDashScopeTask(apiKey, taskId)`
- `parseDashScopeTaskId(data)`
- `parseWanxResultUrl(data)`

Use video endpoint path:

```ts
const WANX_VIDEO_SYNTHESIS_PATH = "/api/v1/services/aigc/video-generation/video-synthesis";
```

Use `X-DashScope-Async: enable` for async task creation.

- [ ] **Step 4: Implement Wanxiang video nodes**

Create:

- `DashScopeWanxTextToVideoNode`
- `DashScopeWanxImageToVideoNode`
- `DashScopeWanxReferenceToVideoNode`

Use fields:

```ts
model: "wan2.7-i2v-2026-04-25"
prompt: string
first_frame / last_frame / reference_images
duration: number
resolution: "720P" | "1080P"
prompt_extend: boolean
watermark: boolean
seed: number
```

- [ ] **Step 5: Implement Wanxiang image nodes**

Create:

- `DashScopeWanxTextToImageNode`
- `DashScopeWanxImageEditNode`

Use the official Wanxiang 2.7 synchronous multimodal image endpoint:

```ts
const WANX_IMAGE_GENERATION_PATH = "/api/v1/services/aigc/multimodal-generation/generation";
```

Build image requests with the official `input.messages[0].content[]` shape:

```ts
export function buildWanxImageBody(args: {
  model: string;
  prompt: string;
  images: string[];
  size: string;
  watermark: boolean;
  n: number;
}): Record<string, unknown> {
  return {
    model: args.model,
    input: {
      messages: [
        {
          role: "user",
          content: [
            ...args.images.map((image) => ({ image })),
            { text: args.prompt }
          ]
        }
      ]
    },
    parameters: {
      size: args.size,
      n: args.n,
      watermark: args.watermark
    }
  };
}
```

Parse the first image URL from `output.choices[0].message.content[]`:

```ts
export function parseWanxImageUrl(data: unknown): string {
  const root = data as {
    output?: {
      choices?: Array<{
        message?: { content?: Array<{ image?: string; type?: string }> };
      }>;
    };
  };
  const image = root.output?.choices?.[0]?.message?.content?.find((item) => item.image)?.image;
  if (!image) throw new Error(`DashScope image generation returned no image URL: ${JSON.stringify(data)}`);
  return image;
}
```

- [ ] **Step 6: Run tests and commit**

Run:

```bash
npm run test --workspace=@nodetool-ai/dashscope-nodes
npm run build --workspace=@nodetool-ai/dashscope-nodes
```

Expected: tests PASS; package build PASS.

Commit:

```bash
git add packages/dashscope-nodes package.json tsconfig.build.json
git commit -m "feat: add dashscope wanxiang media nodes"
```

## Task 6: Generic Provider Media Capabilities

**Files:**
- Modify: `packages/runtime/src/providers/kling-provider.ts`
- Modify: `packages/runtime/src/providers/volcengine-ark-provider.ts`
- Modify: `packages/runtime/src/providers/dashscope-provider.ts`
- Test: `packages/runtime/tests/china-media-provider-capabilities.test.ts`

- [ ] **Step 1: Write capability tests with mocked fetch**

Create `packages/runtime/tests/china-media-provider-capabilities.test.ts` to assert:

- `KlingProvider.textToVideo()` submits a Kling text-to-video task and downloads bytes.
- `VolcengineArkProvider.textToImage()` calls `/images/generations`.
- `DashScopeProvider.imageToVideo()` calls Wanxiang video synthesis with `X-DashScope-Async: enable`.

Mock `globalThis.fetch` with Vitest and return minimal successful JSON for each provider.

- [ ] **Step 2: Implement provider media methods**

For each provider class, import the matching package base helpers and implement:

```ts
textToImage(params)
imageToImage(images, params)
textToVideo(params)
imageToVideo(images, params)
```

Only implement methods backed by first-release endpoints. Let unsupported methods fall through to `BaseProvider` errors.

- [ ] **Step 3: Run provider capability tests and commit**

Run:

```bash
npm run test --workspace=packages/runtime -- china-media-provider-capabilities.test.ts
npm run build --workspace=packages/runtime
```

Expected: tests PASS; runtime build PASS.

Commit:

```bash
git add packages/runtime/src/providers/kling-provider.ts packages/runtime/src/providers/volcengine-ark-provider.ts packages/runtime/src/providers/dashscope-provider.ts packages/runtime/tests/china-media-provider-capabilities.test.ts
git commit -m "feat: expose china media provider capabilities"
```

## Task 7: Full Verification and Documentation Examples

**Files:**
- Create: `docs/superpowers/reports/2026-06-18-china-media-providers-test-report.md`
- Optional modify: user-facing provider docs if this repo already has a provider docs page.

- [ ] **Step 1: Run focused package checks**

Run:

```bash
npm run test --workspace=packages/nodes-utils -- china-media.test.ts
npm run test --workspace=@nodetool-ai/kling-nodes
npm run test --workspace=@nodetool-ai/volcengine-nodes
npm run test --workspace=@nodetool-ai/dashscope-nodes
npm run test --workspace=packages/runtime -- china-media
```

Expected: all PASS.

- [ ] **Step 2: Run repo-required verification**

Run:

```bash
npm run typecheck
npm run lint
npm run test
```

Expected: all PASS.

- [ ] **Step 3: Write test report**

Create `docs/superpowers/reports/2026-06-18-china-media-providers-test-report.md`:

```md
# China Media Providers Test Report

Date: 2026-06-18

## Commands

- `npm run test --workspace=packages/nodes-utils -- china-media.test.ts`
- `npm run test --workspace=@nodetool-ai/kling-nodes`
- `npm run test --workspace=@nodetool-ai/volcengine-nodes`
- `npm run test --workspace=@nodetool-ai/dashscope-nodes`
- `npm run test --workspace=packages/runtime -- china-media`
- `npm run typecheck`
- `npm run lint`
- `npm run test`

## Result

All required checks passed.

## Notes

Network integration tests are opt-in and were not run without real vendor API keys.
```

- [ ] **Step 4: Commit final verification report**

Commit:

```bash
git add docs/superpowers/reports/2026-06-18-china-media-providers-test-report.md
git commit -m "docs: add china media provider test report"
```

## Self-Review

Spec coverage:

- Direct local China-region vendor access: Tasks 1, 3, 4, 5, 6.
- Video + image generation/editing only: Tasks 3, 4, 5 avoid audio/music/digital humans/3D.
- KIE is not used as an implementation dependency: no task depends on `packages/kie-nodes`.
- Official prompt/resource structures: Tasks 2, 3, 4, 5 map to Kling `contents[]`, Ark `content[]`, and DashScope `media[]`.
- Settings and API key UI: Task 1.
- Async submit/poll/download: Tasks 2, 3, 4, 5.
- Provider model discovery: Tasks 1 and 6.
- Verification: Task 7.

Placeholder scan:

- No placeholder terms remain. DashScope image generation uses the official Wanxiang 2.7 synchronous endpoint `/api/v1/services/aigc/multimodal-generation/generation`.

Type consistency:

- Provider IDs are `dashscope`, `volcengine_ark`, and `kling` throughout.
- Secret names are `DASHSCOPE_API_KEY`, `ARK_API_KEY`, and `KLING_API_KEY` throughout.
- Shared compiler output is consistently mapped to vendor request builders.
