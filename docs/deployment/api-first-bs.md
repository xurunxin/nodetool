---
layout: page
title: "API-First B/S Deployment"
description: "Run NodeTool as a browser/server service with API-backed models and a MorpheusCore canvas agent."
---

This guide describes the API-first browser/server deployment shape for
NodeTool. In this mode the browser talks only to the NodeTool server. NodeTool
keeps workflow, canvas, storage, auth, model configuration, and websocket
fan-out responsibilities. MorpheusCore runs separately as the default canvas
agent runtime behind NodeTool's `/ws/agent` adapter.

## Runtime Topology

```text
browser or thin desktop shell
  -> NodeTool server
     -> NodeTool DB / storage / workflow runtime
     -> hosted model APIs and custom compatible endpoints
     -> MorpheusCore over REST/SSE
        -> nodetool-canvas agent profile and skill
```

The browser must not call MorpheusCore directly. Keep `MORPHEUS_API_KEY`,
custom endpoint API keys, and other secrets server-side.

## Required Server Environment

Set the normal production server variables from
[End-to-End Deployment Guide](../deployment-e2e-guide.md), then add the
API-first and Morpheus-specific variables:

```bash
export ENV=production
export NODETOOL_SERVER_MODE=private
export AUTH_PROVIDER=static
export SERVER_AUTH_TOKEN=<node-tool-token>
export SECRETS_MASTER_KEY=<strong-random-secret>
export ADMIN_TOKEN=<admin-token>

export NODETOOL_MODEL_SURFACE=api_first

export MORPHEUS_BASE_URL=https://morpheus.example.com
export MORPHEUS_API_KEY=<morpheus-api-key>
export MORPHEUS_AGENT_NAME=nodetool-canvas
```

`NODETOOL_MODEL_SURFACE` defaults to `api_first`, but production deployments
should set it explicitly. Use `NODETOOL_MODEL_SURFACE=local_first` only for
advanced deployments that intentionally expose local providers and local model
management again.

Start NodeTool:

```bash
nodetool serve --host 0.0.0.0 --port 7777
```

## MorpheusCore Readiness

The NodeTool adapter expects MorpheusCore to expose:

- `GET /health`
- `POST /api/v1/sessions`
- `POST /api/v1/prompt/stream`
- API key auth through `X-API-Key`
- an agent named by `MORPHEUS_AGENT_NAME`

For the default integration, MorpheusCore should include:

```text
config/profiles/nodetool-canvas/BASE.md
config/skills/nodetool-canvas/SKILL.md
config/agents/nodetool-canvas.yaml
```

The `nodetool-canvas` profile/skill should instruct MorpheusCore to use
`forward_to_frontend(forwardType="nodetool:<ui-tool-name>", payload="<JSON>")`
for canvas bridge operations. NodeTool maps that to the active browser session's
frontend tool registry through `/ws/agent`.

## Custom Compatible Endpoints

Custom OpenAI-compatible and Anthropic-compatible endpoints are part of the
API-first model surface. They are language-model endpoints only in this phase.
ASR, TTS, vision, and vendor-specific multimodal payloads should use dedicated
provider adapters later.

Register endpoints through the protected tRPC router:

```bash
curl -X POST http://<host>:7777/trpc/customModelEndpoints.upsert \
  -H "Authorization: Bearer <node-tool-token>" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "gateway",
    "name": "Gateway",
    "kind": "openai",
    "baseUrl": "https://gateway.example.com/v1",
    "enabled": true,
    "models": [
      { "id": "chat-main", "name": "Chat Main", "contextWindow": 128000 }
    ],
    "apiKey": "<gateway-api-key>"
  }'
```

The API key is stored server-side. After registration, the provider id is
`custom:<endpointId>` and configured models appear in model listing APIs and
workflow provider resolution.

## Acceptance Smoke

Run these checks against a deployed API-first server:

```bash
curl -i http://<host>:7777/health
curl -i http://<host>:7777/trpc/models.providers \
  -H "Authorization: Bearer <node-tool-token>"
curl -i http://<host>:7777/api/models/providers \
  -H "Authorization: Bearer <node-tool-token>"
```

Expected results:

- `/health` returns `200`.
- Hosted providers and custom providers are visible.
- Local-only providers such as `ollama`, `lmstudio`, `llama_cpp`, `vllm`, and
  `transformers_js` are hidden in `api_first`.
- Local model management actions return capability errors in `api_first`.

Agent smoke:

1. Open the web UI against the deployed NodeTool server.
2. Enter Agent mode in chat.
3. Confirm the model picker lists `MorpheusCore (nodetool-canvas)` when
   `MORPHEUS_BASE_URL` and `MORPHEUS_API_KEY` are configured.
4. Send a simple prompt and verify streamed text appears.
5. Ask for a canvas inspection/change that causes MorpheusCore to call
   `forward_to_frontend` with a `nodetool:<ui-tool-name>` forward type.
6. Verify NodeTool routes the call to the active browser frontend tool and
   records a `morpheus_frontend_tool_result` stream event.

If `MorpheusCore (nodetool-canvas)` is missing, check server env first. The
NodeTool server only defaults `/ws/agent` to Morpheus when both
`MORPHEUS_BASE_URL` and `MORPHEUS_API_KEY` are present.

## Thin Desktop Shell Contract

The desktop direction is a thin shell over the same web app and server API:

- The shell loads a remote NodeTool URL.
- Auth, `/ws`, `/ws/agent`, asset APIs, model configuration, and workflow APIs
  remain server-owned.
- The shell should not store model weights or expose local model management by
  default.
- Native OS integrations should be optional connectors and must not be required
  for the B/S path.
- Local-first desktop mode can opt into `NODETOOL_MODEL_SURFACE=local_first`,
  but that is a separate deployment choice.

## Known Verification Notes

On Windows, the root `npm run test` script may fail before tests start because
the web workspace script uses POSIX-style `TZ=UTC jest --forceExit`. Use the
PowerShell equivalent for targeted web tests:

```powershell
$env:TZ = "UTC"
npm --workspace=web exec -- jest -- --forceExit <pattern>
```

The API-first migration has targeted tests for protocol schemas, model surface
filtering, custom endpoint persistence/resolution, Morpheus REST/SSE parsing,
Morpheus provider behavior, frontend generic agent state, and the
Morpheus-to-canvas frontend tool bridge. Full live acceptance still requires a
reachable MorpheusCore service and an active browser session.
