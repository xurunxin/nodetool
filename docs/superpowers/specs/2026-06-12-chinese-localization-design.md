# Chinese Localization Design

## Summary

The `cn` branch will become the Chinese-localized version of NodeTool. The
long-term goal is comprehensive localization across the product, but execution
will be phased so the first implementation produces a usable Chinese Web UI
without blocking on every package, manifest, and Electron surface.

The localization architecture will use `i18next` with `react-i18next` as the
target solution. The first implementation plan must still measure and document
the dependency and bundle impact before committing to the added runtime cost.
If that cost is unacceptable, the fallback is a lightweight in-repo translation
helper with a compatible `t(key, params)` shape so a later migration remains
tractable.

## Goals

- Default the Chinese branch UI to simplified Chinese (`zh-CN`).
- Keep English fallback resources available for maintenance and missing keys.
- Preserve key product and technical terms with English anchors where useful,
  such as "Workflow", "Node", "Model", "Asset", and "Workspace".
- Establish a reusable i18n structure before migrating large numbers of
  hardcoded UI strings.
- Deliver a first phase that makes the main Web UI usable in Chinese.
- Support later phases for deeper editor UI, Electron shell text, node metadata,
  backend-facing user errors, templates, and package-provided descriptions.

## Non-Goals

- Do not translate user-generated content, workflow names, model names, asset
  filenames, logs produced by external tools, or API payload values.
- Do not redesign UI layout as part of localization, except for small fixes
  needed when Chinese strings expose overflow or truncation issues.
- Do not change WebSocket, REST, TRPC, or workflow runtime protocols.
- Do not make full language switching UI a required first-phase deliverable.
- Do not attempt to localize all node manifests and package metadata in the
  first phase.

## Current Project Context

The main Web application entry point is `web/src/index.tsx`. It builds the
router, loads metadata, and renders the provider stack around the routed
application. The current root includes `TRPCProvider`, `InitColorSchemeScript`,
`ThemeProvider`, `CssBaseline`, `MobileClassProvider`, `MenuProvider`,
`WorkflowManagerProvider`, `KeyboardProvider`, suspense fallbacks, and global
dialogs.

There is no existing React UI localization framework in the Web app. Repository
searches for i18n-related terms mostly find node functionality, `localeCompare`,
or content-localization model metadata rather than a UI translation layer.

The Web UI surface is large. CodeGraph indexed more than one thousand TSX files
under `web/src`, with major user-facing areas under components such as
workspace, workflows, assets, model menus, chat, settings, timeline, sketch,
editor panels, context menus, dialogs, and node/property inspectors.

Frontend work must follow the repo's primitives-first and design-token rules:
avoid raw MUI imports in component files, keep typography to the sanctioned
styles, use existing UI primitives, and avoid hardcoded spacing, color, motion,
radius, and z-index values when touching UI files.

## Architecture

Add a Web localization module under `web/src/i18n/`. It owns:

- i18next initialization.
- resource registration for `zh-CN` and `en`.
- default language selection.
- namespace conventions.
- missing-key behavior.
- any non-React helpers needed by stores, utilities, or module-level code.

Mount `I18nextProvider` near the root of `web/src/index.tsx`, outside the
routed application and global loading/error states. It should wrap the existing
application providers so all route components, suspense fallbacks, global
dialogs, startup states, and protected routes can use translations.

The first phase should keep language initialization synchronous if resources are
bundled locally. If later phases split translation resources by route or
namespace, lazy loading can be introduced behind the same module boundary.

## Resource Structure

Use feature namespaces rather than one global file. First-phase namespaces:

- `common`: buttons, generic actions, states, shared labels.
- `navigation`: app navigation, panel titles, breadcrumbs, tabs.
- `workspace`: workspace shell, tabs, empty states.
- `workflows`: workflow lists, editor actions, run/save/version text.
- `assets`: asset explorer, upload, folders, search, confirmations.
- `models`: model pages, provider labels, download manager.
- `chat`: chat composer, threads, permissions, agent states.
- `settings`: settings labels, preferences, account/local settings.
- `errors`: common user-facing error and retry messages.

English resources should remain available as fallback and as semantic reference
for translators. Chinese resources are the default for the `cn` branch.

Example shape:

```ts
export const resources = {
  "zh-CN": {
    common: {
      save: "保存",
      cancel: "取消",
      refreshPage: "刷新页面"
    },
    workflows: {
      newWorkflow: "新建工作流 Workflow"
    }
  },
  en: {
    common: {
      save: "Save",
      cancel: "Cancel",
      refreshPage: "Refresh Page"
    },
    workflows: {
      newWorkflow: "New Workflow"
    }
  }
} as const;
```

## Component Usage

React components should use `useTranslation(namespace)` or `<Trans>` for
user-visible text. Migrated text includes:

- visible labels and copy.
- button text.
- input hint text.
- dialog titles and body text.
- tooltip text.
- toast and alert content.
- empty states.
- `aria-label` and other accessibility text.
- suspense/loading messages.

Component code should not introduce new raw English UI strings after the i18n
layer exists. Tests may still use English fixture content when testing data,
but UI assertions for localized components should prefer roles and accessible
labels over implementation details.

For non-component code, provide a small helper from `web/src/i18n/` that can
translate without React hooks. This is for stores, utility modules, error
normalization, and command definitions that need user-facing text.

## Terminology

The default style is simplified Chinese with selected English anchors for core
terms. The implementation plan should add an explicit glossary before migration
begins. Initial glossary:

| English | Chinese UI Form |
| --- | --- |
| Workflow | 工作流 Workflow |
| Node | 节点 Node |
| Model | 模型 Model |
| Asset | 资产 Asset |
| Workspace | 工作区 Workspace |
| Chat | 聊天 Chat |
| Provider | 提供方 Provider |
| API | API |
| JSON | JSON |
| WebSocket | WebSocket |

Short controls should prefer concise Chinese. Longer explanatory copy may use
Chinese plus the English anchor when the term is central to user recognition.

## Phased Rollout

### Phase 1: Main Web UI

Deliver a usable Chinese main Web UI. Cover startup loading/error states,
navigation, workspace shell, common workflow list/editor actions, asset
browser, models page, chat surfaces, settings, common confirmations, toasts,
and user-facing error messages encountered on these paths.

This phase also establishes the i18n module, resource conventions, missing-key
behavior, dependency/bundle evaluation, and representative tests.

### Phase 2: Deep Editor and Creation Tools

Cover denser and more specialized Web UI: node menu, property panel, context
menus, keyboard shortcut help, timeline, sketch/image editor, audio/video/3D
viewers, cost dashboard, templates, collections, and secondary dialogs.

This phase should pay special attention to layout because Chinese copy may
change width expectations in dense panels.

### Phase 3: Non-Main-Web Surfaces and Metadata

Cover Electron shell text, desktop menu/update/tray surfaces, IPC-facing
messages, backend/API user-facing errors, node names and descriptions, node
property descriptions, package manifests, example templates, and user-facing
documentation fragments.

Node metadata needs its own design because the text may originate in packages,
manifests, generated files, or runtime metadata instead of React component
source.

### Phase 4: Quality Closure

Add missing-key scanning, English-residual scanning with a technical-term
allowlist, glossary cleanup, screenshot review, and targeted e2e coverage for
critical flows.

## Missing Keys and Fallbacks

Development builds should warn on missing keys. Production builds should avoid
crashes and fall back to English or the key string when necessary.

Interpolation must use named parameters:

```ts
t("assets.deleteConfirm", { name: asset.name })
```

Dates, numbers, prices, and credits should continue using `Intl` or existing
formatting helpers. Later phases should align those helpers with the active
i18n language instead of relying on browser defaults.

## Dependency Evaluation

Before implementation commits to `i18next` and `react-i18next`, measure and
record:

- added dependencies and transitive dependency size.
- production bundle impact for the Web app.
- whether resources can be tree-shaken or split by namespace.
- whether the library introduces any security or maintenance concerns.
- comparison against the lightweight in-repo fallback.

Expected recommendation: use the mature library if bundle and dependency impact
is modest, because comprehensive localization benefits from namespaces,
fallbacks, interpolation, `<Trans>`, and future language switching.

## Testing and Verification

First-phase implementation should add tests that verify:

- i18n initializes with `zh-CN` as the default language.
- English fallback works.
- interpolation works.
- missing keys do not crash rendering.
- at least one representative migrated component renders localized accessible
  text.

Repository verification after implementation should include:

```bash
npm run typecheck
npm run lint
npm run test
```

UI verification should include smoke testing the startup state, workspace,
workflow editor, assets, models, chat, settings, and common dialogs. Review
Chinese copy for clipping, overflow, awkward truncation, and broken accessible
labels.

English residual scans are useful but should not require zero English in the
first phase because technical anchors such as NodeTool, Workflow, Node, Model,
API, JSON, URL, HTTP, and WebSocket are intentionally retained.

## Acceptance Criteria

- The `cn` branch defaults the main Web UI to `zh-CN`.
- First-phase surfaces use i18n resources for migrated user-visible text.
- English fallback resources exist for migrated namespaces.
- New component UI strings introduced during migration do not bypass i18n.
- The main Web UI remains usable with Chinese strings and no obvious layout
  breakage in the primary flows.
- The dependency and bundle impact of `i18next` and `react-i18next` is measured
  or explicitly documented before implementation proceeds.
- Standard typecheck, lint, and test commands pass, or any blocker is recorded
  with exact failure output and next action.

## Implementation Planning Notes

The implementation plan should start with the infrastructure slice, then migrate
one representative vertical path end to end before broadening. A practical first
slice is:

1. Add dependencies after dependency impact review.
2. Create `web/src/i18n/` initialization and resources.
3. Mount the provider in `web/src/index.tsx`.
4. Localize startup loading/error states and common actions.
5. Migrate one high-traffic route, such as workspace navigation plus the common
   workflow/asset shell.
6. Add tests and scanning helpers.
7. Expand within Phase 1 surfaces in small commits.

Keep `.codegraph/` local and uncommitted. It is an index artifact, not a source
or design artifact.
