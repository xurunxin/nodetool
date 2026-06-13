/** @jsxImportSource @emotion/react */
import React from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import { createStyles } from "./EmptyThreadList.styles";
import { EmptyState } from "../../ui_primitives/EmptyState";

export const EmptyThreadList: React.FC = () => {
  const { t } = useTranslation("chat");
  const theme = useTheme();
  return (
    <li css={createStyles(theme)}>
      <EmptyState
        variant="empty"
        title={t("noConversationsYet")}
        description={t("startConversationDescription")}
        size="small"
      />
    </li>
  );
};
