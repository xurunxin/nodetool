# China Media Providers Design

Date: 2026-06-18

## Summary

Add first-class, direct China-region media generation support to NodeTool for
video and image generation/editing. The first release targets:

- Alibaba Model Studio / DashScope / Wanxiang
- Volcengine Ark / Doubao Seedance and Seedream
- Kling AI Open Platform

The goal is not to wrap KIE's aggregated model catalog. KIE already covers many
models as an aggregator, but this work provides direct API access to local
China-region vendor services, using each vendor's official auth, endpoints,
task lifecycle, and prompt/resource input format.

## Goals

- Provide direct vendor nodes for China-region video and image generation/editing.
- Support async task submission, polling, result download, and callback-ready
  metadata where the vendor exposes asynchronous jobs.
- Add provider settings and API key UI entries for each vendor.
- Expose vendor-specific nodes when the vendor input model is meaningfully
  different from the generic NodeTool image/video nodes.
- Add a shared prompt resource compiler so prompts can reference NodeTool
  resources with `@resource` syntax and compile into each vendor's required
  media/reference structure.
- Keep the LLM model catalog path separate. For future LLM work, reuse the
  existing Pi model registry style and reference Pi's model catalog where useful.

## Non-Goals

- Do not implement audio generation, music generation, digital humans, 3D,
  virtual try-on, or Kling effect templates in the first release.
- Do not replace KIE or remove aggregator nodes.
- Do not add a broad marketplace abstraction before direct provider support is
  proven with the first three vendors.
- Do not require users to understand vendor JSON structures for common workflows.

## Official API Findings

### Alibaba Model Studio / DashScope / Wanxiang

Official docs:

- https://help.aliyun.com/zh/model-studio/model-api-reference/
- https://help.aliyun.com/zh/model-studio/image-generation/
- https://help.aliyun.com/zh/model-studio/video-generation-api/
- https://help.aliyun.com/zh/model-studio/image-to-video-general-api-reference

Relevant shape:

- Uses DashScope / Model Studio API keys and region-aware endpoints.
- Wanxiang video generation uses async task creation and polling.
- Wanxiang 2.7 image-to-video creation endpoint includes:
  `POST https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis`
  for Beijing-region public DashScope access.
- Async creation requires headers including `Authorization: Bearer
  $DASHSCOPE_API_KEY`, `Content-Type: application/json`, and
  `X-DashScope-Async: enable`.
- Video input supports `input.prompt` and `input.media[]`.
- `input.media[]` carries typed media such as `first_frame`, `last_frame`,
  `driving_audio`, and `first_clip`.
- Media URLs can be HTTP/HTTPS, OSS temporary URLs, or base64 data URLs.

### Volcengine Ark / Seedance / Seedream

Official docs:

- https://www.volcengine.com/docs/82379
- https://www.volcengine.com/docs/82379/1520757?lang=zh
- https://www.volcengine.com/docs/82379/1521309?lang=zh
- https://www.volcengine.com/docs/82379/1541523?lang=zh
- https://www.volcengine.com/docs/82379/1631633?lang=zh
- https://www.volcengine.com/docs/82379/1829186?lang=zh

Relevant shape:

- Uses `ARK_API_KEY`.
- Video creation endpoint:
  `POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`.
- Video creation body includes `model`, `content[]`, optional `callback_url`,
  `return_last_frame`, `service_tier`, `execution_expires_after`,
  `generate_audio`, `ratio`, `duration`, `resolution`, `seed`, `watermark`, and
  related model-specific parameters.
- Seedance 2.0 supports multimodal reference video generation with text,
  images, videos, and audio. For the first release, only video/image references
  are exposed in NodeTool nodes; audio fields stay internal or disabled.
- The video `content[]` examples use entries such as:
  - `{ type: "text", text: "..." }`
  - `{ type: "image_url", image_url: { url }, role: "reference_image" }`
  - `{ type: "video_url", video_url: { url }, role: "reference_video" }`
- Video tasks are async and must be polled until `queued`, `running`,
  `succeeded`, `failed`, or `expired`.
- Image generation endpoint:
  `POST https://ark.cn-beijing.volces.com/api/v3/images/generations`.
- Seedream image body includes `model`, `prompt`, optional `image`, `size`,
  `response_format`, `watermark`, and prompt optimization options.
- Seedream 4.0/4.5/5.0 lite support text-to-image, image-to-image, and
  multi-reference image generation. The docs describe up to 14 reference images
  for supported models.

### Kling AI Open Platform

Official docs:

- https://klingai.com/document-api/guides/get-started/overview
- https://klingai.com/document-api/api/get-started/authentication
- https://klingai.com/document-api/apiReference/model/imageToVideo

Relevant shape:

- China-region base URL: `https://api-beijing.klingai.com`.
- New API Key auth uses `Authorization: Bearer <API_KEY>` and applies to all
  models.
- Older Access Key / Secret Key auth is only for 3.0 and earlier models and
  should not be the default for new NodeTool support.
- Image-to-video endpoint: `POST /v1/videos/image2video`.
- Request body uses top-level fields such as `model_name`, `image`, `prompt`,
  `mode`, `duration`, `callback_url`, and `external_task_id`.
- NodeTool maps generic resolution hints onto Kling's `mode` field
  (`1080p`/`high` -> `pro`, `720p`/`standard` -> `std`).
- Tasks can be queried with `GET /v1/videos/image2video/{task_id}`.
- Output records include task status and generated media URLs. Generated media
  URLs are temporary and should be downloaded or persisted as NodeTool assets.

## Current NodeTool Fit

The current codebase already supports two relevant patterns:

- Generic media nodes in `packages/video-nodes` and related image nodes call
  `context.runProviderPrediction()` with capabilities such as `video_to_video`.
- Direct provider-specific packages, such as `packages/minimax-nodes`, expose
  vendor-specific nodes, handle vendor auth, submit async tasks, poll, download
  media, and return NodeTool image/video refs.

The first China media release should use both patterns:

- Register new providers so generic model pickers can see available image/video
  models over time.
- Add direct vendor nodes for workflows where the input schema is not generic,
  especially multimodal references and vendor-specific settings.

## Provider IDs and Settings

Add provider IDs:

- `dashscope`
- `volcengine_ark`
- `kling`

Add required settings:

- `DASHSCOPE_API_KEY`
- `ARK_API_KEY`
- `KLING_API_KEY`

Optional future settings:

- `DASHSCOPE_BASE_URL`
- `ARK_BASE_URL`
- `KLING_BASE_URL`
- `DASHSCOPE_WORKSPACE_ID`

Defaults should target China-region endpoints:

- DashScope: `https://dashscope.aliyuncs.com`
- Ark: `https://ark.cn-beijing.volces.com/api/v3`
- Kling: `https://api-beijing.klingai.com`

## Package and Node Layout

Prefer new provider-specific packages so each vendor can evolve independently:

- `packages/dashscope-nodes`
- `packages/volcengine-nodes`
- `packages/kling-nodes`

Each package should follow the `packages/minimax-nodes` style:

- `src/index.ts`
- `src/<provider>-base.ts`
- `src/nodes/text-to-video.ts`
- `src/nodes/image-to-video.ts`
- `src/nodes/text-to-image.ts`
- `src/nodes/image-to-image.ts`
- vendor-specific nodes only when needed
- focused unit tests around request building and task polling

First release nodes:

- DashScope:
  - `dashscope.WanxTextToVideo`
  - `dashscope.WanxImageToVideo`
  - `dashscope.WanxReferenceToVideo`
  - `dashscope.WanxTextToImage`
  - `dashscope.WanxImageEdit`
- Volcengine:
  - `volcengine.SeedanceTextToVideo`
  - `volcengine.SeedanceImageToVideo`
  - `volcengine.SeedanceReferenceToVideo`
  - `volcengine.SeedreamTextToImage`
  - `volcengine.SeedreamImageEdit`
  - `volcengine.SeedreamMultiReferenceImage`
- Kling:
  - `kling.TextToVideo`
  - `kling.ImageToVideo`
  - `kling.ImageGeneration`
  - `kling.ImageEdit`

If a vendor endpoint supports both generation and editing with the same API,
the node should still expose task-focused labels in the UI while sharing the
same internal request builder.

## Prompt Resource Compiler

Add a shared compiler module used by direct nodes:

```ts
type PromptResourceRole =
  | "first_frame"
  | "last_frame"
  | "reference_image"
  | "reference_video"
  | "mask"
  | "source_image";

interface PromptResourceBinding {
  name: string;
  role: PromptResourceRole;
  mediaType: "image" | "video";
  ref: unknown;
}

interface CompiledPromptResources {
  prompt: string;
  bindings: PromptResourceBinding[];
}
```

The compiler should:

- Parse prompt text for `@resource` mentions.
- Resolve mentions against explicit node inputs first.
- Allow users to assign resource roles with node fields, not only prompt text.
- Preserve readable text in the final prompt while removing syntax that the
  vendor does not understand.
- Produce vendor-specific payload fragments:
  - DashScope: `input.media[]`
  - Ark Seedance: `content[]`
  - Kling: `contents[]`
- Validate vendor limits before network calls.
- Return clear errors for missing resources, unsupported media type, duplicate
  first/last frame roles, or too many references.

The first version can keep parsing conservative:

- `@name` refers to a resource input with matching display name or field name.
- Explicit node fields decide role, for example `first_frame`, `last_frame`,
  `reference_images`, `reference_videos`.
- Advanced inline syntax such as `@name:first_frame` can be deferred unless the
  UI already has a natural affordance for it.

## Media Upload and URL Strategy

Vendors mostly accept URL or base64 data URLs. NodeTool media refs may contain
asset IDs, local file URLs, or inline bytes.

The shared request layer should choose:

1. Use an existing public HTTPS URL if the media ref already has one.
2. Use base64 data URLs when the vendor supports them and size is within limits.
3. Use a temporary asset URL resolver from `ProcessingContext` when available.
4. Fail with a clear message if a local-only resource cannot be uploaded or
   embedded for that vendor.

Result URLs should be downloaded and returned as NodeTool image/video refs, not
left as remote-only links, because vendor result URLs can expire.

## Async Task Lifecycle

Implement a common polling helper shape per provider package:

```ts
interface AsyncMediaTask<TSubmit, TStatus> {
  submit(body: TSubmit): Promise<{ taskId: string }>;
  get(taskId: string): Promise<TStatus>;
  wait(taskId: string, options?: PollOptions): Promise<TStatus>;
  download(status: TStatus): Promise<Uint8Array | Uint8Array[]>;
}
```

Polling defaults:

- Use provider-recommended intervals where docs specify them.
- Otherwise start around 5 seconds and cap around 30 seconds.
- Respect `AbortSignal` from processing context if available.
- Surface vendor status and request IDs in thrown errors.

## Model Catalog

First release can hardcode a small vetted catalog per provider:

- Wanxiang 2.7 image/video models from Model Studio docs.
- Doubao Seedance 2.0 and Seedream 4.0/4.5/5.0 lite model IDs from Ark docs.
- Kling 3.0 Turbo / 3.0 Omni and current Kling Image models from Kling docs.

Longer term:

- Move media model catalogs into JSON manifests per package.
- Add provider `getAvailableImageModels()` and `getAvailableVideoModels()`.
- For LLM providers later, mirror the Pi integration style: central registry,
  provider/model descriptors, and OpenAI-compatible base URL metadata where
  applicable.

## Error Handling

Errors should include:

- Provider name and endpoint category.
- HTTP status and vendor error code/message when available.
- Task ID and request ID when available.
- A short remediation hint for missing API keys, missing region access, expired
  result URLs, unsupported resource format, and moderation failures.

Do not log API keys, signed URLs beyond what is necessary, or base64 media.

## UI and UX

Node fields should be task-centered:

- Prompt
- Negative prompt where supported
- Model
- Resolution or size
- Duration
- Aspect ratio or ratio
- First frame
- Last frame
- Reference images
- Reference videos
- Watermark
- Seed
- Callback URL only as an advanced field

The user should not have to build raw JSON. Advanced JSON escape hatches can be
added later if needed, but should not be first-release UX.

## Tests

Unit tests:

- API key lookup and missing-key errors.
- Request builder mapping for each vendor.
- Prompt resource compiler mapping to DashScope `media[]`, Ark `content[]`, and
  Kling `contents[]`.
- Polling state transitions and failure surfaces with mocked `fetch`.
- Result download into NodeTool image/video refs.

Integration-style tests with network calls should be opt-in and skipped by
default unless the corresponding API key is present.

Verification commands after implementation:

- `npm run typecheck`
- `npm run lint`
- `npm run test`

## Rollout Plan

1. Add settings and provider IDs.
2. Add shared compiler and async task helpers.
3. Implement Kling nodes first because the request shape is compact and the
   China-region endpoint is clear.
4. Implement Volcengine nodes second because Seedance/Seedream share Ark auth
   and base URL but have different sync/async behavior.
5. Implement DashScope/Wanxiang nodes third because endpoint and region variants
   need careful handling.
6. Wire provider catalogs into image/video model discovery.
7. Add documentation examples for China-region workflows.

## Open Questions

- Should callback URLs be hidden entirely in V1, or kept as advanced fields?
- Should media result URLs be persisted immediately as assets even when the node
  caller only needs a transient ref?
- Should first-release model catalogs include only latest recommended models or
  also older stable versions for compatibility?
