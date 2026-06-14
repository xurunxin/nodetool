# API-First Morpheus B/S TODO Tracker

> Update this file after every completed task. Keep the implementation details in
> `docs/superpowers/plans/2026-06-14-api-first-morpheus-bs.md`; use this file as
> the compact progress board.

**Goal:** Track the NodeTool API-first B/S migration, custom model endpoint
support, MorpheusCore agent replacement, and thin desktop shell direction.

**Source Spec:** `docs/superpowers/specs/2026-06-14-api-first-morpheus-bs-design.md`

**Implementation Plan:** `docs/superpowers/plans/2026-06-14-api-first-morpheus-bs.md`

**Current Active Stage:** Phase 2, Task 4: persist custom endpoint metadata and
secrets.

**Status Legend:** `[x] done`, `[~] in progress`, `[ ] pending`, `[!] blocked`

---

## Operating Rules

- Update this tracker immediately after a task is implemented, verified, and
  committed.
- Every completed item must record the commit hash and the verification command
  or manual smoke evidence.
- Keep unrelated local changes out of task commits.
- Before each implementation step, check `git status --short` and record any
  pre-existing dirty files that should be preserved.

---

## Milestone Board

- [x] **M0: Planning and MorpheusCore readiness**
  - Commit: `e673657ae` in NodeTool for the implementation plan.
  - Commit: `690e5157c` in NodeTool for the design spec.
  - External commit: `54c93406` in MorpheusCore for routing local profiles
    through their profile service.
  - Verification: live MorpheusCore health/session/SSE smoke against
    `http://localhost:3000`; `nodetool-canvas` now resolves by display name and
    exposes `forward_to_frontend`.
- [x] **M1: API-first model surface**
  - Completed through Task 3.
  - Exit criteria: local-only model providers are hidden by default from server
    model APIs and agent-visible model search.
- [~] **M2: Custom OpenAI/Anthropic-compatible endpoints**
  - Next task: Task 4, persist custom endpoint metadata and secrets.
  - Exit criteria: endpoint metadata is persisted, secrets stay server-side, and
    configured models appear in model selectors and workflow provider
    resolution.
- [ ] **M3: Morpheus agent provider behind `/ws/agent`**
  - Exit criteria: NodeTool can create and stream a Morpheus session without Pi
    workspace assumptions.
- [ ] **M4: Canvas tool bridge**
  - Exit criteria: a Morpheus tool call reaches the active NodeTool canvas and
    the result returns to MorpheusCore.
- [ ] **M5: B/S deployment and thin desktop shell documentation**
  - Exit criteria: docs describe production API-first deployment, remote
    MorpheusCore integration, custom endpoints, local-first opt-in, and desktop
    shell boundaries.

---

## Detailed TODO

### Phase 0: Planning And External Readiness

- [x] Write approved design spec.
  - File: `docs/superpowers/specs/2026-06-14-api-first-morpheus-bs-design.md`
  - Commit: `690e5157c`
- [x] Write master implementation plan.
  - File: `docs/superpowers/plans/2026-06-14-api-first-morpheus-bs.md`
  - Commit: `e673657ae`
- [x] Validate MorpheusCore public API with the local service.
  - Evidence: `GET /health` returned healthy, `POST /api/v1/sessions` returned
    `201`, and direct SSE returned `text_delta` plus `done`.
- [x] Fix MorpheusCore local-profile route behavior.
  - External file:
    `G:/Projects/MetronX/MorpheusCore/packages/server-app/src/server-routes/coordination-routes.ts`
  - External commit: `54c93406`
  - Evidence: `nodetool-canvas` display name now streams successfully and
    `forward_to_frontend` is available in the live tool policy.

### Phase 1: API-First Model Surface

- [x] **Task 1: Protocol types for Morpheus and custom endpoints**
  - Create: `packages/protocol/src/api-schemas/custom-model-endpoints.ts`
  - Modify: `packages/protocol/src/agent-protocol.ts`
  - Modify: `packages/protocol/src/api-schemas/index.ts`
  - Modify if needed: `packages/protocol/src/api-types.ts`
  - Test: `packages/protocol/tests/custom-model-endpoints.test.ts`
  - Verify:
    - `rtk npm run test --workspace=packages/protocol -- custom-model-endpoints`
    - `rtk npm run lint --workspace=packages/protocol`
    - `rtk npm run test --workspace=packages/protocol`
    - `rtk npm run typecheck`
    - `rtk npm run lint`
  - Commit target: `feat(protocol): add custom endpoint agent protocol`
  - Commit: `fc330214a`
  - Notes:
    - `rtk npm run test` was attempted after this task but is blocked on
      Windows before tests start because the web workspace script uses
      `TZ=UTC jest --forceExit`.
    - Root lint exits `0` with pre-existing React hook and curly warnings.
- [x] **Task 2: API-first model surface guard**
  - Create: `packages/websocket/src/model-surface.ts`
  - Test: `packages/websocket/tests/model-surface.test.ts`
  - Verify:
    - `rtk npm run test --workspace=packages/websocket -- model-surface`
    - `rtk npm run lint --workspace=packages/websocket`
    - `rtk npm run typecheck`
    - `rtk npm run lint`
  - Commit target: `feat(server): add api-first model surface guard`
  - Commit: `49f932d6a`
  - Notes:
    - `rtk npm run test` was attempted after this task and is still blocked on
      Windows before tests start because the web workspace script uses
      `TZ=UTC jest --forceExit`.
    - Root lint exits `0` with pre-existing React hook and curly warnings.
- [x] **Task 3: Apply model surface to server model APIs**
  - Modify: `packages/websocket/src/trpc/routers/models.ts`
  - Modify: `packages/websocket/src/models-api.ts`
  - Test: existing and new websocket model API tests.
  - Verify:
    - `rtk npm run test --workspace=packages/websocket -- models`
    - `rtk npm run typecheck --workspace=packages/websocket`
  - Commit target: `feat(server): hide local model surface by default`
  - Commit: `7d7079f4c`
  - Verify:
    - `rtk npm run test --workspace=packages/websocket -- models`
    - `rtk npm run test --workspace=packages/websocket -- model-surface trpc-models models-api-surface trpc-http`
    - `rtk npm run lint --workspace=packages/websocket`
    - `rtk npm run typecheck`
    - `rtk npm run lint`
  - Notes:
    - `rtk npm run test --workspace=packages/websocket` was attempted. Task 3
      related tests pass, but the full package suite still has unrelated
      Windows path/fixture failures in `trpc-mcp-config`, `trpc-skills`, and
      `trpc-workspace`.
    - `rtk npm run test` remains blocked before tests start because the web
      workspace script uses `TZ=UTC jest --forceExit` on Windows.

### Phase 2: Custom Compatible Endpoint Runtime

- [ ] **Task 4: Persist custom endpoint metadata and secrets**
  - Create: `packages/websocket/src/custom-model-endpoints.ts`
  - Create: `packages/websocket/src/trpc/routers/custom-model-endpoints.ts`
  - Modify: `packages/websocket/src/trpc/router.ts`
  - Test: `packages/websocket/tests/custom-model-endpoints.test.ts`
  - Verify:
    - `rtk npm run test --workspace=packages/websocket -- custom-model-endpoints`
  - Commit target: `feat(server): persist custom model endpoints`
- [ ] **Task 5: Resolve custom endpoints as runtime providers**
  - Create: `packages/websocket/src/custom-provider-resolver.ts`
  - Modify: `packages/websocket/src/plugins/websocket.ts`
  - Modify if needed: `packages/websocket/src/openai-api.ts`
  - Test: `packages/websocket/tests/custom-provider-resolver.test.ts`
  - Verify:
    - `rtk npm run test --workspace=packages/websocket -- custom-provider-resolver`
    - `rtk npm run typecheck --workspace=packages/websocket`
  - Commit target: `feat(server): resolve custom model providers`

### Phase 3: Morpheus Agent Provider

- [ ] **Task 6: MorpheusCore client and event mapping**
  - Create: `packages/websocket/src/agent/morpheus-client.ts`
  - Test: `packages/websocket/tests/morpheus-client.test.ts`
  - Verify:
    - `rtk npm run test --workspace=packages/websocket -- morpheus-client`
  - Commit target: `feat(agent): add morpheus stream client`
- [ ] **Task 7: Morpheus provider behind `/ws/agent`**
  - Create: `packages/websocket/src/agent/morpheus-agent.ts`
  - Modify: `packages/websocket/src/agent/sdk-provider.ts`
  - Modify: `packages/websocket/src/agent/agent-runtime.ts`
  - Modify: `packages/websocket/src/agent/types.ts`
  - Test: `packages/websocket/tests/morpheus-agent.test.ts`
  - Verify:
    - `rtk npm run test --workspace=packages/websocket -- morpheus-agent`
    - `rtk npm run typecheck --workspace=packages/websocket`
  - Live smoke:
    - Use `MORPHEUS_BASE_URL=http://localhost:3000` and a masked
      `MORPHEUS_API_KEY`.
    - Confirm `/ws/agent` creates a Morpheus session and receives SSE deltas.
  - Commit target: `feat(agent): add morpheus provider`

### Phase 4: Frontend Generic Agent Surface

- [ ] **Task 8: Generic agent store and composer controls**
  - Create: `web/src/stores/chatAgent.ts`
  - Create: `web/src/components/chat/composer/AgentComposerControls.tsx`
  - Modify: `web/src/stores/chatPi.ts`
  - Modify: `web/src/stores/GlobalChatStore.ts`
  - Modify: `web/src/components/chat/composer/PiComposerControls.tsx`
  - Test: `web/src/stores/__tests__/chatAgent.test.ts`
  - Verify:
    - `rtk npm test --workspace=web -- chatAgent`
    - `rtk npm run typecheck --workspace=web`
  - Commit target: `refactor(web): generalize chat agent store`

### Phase 5: MorpheusCore Profile And Canvas Policy

- [x] **Task 9A: Live MorpheusCore canvas route readiness**
  - External commit: `54c93406`
  - Evidence: live route accepts `nodetool-canvas` and loads only
    `skill_loader`, `execute_skill_script`, `question`, and
    `forward_to_frontend`.
- [ ] **Task 9B: Keep MorpheusCore profile/skill artifacts documented**
  - External files:
    - `G:/Projects/MetronX/MorpheusCore/config/profiles/nodetool-canvas/BASE.md`
    - `G:/Projects/MetronX/MorpheusCore/config/skills/nodetool-canvas/SKILL.md`
    - `G:/Projects/MetronX/MorpheusCore/config/agents/nodetool-canvas.yaml`
  - Verify:
    - Run the MorpheusCore config/profile validation command used by that repo.
    - Repeat one live `forward_to_frontend` smoke after NodeTool Task 7 lands.
  - Commit target in MorpheusCore if needed:
    `feat(agent): add nodetool canvas profile`

### Phase 6: Deployment And Desktop Direction

- [ ] **Task 10: Deployment docs and acceptance tests**
  - Create: `docs/deployment/api-first-bs.md`
  - Modify: `docs/deployment-e2e-guide.md`
  - Verify:
    - `rtk npm run typecheck`
    - `rtk npm run lint`
    - `rtk npm run test`
  - Commit target: `docs: document api-first bs deployment`
- [ ] **Thin desktop shell follow-up plan**
  - Document how the desktop app points at a remote NodeTool server.
  - Keep native filesystem/model connectors out of the default B/S path.
  - Create a separate implementation plan before editing Electron code.

---

## Current Workspace Notes

- `packages/websocket/tests/trpc-models.test.ts` is currently modified before
  Task 1 starts. Inspect and preserve it before editing model API tests.
- `.codegraph/` is currently untracked local index data. Do not commit it.

---

## Update Log

### 2026-06-14

- Added this progress tracker.
- Marked design spec and implementation plan as complete.
- Marked MorpheusCore local-profile route fix and live API smoke as complete.
- Completed Task 1 and recorded commit `fc330214a`.
- Completed Task 2 and recorded commit `49f932d6a`.
- Completed Task 3 and recorded commit `7d7079f4c`.
- Set next active task to Phase 2, Task 4.
