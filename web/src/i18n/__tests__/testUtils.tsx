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
