/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Popover } from "../ui_primitives";
import NotificationsIcon from "@mui/icons-material/Notifications";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useTheme } from "@mui/material/styles";
import { CopyButton, Text, Caption, NotificationBadge, ToolbarIconButton, Box, MOTION } from "../ui_primitives";
import { useShallow } from "zustand/react/shallow";

const popoverStyles = css({
  paddingRight: "4em",
  marginTop: "2em",
  "& .copy-button": {
    position: "absolute",
    opacity: 0.8,
    top: "5px",
    right: "0px"
  }
});

const NotificationButton: React.FC = React.memo(() => {
  const { t } = useTranslation(["navigation", "common"]);
  const [notificationAnchor, setNotificationAnchor] =
    useState<null | HTMLElement>(null);
  const { notifications, lastDisplayedTimestamp, updateLastDisplayedTimestamp } =
    useNotificationStore(
      useShallow((state) => ({
        notifications: state.notifications,
        lastDisplayedTimestamp: state.lastDisplayedTimestamp,
        updateLastDisplayedTimestamp: state.updateLastDisplayedTimestamp
      }))
    );
  const theme = useTheme();
  const unreadCount = useMemo(() => {
    if (!lastDisplayedTimestamp) {return notifications.length;}
    return notifications.filter((n) => n.timestamp > lastDisplayedTimestamp)
      .length;
  }, [notifications, lastDisplayedTimestamp]);
  const buttonLabel =
    unreadCount === 0
      ? t("notificationsNoUnread")
      : t("notificationsUnread", { count: unreadCount });

  const handleNotificationClick = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      setNotificationAnchor(event.currentTarget);
      updateLastDisplayedTimestamp(new Date());
    },
    [updateLastDisplayedTimestamp]
  );

  const handleNotificationClose = useCallback(() => {
    setNotificationAnchor(null);
  }, []);

  return (
    <div className="notifications-container">
      <NotificationBadge
        count={unreadCount}
        color="secondary"
        dot
        tooltip={t("notifications")}
        ariaLabel={buttonLabel}
      >
        <ToolbarIconButton
          className="notification-button command-button command-icon"
          icon={<NotificationsIcon className="notification-icon" />}
          tooltip=""
          onClick={handleNotificationClick}
          ariaLabel={buttonLabel}
        />
      </NotificationBadge>
      <Popover
        css={popoverStyles}
        className="notification-popover"
        open={Boolean(notificationAnchor)}
        anchorEl={notificationAnchor}
        onClose={handleNotificationClose}
        placement="bottom-right"
        paperSx={{
          backdropFilter: "blur(8px)",
          backgroundColor: `${theme.vars.palette.grey[900]}E6`,
          boxShadow: "0 16px 64px rgba(0, 0, 0, 0.4)",
          border: `1px solid ${theme.vars.palette.grey[800]}`
        }}
      >
        <Box
          className="notification-container"
          role="region"
          aria-label={t("notifications")}
          sx={{
            p: 3,
            width: "600px",
            maxHeight: "600px",
            overflow: "auto",
            "&::-webkit-scrollbar": {
              width: "6px"
            },
            "&::-webkit-scrollbar-thumb": {
              backgroundColor: theme.vars.palette.grey[600],
              borderRadius: "var(--rounded-sm)"
            }
          }}
        >
          {notifications.length === 0 ? (
            <Text
              className="notification-empty-message"
              color="secondary"
              role="status"
              aria-live="polite"
              sx={{ fontSize: "var(--fontSizeNormal)" }}
              weight={400}
            >
              {t("noNotifications")}
            </Text>
          ) : (
            <Box
              role="list"
              aria-label={t("notificationList", {
                count: notifications.length
              })}
            >
              {notifications.map((notification) => (
                <Box
                  key={notification.id}
                  role="listitem"
                  className={`notification-item notification-type-${notification.type}`}
                  aria-label={`${notification.type} notification: ${notification.content}`}
                  sx={{
                    p: 2,
                    mb: 1.5,
                    borderRadius: 1.5,
                    maxHeight: "100px",
                    overflow: "auto",
                    backgroundColor: `${theme.vars.palette.grey[800]}CC`,
                    borderLeft: `3px solid ${
                      notification.type === "error"
                        ? theme.vars.palette.error.main
                        : notification.type === "warning"
                        ? theme.vars.palette.warning.main
                        : notification.type === "success"
                        ? theme.vars.palette.success.main
                        : notification.type === "info"
                        ? theme.vars.palette.info.main
                        : theme.vars.palette.grey[600]
                    }`,
                    transition: MOTION.all,
                    position: "relative",
                    "&:hover": {
                      backgroundColor: theme.vars.palette.grey[800]
                    }
                  }}
                >
                <Text
                  size="small"
                  className="notification-content"
                  sx={{
                    lineHeight: 1.5,
                    wordWrap: "break-word",
                    pr: 3
                  }}
                >
                  {notification.content}
                </Text>
                  <Caption
                    className="notification-timestamp"
                    sx={{
                      display: "block",
                      mt: 0.5
                    }}
                  >
                    {notification.timestamp.toLocaleString()}
                  </Caption>
                  <CopyButton
                    value={notification.content}
                    className="copy-button"
                    tooltip={t("common:copyToClipboard")}
                  />
                </Box>
              ))}
            </Box>
          )}
        </Box>
      </Popover>
    </div>
  );
});

NotificationButton.displayName = "NotificationButton";

export default NotificationButton;
