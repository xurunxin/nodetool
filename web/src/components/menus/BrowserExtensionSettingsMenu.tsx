/** @jsxImportSource @emotion/react */
import { memo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@mui/material/styles";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import FolderOpenIcon from "@mui/icons-material/FolderOpen";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import DownloadIcon from "@mui/icons-material/Download";
import { Text, FlexRow, FlexColumn, NavButton, Chip } from "../ui_primitives";
import { getSharedSettingsStyles } from "./sharedSettingsStyles";
import { useNotificationStore } from "../../stores/NotificationStore";
import { trpcClient } from "../../trpc/client";
import { BASE_URL } from "../../stores/BASE_URL";
import { useTranslation } from "react-i18next";

const CHROME_EXTENSIONS_URL = "chrome://extensions";

async function fetchExtensionStatus() {
  return trpcClient.extension.status.query();
}

async function copyText(text: string): Promise<void> {
  if (window.api?.clipboard?.writeText) {
    await window.api.clipboard.writeText(text);
    return;
  }
  await navigator.clipboard.writeText(text);
}

const STEP_KEYS: readonly string[] = [
  "browserExtensionStepDownload",
  "browserExtensionStepOpenChromeExtensions",
  "browserExtensionStepEnableDeveloperMode",
  "browserExtensionStepLoadUnpacked",
  "browserExtensionStepAttachTab"
];

const BrowserExtensionSettingsMenu = () => {
  const { t } = useTranslation("settings");
  const theme = useTheme();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  const { data, isLoading } = useQuery({
    queryKey: ["extension-status"],
    queryFn: fetchExtensionStatus,
    refetchInterval: 3000,
    refetchOnWindowFocus: true
  });

  const connected = data?.connected ?? false;
  const distPath = data?.distPath ?? "";
  const distExists = data?.distExists ?? false;
  const canReveal = Boolean(distExists && window.api?.showItemInFolder);
  const downloadUrl = `${BASE_URL}/api/extension/download`;

  const handleReveal = useCallback(() => {
    if (distPath && window.api?.showItemInFolder) {
      void window.api.showItemInFolder(distPath);
    }
  }, [distPath]);

  const handleCopy = useCallback(
    async (text: string, what: string) => {
      try {
        await copyText(text);
        addNotification({
          type: "success",
          alert: true,
          content: t("copiedItem", { item: what })
        });
      } catch {
        addNotification({
          type: "error",
          alert: true,
          content: t("couldNotCopyItem", { item: what })
        });
      }
    },
    [addNotification, t]
  );

  return (
    <div
      className="remote-settings-content"
      css={getSharedSettingsStyles(theme)}
    >
      <div className="settings-main-content">
        <Text className="description" sx={{ mb: 1 }}>
          {t("browserExtensionDescriptionPrefix")}{" "}
          <strong>{t("nodetoolBrowserExtension")}</strong>{" "}
          {t("browserExtensionDescriptionMiddle")}{" "}
          <strong>{t("liveBrowserAgent")}</strong>{" "}
          {t("browserExtensionDescriptionSuffix")}
        </Text>

        <FlexRow gap={1} sx={{ alignItems: "center", mb: 1 }}>
          <Chip
            icon={
              connected ? (
                <CheckCircleIcon fontSize="small" />
              ) : (
                <RadioButtonUncheckedIcon fontSize="small" />
              )
            }
            label={
              isLoading
                ? t("checking")
                : connected
                  ? t("extensionConnected")
                  : t("notConnected")
            }
            color={connected ? "success" : "default"}
          />
          {!connected && !isLoading && (
            <Text size="small" sx={{ opacity: 0.7 }}>
              {t("installAttachExtensionHint")}
            </Text>
          )}
        </FlexRow>

        <FlexColumn gap={0.5} sx={{ mb: 1.5 }}>
          {STEP_KEYS.map((stepKey, i) => (
            <Text key={i} size="small">
              {i + 1}. {t(stepKey)}
            </Text>
          ))}
        </FlexColumn>

        <FlexRow gap={1} sx={{ flexWrap: "wrap" }}>
          <NavButton
            icon={<DownloadIcon />}
            label={t("downloadExtension")}
            color="primary"
            onClick={() => window.open(downloadUrl, "_blank")}
            navSize="small"
            sx={{ padding: "0.25em 1em", minWidth: "unset" }}
          />
          {canReveal ? (
            <NavButton
              icon={<FolderOpenIcon />}
              label={t("revealBuildFolder")}
              onClick={handleReveal}
              navSize="small"
              sx={{ padding: "0.25em 1em", minWidth: "unset" }}
            />
          ) : (
            distExists && (
              <NavButton
                icon={<ContentCopyIcon />}
                label={t("copyBuildPath")}
                onClick={() => handleCopy(distPath, t("buildPath"))}
                navSize="small"
                sx={{ padding: "0.25em 1em", minWidth: "unset" }}
              />
            )
          )}
          <NavButton
            icon={<ContentCopyIcon />}
            label={t("copyChromeExtensions")}
            onClick={() => handleCopy(CHROME_EXTENSIONS_URL, CHROME_EXTENSIONS_URL)}
            navSize="small"
            sx={{ padding: "0.25em 1em", minWidth: "unset" }}
          />
        </FlexRow>

        {distExists && (
          <Text
            size="small"
            sx={{
              mt: 1,
              fontFamily: "monospace",
              opacity: 0.7,
              wordBreak: "break-all"
            }}
          >
            {distPath}
          </Text>
        )}
      </div>
    </div>
  );
};

export default memo(BrowserExtensionSettingsMenu);
