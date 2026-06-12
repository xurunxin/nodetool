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
