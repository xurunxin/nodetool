import React from "react";
import { useTranslation } from "react-i18next";
import type { SxProps, Theme } from "@mui/material/styles";
import { RefreshButton } from "../../ui_primitives";

interface ResetButtonProps {
  onClick: () => void;
  disabled?: boolean;
  tooltip?: string;
  sx?: SxProps<Theme>;
}

export const ResetButton: React.FC<ResetButtonProps> = ({
  onClick,
  disabled,
  tooltip,
  sx
}) => {
  const { t } = useTranslation("chat");

  return (
    <RefreshButton
      onClick={onClick}
      disabled={disabled}
      tooltip={tooltip ?? t("resetChatHistory")}
      iconVariant="reset"
      buttonSize="medium"
      nodrag={false}
      sx={{
        p: 2,
        mt: 2,
        ...sx
      }}
    />
  );
};
