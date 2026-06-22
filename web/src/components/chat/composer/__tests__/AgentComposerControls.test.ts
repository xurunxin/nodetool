import { getSelectableAgentProviders } from "../agentProviderOptions";

describe("AgentComposerControls provider availability", () => {
  it("hides Pi when workspace selection is unavailable and no workspace is persisted", () => {
    expect(getSelectableAgentProviders(false, false)).toEqual([
      "morpheus",
      "llm"
    ]);
  });

  it("keeps Pi selectable when workspace selection is available", () => {
    expect(getSelectableAgentProviders(true, false)).toContain("pi");
  });

  it("keeps Pi selectable when a workspace is already persisted", () => {
    expect(getSelectableAgentProviders(false, true)).toContain("pi");
  });
});
