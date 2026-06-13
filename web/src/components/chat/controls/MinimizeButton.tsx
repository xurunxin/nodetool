import React from "react";
import { useTranslation } from "react-i18next";
import MinimizeIcon from "@mui/icons-material/Minimize";
import { ToolbarIconButton } from "../../ui_primitives";
import type { SxProps, Theme } from "@mui/material/styles";

interface MinimizeButtonProps {
  onClick: () => void;
  isMinimized: boolean;
  sx?: SxProps<Theme>;
}

export const MinimizeButton: React.FC<MinimizeButtonProps> = ({
  onClick,
  isMinimized,
  sx
}) => {
  const { t } = useTranslation("chat");

  return (
    <ToolbarIconButton
      icon={isMinimized ? <></> : <MinimizeIcon fontSize="small" />}
      tooltip={isMinimized ? t("expand") : t("minimize")}
      onClick={onClick}
      nodrag={false}
      sx={{
        color: "text.secondary",
        "&:hover": {
          backgroundColor: "action.hover"
        },
        ...sx
      }}
    />
  );
};
