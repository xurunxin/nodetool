import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import { ChatHeader } from "../containers/ChatHeader";
import isEqual from "fast-deep-equal";

interface ChatControlsProps {
  onMinimize: () => void;
  onReset: () => void;
  isMinimized: boolean;
}

const ChatControls: React.FC<ChatControlsProps> = ({
  onMinimize,
  onReset,
  isMinimized
}) => {
  const { t } = useTranslation("chat");
  return (
    <ChatHeader
      isMinimized={isMinimized}
      onMinimize={onMinimize}
      onReset={onReset}
      title={t("chat")}
      icon={<ChatBubbleOutlineIcon sx={{ fontSize: "1.5em" }} />}
    />
  );
};

export default memo(ChatControls, isEqual);
