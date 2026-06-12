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
