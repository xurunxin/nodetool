# Chinese Localization Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a sustainable Web i18n foundation and migrate the first high-traffic UI surfaces so the `cn` branch opens with a usable `zh-CN` main interface.

**Architecture:** Use `i18next` plus `react-i18next` with bundled local resources, `zh-CN` as the default language, and `en` as fallback. Mount the provider at the Web root, expose a non-React helper for store/utility text, and migrate Phase 1 strings namespace by namespace without changing backend or workflow protocols.

**Tech Stack:** React, TypeScript, Vite, i18next, react-i18next, Jest + React Testing Library, npm workspaces.

**Spec:** `docs/superpowers/specs/2026-06-12-chinese-localization-design.md`

---

## Scope Check

This plan implements Phase 1 only: Web i18n infrastructure plus first main-UI localization slices. Electron shell text, node metadata, package manifests, generated model metadata, backend errors, and documentation fragments get separate plans after Phase 1 lands.

Keep `.codegraph/` uncommitted throughout this work.

## File Structure

**Create**
- `web/src/i18n/languages.ts` — language, namespace, and fallback constants.
- `web/src/i18n/locales/en.ts` — English fallback resource.
- `web/src/i18n/locales/zhCN.ts` — Simplified Chinese default resource.
- `web/src/i18n/resources.ts` — resource map exported to i18next.
- `web/src/i18n/index.ts` — i18next initialization and non-React `translate` helper.
- `web/src/i18n/__tests__/i18n.test.ts` — default language, fallback, interpolation, and missing-key tests.
- `web/src/i18n/__tests__/testUtils.tsx` — React test wrapper with `I18nextProvider` and theme.
- `web/scripts/check-ui-english-residual.mjs` — English residual reporting script for Phase 1 scans.
- `web/src/components/chat/composer/__tests__/MessageInput.i18n.test.tsx`
- `web/src/components/chat/thread/__tests__/NewChatButton.i18n.test.tsx`
- `web/src/components/workspace/__tests__/WorkspaceShell.i18n.test.tsx`
- `web/src/components/assets/__tests__/AssetSearchInput.i18n.test.tsx`

**Modify**
- `web/package.json` — add `i18next`, `react-i18next`, and `scan:i18n`.
- `package-lock.json` — npm workspace lockfile update.
- `web/src/index.tsx` — import i18n, mount `I18nextProvider`, and localize startup/loading/error copy.
- `web/src/components/Login.tsx` — localize marketing line.
- `web/src/components/workspace/WorkspaceShell.tsx` — localize empty workspace text.
- `web/src/components/chat/composer/MessageInput.tsx` — localize default input hint and aria label.
- `web/src/components/chat/thread/NewChatButton.tsx` — localize label and tooltip.
- `web/src/components/assets/AssetSearchInput.tsx` — localize search hint, aria labels, and search-mode tooltips.
- `web/src/components/assets/AssetDeleteConfirmation.tsx` — localize delete dialog title/body/actions.

---

## Stage 1 — Dependency Impact and Installation

### Task 1: Measure baseline and add i18n dependencies

**Files:**
- Modify: `web/package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Capture baseline dependency state**

Run:

```bash
rtk npm ls i18next react-i18next --workspace=web
```

Expected: command exits non-zero or reports both packages missing from the `web` workspace.

- [ ] **Step 2: Capture baseline Web build output**

Run:

```bash
rtk npm run build --workspace=web
```

Expected: build passes and prints Vite output chunk sizes. Save the final output in the implementation notes or PR description.

- [ ] **Step 3: Install runtime dependencies**

Run:

```bash
rtk npm install i18next react-i18next --workspace=web
```

Expected: `web/package.json` gains `i18next` and `react-i18next` under `dependencies`, and `package-lock.json` changes.

- [ ] **Step 4: Measure post-install Web build output**

Run:

```bash
rtk npm run build --workspace=web
```

Expected: build passes. Compare the Vite output against Step 2 and record the added size in the PR notes. If the added initial JS is unexpectedly large, stop and inspect the dependency tree before continuing:

```bash
rtk npm ls i18next react-i18next --workspace=web
```

- [ ] **Step 5: Commit**

```bash
rtk git add web/package.json package-lock.json
rtk git commit -m "chore(web): add i18n dependencies"
```

---

## Stage 2 — i18n Core

### Task 2: Add language constants and resource files

**Files:**
- Create: `web/src/i18n/languages.ts`
- Create: `web/src/i18n/locales/en.ts`
- Create: `web/src/i18n/locales/zhCN.ts`
- Create: `web/src/i18n/resources.ts`

- [ ] **Step 1: Create `languages.ts`**

```ts
export const DEFAULT_LANGUAGE = "zh-CN" as const;
export const FALLBACK_LANGUAGE = "en" as const;

export const SUPPORTED_LANGUAGES = [DEFAULT_LANGUAGE, FALLBACK_LANGUAGE] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const DEFAULT_NAMESPACE = "common" as const;

export const NAMESPACES = [
  "common",
  "startup",
  "login",
  "workspace",
  "navigation",
  "workflows",
  "assets",
  "models",
  "chat",
  "settings",
  "errors"
] as const;

export type TranslationNamespace = (typeof NAMESPACES)[number];
```

- [ ] **Step 2: Create `locales/en.ts`**

```ts
export const en = {
  common: {
    cancel: "Cancel",
    delete: "Delete",
    refreshPage: "Refresh Page",
    search: "Search"
  },
  startup: {
    loadingNodeTool: "Loading NodeTool...",
    preparingWorkspace: "Preparing workspace...",
    metadataLoadError: "Error loading application metadata."
  },
  login: {
    tagline: "Node-based AI for text, image, audio & video."
  },
  workspace: {
    empty: "No tabs open - use + to open or create a document."
  },
  navigation: {},
  workflows: {},
  assets: {
    searchAll: "Search all assets",
    searchAllHint: "Search all assets...",
    searchCurrentFolder: "Search current folder",
    searchCurrentFolderHint: "Search current folder...",
    switchToLocalSearch: "Switch to local search",
    switchToGlobalSearch: "Switch to global search",
    clearSearch: "Clear asset search",
    deletePreparing: "Preparing to delete...",
    rootFolderCannotDelete: "Warning: The root folder cannot be deleted.",
    deleteFolderContaining_one: "Delete folder containing {{count}} file?",
    deleteFolderContaining_other: "Delete folder containing {{count}} files?",
    deleteFoldersAndFiles_one:
      "Delete {{folderCount}} folder and {{fileCount}} file containing {{itemCount}} item?",
    deleteFoldersAndFiles_other:
      "Delete {{folderCount}} folders and {{fileCount}} files containing {{itemCount}} items?",
    deleteFiles_one: "Delete {{count}} file?",
    deleteFiles_other: "Delete {{count}} files?",
    deleteTip:
      "You can right click selected assets and download them before deleting."
  },
  models: {},
  chat: {
    newChat: "New Chat",
    startNewChat: "Start a new chat",
    messageInput: "Type your message..."
  },
  settings: {},
  errors: {}
} as const;

export type LocaleResource = typeof en;
```

- [ ] **Step 3: Create `locales/zhCN.ts`**

```ts
import type { LocaleResource } from "./en";

export const zhCN: LocaleResource = {
  common: {
    cancel: "取消",
    delete: "删除",
    refreshPage: "刷新页面",
    search: "搜索"
  },
  startup: {
    loadingNodeTool: "正在加载 NodeTool...",
    preparingWorkspace: "正在准备工作区 Workspace...",
    metadataLoadError: "应用元数据加载失败。"
  },
  login: {
    tagline: "面向文本、图像、音频和视频的节点式 AI。"
  },
  workspace: {
    empty: "当前没有打开的标签页 - 使用 + 打开或创建文档。"
  },
  navigation: {},
  workflows: {},
  assets: {
    searchAll: "搜索所有资产 Asset",
    searchAllHint: "搜索所有资产 Asset...",
    searchCurrentFolder: "搜索当前文件夹",
    searchCurrentFolderHint: "搜索当前文件夹...",
    switchToLocalSearch: "切换到当前文件夹搜索",
    switchToGlobalSearch: "切换到全局资产搜索",
    clearSearch: "清除资产搜索",
    deletePreparing: "正在准备删除...",
    rootFolderCannotDelete: "警告：根文件夹不能删除。",
    deleteFolderContaining_one: "删除包含 {{count}} 个文件的文件夹？",
    deleteFolderContaining_other: "删除包含 {{count}} 个文件的文件夹？",
    deleteFoldersAndFiles_one:
      "删除 {{folderCount}} 个文件夹和 {{fileCount}} 个文件，其中包含 {{itemCount}} 个项目？",
    deleteFoldersAndFiles_other:
      "删除 {{folderCount}} 个文件夹和 {{fileCount}} 个文件，其中包含 {{itemCount}} 个项目？",
    deleteFiles_one: "删除 {{count}} 个文件？",
    deleteFiles_other: "删除 {{count}} 个文件？",
    deleteTip: "删除前可以右键选中的资产 Asset 并下载备份。"
  },
  models: {},
  chat: {
    newChat: "新建聊天 Chat",
    startNewChat: "开始新的聊天 Chat",
    messageInput: "输入消息..."
  },
  settings: {},
  errors: {}
};
```

- [ ] **Step 4: Create `resources.ts`**

```ts
import { DEFAULT_LANGUAGE, FALLBACK_LANGUAGE } from "./languages";
import { en } from "./locales/en";
import { zhCN } from "./locales/zhCN";

export const resources = {
  [DEFAULT_LANGUAGE]: zhCN,
  [FALLBACK_LANGUAGE]: en
} as const;
```

- [ ] **Step 5: Commit**

```bash
rtk git add web/src/i18n/languages.ts web/src/i18n/locales/en.ts web/src/i18n/locales/zhCN.ts web/src/i18n/resources.ts
rtk git commit -m "feat(web): add initial i18n resources"
```

### Task 3: Add i18next initialization and tests

**Files:**
- Create: `web/src/i18n/index.ts`
- Create: `web/src/i18n/__tests__/i18n.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import i18n, {
  DEFAULT_LANGUAGE,
  FALLBACK_LANGUAGE,
  translate
} from "../index";

describe("web i18n", () => {
  it("defaults to zh-CN", () => {
    expect(i18n.language).toBe(DEFAULT_LANGUAGE);
  });

  it("translates bundled zh-CN resources", () => {
    expect(translate("common:refreshPage")).toBe("刷新页面");
  });

  it("falls back to English resources", async () => {
    await i18n.changeLanguage(FALLBACK_LANGUAGE);
    expect(translate("common:refreshPage")).toBe("Refresh Page");
    await i18n.changeLanguage(DEFAULT_LANGUAGE);
  });

  it("interpolates named parameters", () => {
    expect(translate("assets:deleteFiles", { count: 3 })).toBe("删除 3 个文件？");
  });

  it("returns the key for missing translations", () => {
    expect(translate("common:notARealKey")).toBe("notARealKey");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
rtk npm test --workspace=web -- src/i18n/__tests__/i18n.test.ts
```

Expected: FAIL with `Cannot find module '../index'`.

- [ ] **Step 3: Create `index.ts`**

```ts
import i18n, { type TOptions } from "i18next";
import { initReactI18next } from "react-i18next";

import {
  DEFAULT_LANGUAGE,
  FALLBACK_LANGUAGE,
  DEFAULT_NAMESPACE,
  NAMESPACES
} from "./languages";
import { resources } from "./resources";

export {
  DEFAULT_LANGUAGE,
  FALLBACK_LANGUAGE,
  DEFAULT_NAMESPACE,
  NAMESPACES
} from "./languages";
export type { SupportedLanguage, TranslationNamespace } from "./languages";

const isDev =
  typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    lng: DEFAULT_LANGUAGE,
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: [DEFAULT_LANGUAGE, FALLBACK_LANGUAGE],
    ns: [...NAMESPACES],
    defaultNS: DEFAULT_NAMESPACE,
    fallbackNS: DEFAULT_NAMESPACE,
    resources,
    debug: isDev,
    initAsync: false,
    returnNull: false,
    saveMissing: isDev,
    missingKeyHandler: (_lngs, ns, key) => {
      if (isDev) {
        console.warn(`[i18n] Missing translation: ${ns}:${key}`);
      }
    },
    interpolation: {
      escapeValue: false
    },
    react: {
      useSuspense: false
    }
  });
}

export const translate = (
  key: string,
  options?: TOptions
): string => i18n.t(key, options);

export default i18n;
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
rtk npm test --workspace=web -- src/i18n/__tests__/i18n.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
rtk git add web/src/i18n/index.ts web/src/i18n/__tests__/i18n.test.ts
rtk git commit -m "feat(web): initialize i18next"
```

### Task 4: Add i18n-aware React test utility

**Files:**
- Create: `web/src/i18n/__tests__/testUtils.tsx`

- [ ] **Step 1: Create the test utility**

```tsx
import React from "react";
import { render, type RenderResult } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { I18nextProvider } from "react-i18next";

import mockTheme from "../../__mocks__/themeMock";
import i18n from "../index";

export const renderWithI18n = (ui: React.ReactElement): RenderResult => {
  return render(
    <I18nextProvider i18n={i18n}>
      <ThemeProvider theme={mockTheme}>{ui}</ThemeProvider>
    </I18nextProvider>
  );
};
```

- [ ] **Step 2: Run typecheck for the new utility**

Run:

```bash
rtk npm run typecheck --workspace=web
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
rtk git add web/src/i18n/__tests__/testUtils.tsx
rtk git commit -m "test(web): add i18n render helper"
```

---

## Stage 3 — Root Provider and Startup Text

### Task 5: Mount i18n at the Web root and localize startup states

**Files:**
- Modify: `web/src/index.tsx`

- [ ] **Step 1: Add imports**

Add near the existing React/router imports:

```tsx
import { I18nextProvider, useTranslation } from "react-i18next";
import i18n from "./i18n";
```

- [ ] **Step 2: Split the translatable content under the provider**

Replace the existing `AppWrapper` component with an outer provider wrapper and an inner content component. Keep all existing state/effects inside `AppContent`:

```tsx
const AppWrapper = () => (
  <React.StrictMode>
    <I18nextProvider i18n={i18n}>
      <AppContent />
    </I18nextProvider>
  </React.StrictMode>
);

const AppContent = () => {
  const { t } = useTranslation(["startup", "common"]);
  const [status, setStatus] = useState<string>("pending");
  const authState = useAuth((s) => s.state);

  // keep the existing AppWrapper body here, starting at isDevTestRoute
  // and ending at the current return statement's provider tree.
```

Then remove the old `<React.StrictMode>` wrapper from the returned JSX inside `AppContent`. The `return` inside `AppContent` should now start with:

```tsx
  return (
    <TRPCProvider>
      <InitColorSchemeScript attribute="class" defaultMode="dark" />
      <ThemeProvider theme={ThemeNodetool} defaultMode="dark">
```

and end with:

```tsx
      </ThemeProvider>
    </TRPCProvider>
  );
};
```

- [ ] **Step 3: Replace root startup strings**

In `web/src/index.tsx`, replace the startup strings exactly:

```tsx
aria-label={t("startup:loadingNodeTool")}
```

```tsx
{t("startup:loadingNodeTool")}
```

```tsx
{t("startup:metadataLoadError")}
```

```tsx
{t("common:refreshPage")}
```

```tsx
aria-label={t("startup:preparingWorkspace")}
```

```tsx
{t("startup:preparingWorkspace")}
```

- [ ] **Step 4: Run focused verification**

Run:

```bash
rtk npm run typecheck --workspace=web
```

Expected: PASS. If TypeScript reports that `AppContent` is used before definition, move the `AppWrapper` definition below `AppContent` and keep the same JSX.

- [ ] **Step 5: Commit**

```bash
rtk git add web/src/index.tsx
rtk git commit -m "feat(web): mount i18n provider"
```

---

## Stage 4 — First High-Traffic UI Slice

### Task 6: Localize login, workspace empty state, and chat entry controls

**Files:**
- Modify: `web/src/components/Login.tsx`
- Modify: `web/src/components/workspace/WorkspaceShell.tsx`
- Modify: `web/src/components/chat/composer/MessageInput.tsx`
- Modify: `web/src/components/chat/thread/NewChatButton.tsx`
- Test: `web/src/components/chat/composer/__tests__/MessageInput.i18n.test.tsx`
- Test: `web/src/components/chat/thread/__tests__/NewChatButton.i18n.test.tsx`
- Test: `web/src/components/workspace/__tests__/WorkspaceShell.i18n.test.tsx`

- [ ] **Step 1: Write focused tests**

`web/src/components/chat/composer/__tests__/MessageInput.i18n.test.tsx`:

```tsx
import React from "react";
import { screen } from "@testing-library/react";

import { renderWithI18n } from "../../../../i18n/__tests__/testUtils";
import { MessageInput } from "../MessageInput";

describe("MessageInput i18n", () => {
  it("uses the localized default input hint", () => {
    renderWithI18n(
      <MessageInput
        value=""
        onChange={jest.fn()}
        onKeyDown={jest.fn()}
        disabled={false}
      />
    );

    expect(screen.getByLabelText("输入消息...")).toBeInTheDocument();
  });
});
```

`web/src/components/chat/thread/__tests__/NewChatButton.i18n.test.tsx`:

```tsx
import React from "react";
import { screen } from "@testing-library/react";

import { renderWithI18n } from "../../../../i18n/__tests__/testUtils";
import { NewChatButton } from "../NewChatButton";

describe("NewChatButton i18n", () => {
  it("renders the localized new chat label", () => {
    renderWithI18n(<NewChatButton onNewThread={jest.fn()} />);

    expect(screen.getByText("新建聊天 Chat")).toBeInTheDocument();
  });
});
```

`web/src/components/workspace/__tests__/WorkspaceShell.i18n.test.tsx`:

```tsx
import React from "react";
import { screen } from "@testing-library/react";

import { renderWithI18n } from "../../../i18n/__tests__/testUtils";
import WorkspaceShell from "../WorkspaceShell";

jest.mock("../../../stores/WorkspaceTabsStore", () => ({
  useWorkspaceTabsStore: (selector: (state: unknown) => unknown) =>
    selector({ tabs: [], activeTabId: null, setTitle: jest.fn() })
}));

jest.mock("../../../contexts/WorkflowManagerContext", () => ({
  useWorkflowManager: (selector: (state: unknown) => unknown) =>
    selector({
      setCurrentWorkflowId: jest.fn(),
      openWorkflows: []
    })
}));

jest.mock("../../../hooks/useWorkspaceMenuShortcuts", () => ({
  useWorkspaceMenuShortcuts: jest.fn()
}));

jest.mock("../../panels/PanelLeft", () => () => null);
jest.mock("../../panels/PanelRight", () => () => null);
jest.mock("../../panels/PanelBottom", () => () => null);
jest.mock("../../node_editor/Alert", () => () => null);
jest.mock("../WorkspaceTabBar", () => () => null);
jest.mock("../TabContent", () => () => null);

describe("WorkspaceShell i18n", () => {
  it("renders the localized empty workspace message", () => {
    renderWithI18n(<WorkspaceShell />);

    expect(
      screen.getByText("当前没有打开的标签页 - 使用 + 打开或创建文档。")
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run:

```bash
rtk npm test --workspace=web -- src/components/chat/composer/__tests__/MessageInput.i18n.test.tsx src/components/chat/thread/__tests__/NewChatButton.i18n.test.tsx src/components/workspace/__tests__/WorkspaceShell.i18n.test.tsx
```

Expected: FAIL because components still render English literals.

- [ ] **Step 3: Localize `Login.tsx`**

Add import:

```tsx
import { useTranslation } from "react-i18next";
```

Inside `Login`:

```tsx
const { t } = useTranslation("login");
```

Replace the heading body:

```tsx
<Text component="h3">{t("tagline")}</Text>
```

- [ ] **Step 4: Localize `WorkspaceShell.tsx`**

Add import:

```tsx
import { useTranslation } from "react-i18next";
```

Inside `WorkspaceShell`:

```tsx
const { t } = useTranslation("workspace");
```

Replace the empty text:

```tsx
<Caption color="secondary">{t("empty")}</Caption>
```

- [ ] **Step 5: Localize `MessageInput.tsx`**

Add import:

```tsx
import { useTranslation } from "react-i18next";
```

Change the destructuring so `placeholder` defaults in the body instead of the parameter:

```tsx
{
  value,
  onChange,
  onKeyDown,
  disabled,
  placeholder
},
ref
```

Inside the component body:

```tsx
const { t } = useTranslation("chat");
const effectivePlaceholder = placeholder ?? t("messageInput");
```

Replace `aria-label={placeholder}` and `placeholder={placeholder}` with:

```tsx
aria-label={effectivePlaceholder}
placeholder={effectivePlaceholder}
```

- [ ] **Step 6: Localize `NewChatButton.tsx`**

Add import:

```tsx
import { useTranslation } from "react-i18next";
```

Inside `NewChatButton`:

```tsx
const { t } = useTranslation("chat");
```

Replace props:

```tsx
label={t("newChat")}
tooltip={t("startNewChat")}
```

- [ ] **Step 7: Run tests to verify they pass**

Run:

```bash
rtk npm test --workspace=web -- src/components/chat/composer/__tests__/MessageInput.i18n.test.tsx src/components/chat/thread/__tests__/NewChatButton.i18n.test.tsx src/components/workspace/__tests__/WorkspaceShell.i18n.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
rtk git add web/src/components/Login.tsx web/src/components/workspace/WorkspaceShell.tsx web/src/components/chat/composer/MessageInput.tsx web/src/components/chat/thread/NewChatButton.tsx web/src/components/chat/composer/__tests__/MessageInput.i18n.test.tsx web/src/components/chat/thread/__tests__/NewChatButton.i18n.test.tsx web/src/components/workspace/__tests__/WorkspaceShell.i18n.test.tsx
rtk git commit -m "feat(web): localize initial main UI slice"
```

### Task 7: Localize representative asset UI controls

**Files:**
- Modify: `web/src/components/assets/AssetSearchInput.tsx`
- Modify: `web/src/components/assets/AssetDeleteConfirmation.tsx`
- Test: `web/src/components/assets/__tests__/AssetSearchInput.i18n.test.tsx`

- [ ] **Step 1: Write focused search input test**

```tsx
import React from "react";
import { screen } from "@testing-library/react";

import { renderWithI18n } from "../../../i18n/__tests__/testUtils";
import AssetSearchInput from "../AssetSearchInput";

jest.mock("../../../stores/KeyPressedStore", () => ({
  useKeyPressedStore: () => false
}));

jest.mock("../../../stores/AssetGridStore", () => ({
  useAssetGridStore: (selector: (state: unknown) => unknown) =>
    selector({
      isGlobalSearchMode: false,
      setIsGlobalSearchMode: jest.fn(),
      setGlobalSearchResults: jest.fn(),
      setIsGlobalSearchActive: jest.fn(),
      setGlobalSearchQuery: jest.fn()
    })
}));

jest.mock("../../../serverState/useAssetSearch", () => ({
  useAssetSearch: () => ({
    searchAssets: jest.fn(),
    isSearching: false
  })
}));

describe("AssetSearchInput i18n", () => {
  it("renders localized local-search text", () => {
    renderWithI18n(<AssetSearchInput onLocalSearchChange={jest.fn()} />);

    expect(screen.getByLabelText("搜索当前文件夹")).toBeInTheDocument();
    expect(screen.getByTestId("asset-search-input-field")).toHaveAttribute(
      "placeholder",
      "搜索当前文件夹..."
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
rtk npm test --workspace=web -- src/components/assets/__tests__/AssetSearchInput.i18n.test.tsx
```

Expected: FAIL because the component still renders English search text.

- [ ] **Step 3: Localize `AssetSearchInput.tsx`**

Add import:

```tsx
import { useTranslation } from "react-i18next";
```

Inside `AssetSearchInput`:

```tsx
const { t } = useTranslation("assets");
```

Replace the dynamic hint:

```tsx
const effectivePlaceholder = isGlobalSearchMode
  ? t("searchAllHint")
  : t("searchCurrentFolderHint");
const searchAriaLabel = isGlobalSearchMode
  ? t("searchAll")
  : t("searchCurrentFolder");
```

Replace tooltip title:

```tsx
title={
  isGlobalSearchMode
    ? t("switchToLocalSearch")
    : t("switchToGlobalSearch")
}
```

Replace input aria label:

```tsx
aria-label={searchAriaLabel}
```

Add an accessible label to the clear button:

```tsx
aria-label={t("clearSearch")}
```

- [ ] **Step 4: Localize `AssetDeleteConfirmation.tsx`**

Add import:

```tsx
import { useTranslation } from "react-i18next";
```

Inside `AssetDeleteConfirmation`:

```tsx
const { t } = useTranslation(["assets", "common"]);
```

Replace `getDialogTitle` with:

```tsx
const getDialogTitle = () => {
  if (isAssetTreeLoading && folderCount > 0) {
    return t("assets:deletePreparing");
  }
  if (showRootFolderWarning) {
    return t("assets:rootFolderCannotDelete");
  }
  if (folderCount === 1 && fileCount === 0) {
    return t("assets:deleteFolderContaining", {
      count: Math.max(totalAssets - 1, 0)
    });
  }
  if (folderCount > 0) {
    return t("assets:deleteFoldersAndFiles", {
      count: folderCount,
      folderCount,
      fileCount,
      itemCount: totalAssets
    });
  }
  return t("assets:deleteFiles", { count: fileCount });
};
```

Replace the body text:

```tsx
{t("assets:deleteTip")}
```

Replace action labels:

```tsx
confirmText={t("common:delete")}
cancelText={t("common:cancel")}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
rtk npm test --workspace=web -- src/components/assets/__tests__/AssetSearchInput.i18n.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Run typecheck for asset dialog changes**

Run:

```bash
rtk npm run typecheck --workspace=web
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
rtk git add web/src/components/assets/AssetSearchInput.tsx web/src/components/assets/AssetDeleteConfirmation.tsx web/src/components/assets/__tests__/AssetSearchInput.i18n.test.tsx
rtk git commit -m "feat(web): localize core asset controls"
```

---

## Stage 5 — Scan Support and Phase 1 Migration Checklist

### Task 8: Add English residual scan script

**Files:**
- Create: `web/scripts/check-ui-english-residual.mjs`
- Modify: `web/package.json`

- [ ] **Step 1: Create scan script**

```js
import fs from "node:fs";
import path from "node:path";

const root = path.resolve("src");
const ignoredPathParts = [
  `${path.sep}__tests__${path.sep}`,
  `${path.sep}i18n${path.sep}locales${path.sep}`,
  `${path.sep}api.ts`
];

const allowedTerms = new Set([
  "NodeTool",
  "Workflow",
  "Node",
  "Model",
  "Asset",
  "Workspace",
  "Chat",
  "Provider",
  "API",
  "JSON",
  "URL",
  "HTTP",
  "WebSocket",
  "OpenAI",
  "Anthropic",
  "HuggingFace",
  "Replicate",
  "StabilityAI"
]);

const stringLiteralPattern = /(["'`])([^"'`]*[A-Za-z][^"'`]*)\1/g;

const walk = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(full);
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) {
      return [];
    }
    return [full];
  });
};

const isIgnored = (file) =>
  ignoredPathParts.some((part) => file.includes(part));

const hasNonAllowedEnglish = (text) => {
  const words = text.match(/[A-Za-z][A-Za-z-]*/g) ?? [];
  return words.some((word) => !allowedTerms.has(word));
};

const findings = [];

for (const file of walk(root)) {
  if (isIgnored(file)) {
    continue;
  }
  const source = fs.readFileSync(file, "utf8");
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const match of line.matchAll(stringLiteralPattern)) {
      const value = match[2];
      if (value.length < 4) {
        continue;
      }
      if (hasNonAllowedEnglish(value)) {
        findings.push(`${file}:${index + 1}: ${value}`);
      }
    }
  }
}

if (findings.length > 0) {
  console.log(findings.join("\n"));
  console.log(`\nEnglish residual candidates: ${findings.length}`);
} else {
  console.log("No English residual candidates found.");
}
```

- [ ] **Step 2: Add script to `web/package.json`**

Add under `scripts`:

```json
"scan:i18n": "node scripts/check-ui-english-residual.mjs"
```

- [ ] **Step 3: Run the scanner**

Run:

```bash
rtk npm run scan:i18n --workspace=web
```

Expected: command exits 0 and prints a report. The report may list many candidates at this stage; use it as a migration guide, not as a failing quality gate.

- [ ] **Step 4: Commit**

```bash
rtk git add web/scripts/check-ui-english-residual.mjs web/package.json
rtk git commit -m "chore(web): add i18n residual scan"
```

### Task 9: Migrate Phase 1 remaining high-traffic files

**Files:**
- Modify: `web/src/components/panels/AppHeader.tsx`
- Modify: `web/src/components/panels/PanelLeft.tsx`
- Modify: `web/src/components/workspace/WorkspaceTabBar.tsx`
- Modify: `web/src/components/workflows/ExampleGrid.tsx`
- Modify: `web/src/components/hugging_face/model_list/ModelsPage.tsx`
- Modify: `web/src/components/menus/SettingsMenu.tsx`
- Modify: `web/src/components/chat/containers/GlobalChat.tsx`
- Modify: `web/src/i18n/locales/en.ts`
- Modify: `web/src/i18n/locales/zhCN.ts`

- [ ] **Step 1: Generate current candidate list**

Run:

```bash
rtk npm run scan:i18n --workspace=web
```

Expected: report includes English literals in Phase 1 files. Copy the relevant lines for the files listed above into the implementation notes.

- [ ] **Step 2: Add Phase 1 keys to resources**

Extend `en.ts` and `zhCN.ts` with the exact keys below. Empty namespaces created in Task 2 become populated:

```ts
// en.ts additions
navigation: {
  workspace: "Workspace",
  assets: "Assets",
  models: "Models",
  chat: "Chat",
  settings: "Settings"
},
workflows: {
  templates: "Templates",
  newWorkflow: "New Workflow",
  run: "Run",
  save: "Save"
},
models: {
  title: "Models",
  localModels: "Local Models",
  downloadManager: "Download Manager"
},
settings: {
  title: "Settings",
  language: "Language"
}
```

```ts
// zhCN.ts additions
navigation: {
  workspace: "工作区 Workspace",
  assets: "资产 Asset",
  models: "模型 Model",
  chat: "聊天 Chat",
  settings: "设置"
},
workflows: {
  templates: "模板",
  newWorkflow: "新建工作流 Workflow",
  run: "运行",
  save: "保存"
},
models: {
  title: "模型 Model",
  localModels: "本地模型 Model",
  downloadManager: "下载管理"
},
settings: {
  title: "设置",
  language: "语言 Language"
}
```

- [ ] **Step 3: Migrate each listed component with the same pattern**

For each file listed in this task, add the relevant import:

```tsx
import { useTranslation } from "react-i18next";
```

Inside the component body, use the namespace that owns the text:

```tsx
const { t } = useTranslation("navigation");
```

or multiple namespaces:

```tsx
const { t } = useTranslation(["navigation", "workflows", "models", "settings"]);
```

Replace visible text, tooltip text, input hint text, and `aria-label` strings with `t(...)`. Examples:

```tsx
{t("navigation:assets")}
```

```tsx
tooltip={t("navigation:settings")}
```

```tsx
aria-label={t("workflows:newWorkflow")}
```

- [ ] **Step 4: Run scanner and focused checks**

Run:

```bash
rtk npm run scan:i18n --workspace=web
rtk npm run typecheck --workspace=web
```

Expected: typecheck passes. The scan still prints candidates outside Phase 1 and allowed technical anchors inside Phase 1.

- [ ] **Step 5: Commit**

```bash
rtk git add web/src/components/panels/AppHeader.tsx web/src/components/panels/PanelLeft.tsx web/src/components/workspace/WorkspaceTabBar.tsx web/src/components/workflows/ExampleGrid.tsx web/src/components/hugging_face/model_list/ModelsPage.tsx web/src/components/menus/SettingsMenu.tsx web/src/components/chat/containers/GlobalChat.tsx web/src/i18n/locales/en.ts web/src/i18n/locales/zhCN.ts
rtk git commit -m "feat(web): localize phase 1 navigation surfaces"
```

---

## Stage 6 — Final Verification

### Task 10: Run required checks and document results

**Files:**
- Modify only if verification exposes a real defect in files already touched by this plan.

- [ ] **Step 1: Run Web focused checks**

```bash
rtk npm run typecheck --workspace=web
rtk npm run lint --workspace=web
rtk npm test --workspace=web
```

Expected: all pass.

- [ ] **Step 2: Run root mandatory checks**

```bash
rtk npm run typecheck
rtk npm run lint
rtk npm run test
```

Expected: all pass. If a pre-existing unrelated failure appears, capture the exact command and failure summary in the final handoff.

- [ ] **Step 3: Manual smoke check**

Run the Web dev server:

```bash
rtk npm run dev --workspace=web
```

Open the app and verify these visible texts are Chinese by default:

- startup loading: `正在加载 NodeTool...`
- startup workspace suspense: `正在准备工作区 Workspace...`
- workspace empty state: `当前没有打开的标签页 - 使用 + 打开或创建文档。`
- chat input hint: `输入消息...`
- new chat button: `新建聊天 Chat`
- asset local search hint: `搜索当前文件夹...`
- asset global/local search toggle tooltips are Chinese.
- delete asset confirmation action buttons show `删除` and `取消`.

- [ ] **Step 4: Commit verification fixes**

If Step 1 or Step 2 required code fixes, commit them:

```bash
rtk git add -A
rtk git commit -m "fix(web): stabilize phase 1 localization checks"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review Notes

- **Spec coverage:** This plan covers dependency evaluation, Web i18n infrastructure, `zh-CN` default language, `en` fallback, non-React `translate`, root provider mounting, missing-key behavior, interpolation tests, startup copy, first high-traffic Web slices, residual scanning, and final verification.
- **Out of Phase 1:** Electron shell, node metadata, backend/API error localization, package manifests, and generated templates are deliberately excluded and need separate plans.
- **Type consistency:** `DEFAULT_LANGUAGE`, `FALLBACK_LANGUAGE`, `NAMESPACES`, `resources`, `translate`, `useTranslation`, and namespace keys are used consistently across tasks.
- **Dependency docs used:** Current Context7 documentation for `/i18next/i18next` and `/i18next/react-i18next` confirms `initReactI18next`, `I18nextProvider`, `useTranslation`, `Trans`, `resources`, `lng`, `fallbackLng`, namespaces, interpolation, and missing-key handling patterns.
