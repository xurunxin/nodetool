---
layout: page
title: "API-First Browser/Server Deployment"
description: "Deploy NodeTool as a browser/server app backed by MorpheusCore and hosted model APIs."
---

This guide describes the API-first browser/server deployment shape for
NodeTool. In this mode the browser talks to one deployed NodeTool server, the
server delegates agent work to MorpheusCore, and model execution comes from
hosted or custom API endpoints by default.

The desktop app remains a thin browser shell over the same server API. It does
not own a separate model runtime in this deployment mode.

## Server Environment

Set these environment variables on the deployed NodeTool server:

```bash
export NODETOOL_ENV=production
export NODETOOL_MODEL_SURFACE=api_first
export SECRETS_MASTER_KEY=<strong-random-secret>
export MORPHEUS_BASE_URL=https://<morpheus-host>
export MORPHEUS_API_KEY=<optional-morpheus-api-key>
```

`NODETOOL_ENV=production` enables production hardening, including disabling
local workspace/file management APIs that should not be available from a
browser/server deployment.

`NODETOOL_MODEL_SURFACE=api_first` keeps local-only providers out of model
lists and model search. Hosted providers such as OpenAI, Anthropic, Gemini, and
enabled custom endpoints remain visible.

`SECRETS_MASTER_KEY` is required because custom endpoint credentials and other
server-side secrets are stored encrypted.

`MORPHEUS_BASE_URL` enables the Morpheus agent provider behind `/ws/agent`. When
this variable is present, generic agent sessions default to Morpheus unless a
client explicitly selects another provider.

`MORPHEUS_API_KEY` is optional. Set it when the MorpheusCore deployment requires
authenticated API access.

Keep the usual deployment/auth variables from the end-to-end deployment guide,
for example `NODETOOL_SERVER_MODE`, `AUTH_PROVIDER`, `SERVER_AUTH_TOKEN`, or
Supabase configuration, according to the server mode you are using.

## Start The Server

For a private API-first deployment:

```bash
export NODETOOL_ENV=production
export NODETOOL_MODEL_SURFACE=api_first
export NODETOOL_SERVER_MODE=private
export AUTH_PROVIDER=static
export SERVER_AUTH_TOKEN=<strong-token>
export SECRETS_MASTER_KEY=<strong-random-secret>
export MORPHEUS_BASE_URL=https://<morpheus-host>
export MORPHEUS_API_KEY=<optional-morpheus-api-key>

nodetool serve --host 0.0.0.0 --port 7777
```

Verify the server is reachable:

```bash
curl -i http://<nodetool-host>:7777/health
curl -i http://<nodetool-host>:7777/ping
```

## Custom Endpoint Configuration

Custom OpenAI-compatible and Anthropic-compatible model endpoints are configured
through the `customModelEndpoints` tRPC router. The server persists endpoint
metadata in settings and stores API keys as encrypted secrets.

Use `customModelEndpoints.upsert` to create or update an endpoint:

```bash
curl -sS -X POST "https://<nodetool-host>/trpc/customModelEndpoints.upsert" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  --data '{
    "json": {
      "id": "gateway_prod",
      "name": "Gateway Production",
      "kind": "openai",
      "baseUrl": "https://<gateway-host>/v1",
      "enabled": true,
      "models": [
        {
          "id": "gateway-chat",
          "name": "Gateway Chat",
          "contextWindow": 128000
        }
      ],
      "apiKey": "<gateway-api-key>"
    }
  }'
```

For an Anthropic-compatible endpoint, set `"kind": "anthropic"` and use the
endpoint base URL expected by that gateway.

List configured endpoints:

```bash
curl -sS "https://<nodetool-host>/trpc/customModelEndpoints.list" \
  -H "Authorization: Bearer <token>"
```

The custom provider id is deterministic:

```text
custom:<endpointId>
```

For the example above, nodes and agent model search should refer to provider
`custom:gateway_prod` and model id `gateway-chat`.

## Local Provider Opt-In

API-first deployments hide local provider surfaces by default. This prevents
browser/server users from seeing providers that require model weights, local
model servers, or local cache management on the NodeTool host.

Use local-first mode only for desktop-like or single-user deployments that
intentionally manage local model runtimes:

```bash
export NODETOOL_MODEL_SURFACE=local_first
```

`local_first` restores local providers such as Ollama, LM Studio, llama.cpp,
vLLM, and Transformers.js to provider/model listings when they are configured.

## Desktop Shell Contract

The desktop app is a shell over the same deployed NodeTool URL in this
architecture.

- It loads the remote NodeTool web URL.
- It connects to the same HTTP, tRPC, and `/ws/agent` server APIs as the
  browser.
- It stores no model weights for this deployment mode.
- It does not run a separate local model provider stack.
- It may add native OS integration such as windows, tray behavior, filesystem
  pickers, notifications, and deep links.

All agent behavior should remain server-owned. The renderer connects to
`/ws/agent`; the server creates Morpheus sessions and bridges Morpheus tool
calls back to renderer-executed tools.

## Acceptance Smoke Test

Use this manual smoke when live MorpheusCore or custom endpoint dependencies
make automated integration tests brittle. The hermetic test coverage for the
same contracts lives in:

- `packages/websocket/tests/trpc-models.test.ts`
- `packages/websocket/tests/custom-model-endpoints.test.ts`
- `packages/websocket/tests/custom-provider-resolver.test.ts`
- `packages/websocket/tests/morpheus-agent.test.ts`

Run those targeted tests before the live smoke:

```bash
rtk npm test --workspace=packages/websocket -- trpc-models custom-model-endpoints custom-provider-resolver morpheus-agent
```

### 1. Model Surface

Start or restart the server with these exported variables:

```bash
export NODETOOL_ENV=production
export NODETOOL_MODEL_SURFACE=api_first
export MORPHEUS_BASE_URL=https://<morpheus-host>
export SECRETS_MASTER_KEY=<secret>
```

Create at least one enabled custom endpoint through
`customModelEndpoints.upsert`.

List providers:

```bash
curl -sS "https://<nodetool-host>/trpc/models.providers" \
  -H "Authorization: Bearer <token>"
```

Expected:

- Hosted providers that have credentials are present.
- Enabled custom endpoints are present as `custom:<endpointId>`.
- Local-only providers are absent: `ollama`, `lmstudio`, `llama_cpp`, `vllm`,
  and `transformers_js`.

List text-generation models:

```bash
curl -sS "https://<nodetool-host>/trpc/models.availableForKind?input=%7B%22json%22%3A%7B%22kind%22%3A%22text_generation%22%7D%7D" \
  -H "Authorization: Bearer <token>"
```

Expected: hosted and custom text models are listed, and local provider models
are absent.

### 2. Morpheus Agent Session Without Local Workspace

Connect to `/ws/agent` and create a Morpheus session without `workspacePath`:

```js
const base = "wss://<nodetool-host>/ws/agent?api_key=<token>";
const ws = new WebSocket(base);
ws.onopen = () => {
  ws.send(JSON.stringify({
    command: "create_session",
    request_id: "create-1",
    options: {
      provider: "morpheus",
      model: "nodetool-canvas"
    }
  }));
};
ws.onmessage = (event) => console.log(event.data);
```

Expected: the server responds to `create-1` with a session id that starts with
`morpheus-session-`. No local workspace path is required.

### 3. Morpheus Tool Call Bridge

Using the session from step 2, send a prompt that asks MorpheusCore to call a
renderer tool exposed in the manifest:

This bridge assertion depends on the live Morpheus agent honoring the prompt
and emitting a tool call.

```js
ws.send(JSON.stringify({
  command: "send_message",
  request_id: "send-1",
  session_id: "<morpheus-session-id>",
  message: "Call the ui_smoke_tool with {\"value\":\"ok\"}, then summarize the result."
}));
```

When the server sends `tools_manifest_request`, reply:

```js
ws.send(JSON.stringify({
  command: "tools_manifest_response",
  request_id: "<request_id from tools_manifest_request>",
  manifest: [
    {
      name: "ui_smoke_tool",
      description: "Returns a smoke-test acknowledgement.",
      parameters: {
        type: "object",
        properties: {
          value: { type: "string" }
        },
        required: ["value"]
      }
    }
  ]
}));
```

When the server sends `tool_call_request`, reply:

```js
ws.send(JSON.stringify({
  command: "tool_call_response",
  request_id: "<request_id from tool_call_request>",
  result: {
    result: { acknowledged: true },
    isError: false
  }
}));
```

Expected:

- A `tool_call_request` arrives for `ui_smoke_tool`.
- The response is accepted.
- The final agent stream includes a non-error tool result or assistant summary.

That proves the Morpheus tool call reached `AgentSocketTransport.executeTool`
and returned over the existing renderer bridge.

### 4. Custom Endpoint Text Generation

Create a simple text-generation workflow or generic text node that uses this
model shape:

```json
{
  "provider": "custom:gateway_prod",
  "id": "gateway-chat"
}
```

Run the node or workflow through the deployed NodeTool UI or workflow API with a
short prompt such as:

```text
Reply with exactly: custom endpoint smoke ok
```

Expected:

- The run completes without falling back to a local provider.
- The text response is generated by the configured custom OpenAI-compatible
  endpoint.
- Server logs show the custom provider id (`custom:gateway_prod`) or the gateway
  request, depending on log level.

Record the endpoint id, model id, workflow/run id, and response text in the PR
or release notes for traceability.
