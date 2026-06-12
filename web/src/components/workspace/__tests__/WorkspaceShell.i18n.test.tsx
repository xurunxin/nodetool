import React from "react";
import { act, screen } from "@testing-library/react";

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
  it("renders the localized empty workspace message", async () => {
    await act(async () => {
      renderWithI18n(<WorkspaceShell />);
    });

    expect(
      screen.getByText("当前没有打开的标签页 - 使用 + 打开或创建文档。")
    ).toBeInTheDocument();
  });
});
