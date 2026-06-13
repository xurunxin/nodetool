import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { FlexColumn, FlexRow, Text } from "../../ui_primitives";
import type { Message } from "../../../stores/ApiTypes";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import { deriveThreadStats } from "../thread/deriveThreadStats";
import { formatDuration } from "../../../utils/formatUtils";
import { getLocalizedThreadTitle } from "../utils/threadUtils";

interface ConversationHeaderProps {
  messages: Message[];
}

function formatClockTime(dateStr: string): string | null {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function formatSpend(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <FlexRow gap={0.5} align="baseline" sx={{ minWidth: 0 }}>
    <Text component="span" size="smaller" sx={{ color: "text.disabled" }}>
      {label}
    </Text>
    <Text component="span" size="smaller" truncate sx={{ color: "text.secondary" }}>
      {value}
    </Text>
  </FlexRow>
);

const ConversationHeaderBase: React.FC<ConversationHeaderProps> = ({ messages }) => {
  const { t } = useTranslation("chat");
  const title = useGlobalChatStore((s) =>
    s.currentThreadId ? s.threads[s.currentThreadId]?.title ?? null : null
  );

  const stats = useMemo(() => deriveThreadStats(messages), [messages]);

  const runtimeLabel =
    stats.runtimeMs != null ? formatDuration(stats.runtimeMs) : null;
  const lastRunLabel = stats.lastRunAt ? formatClockTime(stats.lastRunAt) : null;
  const spendLabel = stats.spend != null ? formatSpend(stats.spend) : null;
  const displayTitle = title
    ? getLocalizedThreadTitle(title, t("newConversation"))
    : null;

  const hasStats =
    !!stats.model ||
    !!stats.provider ||
    !!runtimeLabel ||
    !!spendLabel ||
    !!lastRunLabel;

  if (!displayTitle && !hasStats) {
    return null;
  }

  return (
    <FlexColumn
      gap={0.5}
      className="conversation-header"
      sx={{
        flexShrink: 0,
        // Clear the floating sidebar toggle and "Back to editor" controls
        // that overlay the top of the chat.
        mt: 6,
        px: 0.5,
        pb: 1.5,
        mb: 1,
        borderBottom: 1,
        borderColor: "divider"
      }}
    >
      {displayTitle && (
        <Text size="big" weight={500} truncate sx={{ color: "text.primary" }}>
          {displayTitle}
        </Text>
      )}
      {hasStats && (
        <FlexRow gap={2} align="center" wrap sx={{ minWidth: 0 }}>
          {stats.model && <Stat label={t("headerModel")} value={stats.model} />}
          {stats.provider && (
            <Stat label={t("headerProvider")} value={stats.provider} />
          )}
          {runtimeLabel && <Stat label={t("headerRuntime")} value={runtimeLabel} />}
          {spendLabel && <Stat label={t("headerSpend")} value={spendLabel} />}
          {lastRunLabel && <Stat label={t("headerLastRun")} value={lastRunLabel} />}
        </FlexRow>
      )}
    </FlexColumn>
  );
};

export const ConversationHeader = React.memo(ConversationHeaderBase);
ConversationHeader.displayName = "ConversationHeader";
