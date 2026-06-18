# China Media Providers Test Report

Date: 2026-06-18
Branch: `codex/china-media-providers`
Worktree: `G:\Projects\nodetool\.worktrees\china-media-providers`

## Scope

Verified the China-region direct media provider implementation for:

- DashScope / Wanxiang image generation, image editing, and image-to-video.
- Volcengine Ark / Seedream image generation and editing.
- Volcengine Ark / Seedance text-to-video and image-to-video.
- Kling confirmed image-to-video endpoint.
- Shared prompt resource handling for `@alias` references, including Chinese aliases.
- Runtime provider capability advertisement for implemented media methods only.

## Passed Checks

- `rtk npm run build:packages`
  - Passed: 57 package builds.
- `rtk npm run build --workspace=web`
  - Passed. This specifically verifies the browser worker no longer fails on China media helpers or decorator node sources.
- `rtk npm run lint`
  - Passed with existing warnings in unrelated web/mobile files.
- `rtk git diff --check`
  - Passed.
- `rtk npm test --workspace=packages/nodes-utils -- china-media.test.ts`
  - Passed: 16 tests.
- `rtk npm test --workspace=packages/runtime -- china-media-providers.test.ts`
  - Passed: 11 tests.
- `rtk npm test --workspace=@nodetool-ai/dashscope-nodes`
  - Passed: 26 tests.
- `rtk npm test --workspace=@nodetool-ai/volcengine-nodes`
  - Passed: 23 tests.
- `rtk npm test --workspace=@nodetool-ai/kling-nodes`
  - Passed: 9 tests.

## Reviewed Fixes

- Removed root `nodetool-dev` package export entries from the three new decorator-based node packages so web typecheck does not parse node source decorators.
- Kept China media helpers available through `@nodetool-ai/nodes-utils/china-media` while keeping the top-level `@nodetool-ai/nodes-utils` browser-safe.
- Removed top-level Node builtin imports from `china-media.ts`; DNS lookup is loaded lazily inside provider media download validation.
- Changed missing `@resource` prompt references from silent pass-through to an explicit error.
- Added Chinese alias support for prompt references such as `@主图`.
- Removed the visible Seedance `Generate Audio` property and stopped sending `generate_audio` in Volcengine node requests for this media-only release.

## Known Repository-Level Blockers

- `rtk npm run typecheck`
  - Web and Electron typecheck pass.
  - Mobile typecheck fails because mobile dependencies/types are not installed or not available in this worktree, including `expo`, `react-native`, `@react-navigation/*`, `@expo/vector-icons`, and related React Native test libraries. It also reports pre-existing mobile implicit-any errors.
- `rtk npm run test`
  - Fails at `web` test startup on Windows because the script uses POSIX inline environment syntax: `TZ=UTC jest --forceExit`.

## Result

The China media provider implementation passes package-level build/test coverage, web build, lint, and runtime capability checks. Remaining root-level failures are outside this implementation's touched surface and are documented above.
