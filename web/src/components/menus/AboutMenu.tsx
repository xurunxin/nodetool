/** @jsxImportSource @emotion/react */
import React, { useState, useEffect, useCallback, memo } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CancelIcon from "@mui/icons-material/Cancel";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { VERSION } from "../../config/constants";
import { isElectron, isProduction } from "../../lib/env";
import { useNotificationStore } from "../../stores/NotificationStore";
import { FlexRow, FlexColumn, Text, Caption, LoadingSpinner, Chip, Box } from "../ui_primitives";

// Note: This interface mirrors the SystemInfo type from window.d.ts
// We use a local copy to avoid type export complexity
interface SystemInfoData {
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  os: string;
  osVersion: string;
  arch: string;
  installPath: string;
  condaEnvPath: string;
  dataPath: string;
  logsPath: string;
  optionalNodePath: string;
  pythonVersion: string | null;
  cudaAvailable: boolean;
  cudaVersion: string | null;
  ollamaInstalled: boolean;
  ollamaVersion: string | null;
  llamaServerInstalled: boolean;
  llamaServerVersion: string | null;
}

const InfoRow: React.FC<{
  label: string;
  value: string | null;
  copyable?: boolean;
  onCopy?: (value: string) => void;
}> = memo(({ label, value, copyable = false, onCopy }) => {
  const theme = useTheme();

  const handleCopy = () => {
    if (value && onCopy) {
      onCopy(value);
    }
  };

  return (
    <FlexRow
      justify="space-between"
      align="flex-start"
      sx={{
        padding: "0.5em 0",
        borderBottom: `1px solid ${theme.vars.palette.divider}`,
        "&:last-child": {
          borderBottom: "none"
        }
      }}
    >
      <Caption
        sx={{
          minWidth: "140px",
          flexShrink: 0
        }}
      >
        {label}
      </Caption>
      <FlexRow
        gap={2}
        align="center"
        sx={{
          flex: 1,
          justifyContent: "flex-end",
          textAlign: "right"
        }}
      >
        <Text
          size="small"
          sx={{
            wordBreak: "break-all",
            fontFamily: "monospace"
          }}
        >
          {value || "N/A"}
        </Text>
        {copyable && value && (
          <ContentCopyIcon
            sx={{
              fontSize: "1em",
              cursor: "pointer",
              opacity: 0.6,
              "&:hover": {
                opacity: 1
              }
            }}
            onClick={handleCopy}
          />
        )}
      </FlexRow>
    </FlexRow>
  );
});
InfoRow.displayName = "InfoRow";

const FeatureStatus: React.FC<{
  label: string;
  available: boolean;
  version?: string | null;
}> = memo(({ label, available, version }) => {
  const theme = useTheme();
  const { t } = useTranslation("settings");

  return (
    <FlexRow
      justify="space-between"
      align="center"
      sx={{
        padding: "0.5em 0",
        borderBottom: `1px solid ${theme.vars.palette.divider}`,
        "&:last-child": {
          borderBottom: "none"
        }
      }}
    >
      <Text color="secondary">
        {label}
      </Text>
      <FlexRow align="center" gap={1}>
        {available ? (
          <>
            <Chip
              icon={<CheckCircleIcon />}
              label={version || t("aboutAvailable")}
              size="small"
              color="success"
              variant="outlined"
              sx={{ fontFamily: "monospace" }}
            />
          </>
        ) : (
          <Chip
            icon={<CancelIcon />}
            label={t("aboutNotAvailable")}
            size="small"
            color="default"
            variant="outlined"
          />
        )}
      </FlexRow>
    </FlexRow>
  );
});
FeatureStatus.displayName = "FeatureStatus";

const AboutMenu: React.FC = memo(() => {
  const { t } = useTranslation(["settings", "common"]);
  const [systemInfo, setSystemInfo] = useState<SystemInfoData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  useEffect(() => {
    const fetchSystemInfo = async () => {
      if (!isElectron) {
        // In web browser, just show basic info
        setSystemInfo(null);
        setLoading(false);
        return;
      }

      try {
        const info = await window.api?.settings?.getSystemInfo();
        setSystemInfo(info ?? null);
      } catch (err) {
        setError(t("settings:aboutSystemInfoLoadFailed"));
        console.error("Failed to fetch system info:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSystemInfo();
  }, [t]);

  const handleCopy = useCallback(async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      addNotification({
        type: "info",
        alert: true,
        content: t("common:copiedToClipboard")
      });
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
      addNotification({
        type: "error",
        alert: true,
        content: t("common:failedToCopyToClipboard")
      });
    }
  }, [addNotification, t]);

  const handleCopyAll = useCallback(async () => {
    if (!systemInfo) {
      return;
    }

    const text = `NodeTool System Information
=============================
Version: ${VERSION}
${systemInfo.electronVersion ? `Electron: ${systemInfo.electronVersion}` : ""}
${systemInfo.chromeVersion ? `Chrome: ${systemInfo.chromeVersion}` : ""}
${systemInfo.nodeVersion ? `Node.js: ${systemInfo.nodeVersion}` : ""}

Operating System
----------------
OS: ${systemInfo.os}
Version: ${systemInfo.osVersion}
Architecture: ${systemInfo.arch}

Installation Paths
------------------
Application: ${systemInfo.installPath}
Conda Environment: ${systemInfo.condaEnvPath}
Data: ${systemInfo.dataPath}
Logs: ${systemInfo.logsPath}
NPM Packages: ${systemInfo.optionalNodePath}

Features & Versions
-------------------
Python: ${systemInfo.pythonVersion || t("settings:aboutNotAvailable")}
CUDA: ${
      systemInfo.cudaAvailable
        ? systemInfo.cudaVersion || t("settings:aboutAvailable")
        : t("settings:aboutNotAvailable")
    }
Ollama: ${
      systemInfo.ollamaInstalled
        ? systemInfo.ollamaVersion || t("settings:aboutInstalled")
        : t("settings:aboutNotInstalled")
    }
Llama Server: ${
      systemInfo.llamaServerInstalled
        ? systemInfo.llamaServerVersion || t("settings:aboutInstalled")
        : t("settings:aboutNotInstalled")
    }
`;

    try {
      await navigator.clipboard.writeText(text);
      addNotification({
        type: "info",
        alert: true,
        content: t("settings:aboutSystemInfoCopied")
      });
    } catch (error) {
      console.error("Failed to copy to clipboard:", error);
      addNotification({
        type: "error",
        alert: true,
        content: t("settings:aboutSystemInfoCopyFailed")
      });
    }
  }, [systemInfo, addNotification, t]);

  if (loading) {
    return (
      <FlexRow
        justify="center"
        align="center"
        sx={{
          padding: "3em"
        }}
      >
        <LoadingSpinner size="medium" />
      </FlexRow>
    );
  }

  if (error) {
    return (
      <Box sx={{ padding: "1em" }}>
        <Text color="error">{error}</Text>
      </Box>
    );
  }

  return (
    <Box>
      {/* Application Info */}
      <Text size="big" id="application">
        {t("settings:aboutApplicationSection")}
      </Text>
      <div className="settings-section">
        <InfoRow label={t("settings:aboutVersion")} value={VERSION} />
        {systemInfo && (
          <>
            <InfoRow label="Electron" value={systemInfo.electronVersion} />
            <InfoRow label="Chrome" value={systemInfo.chromeVersion} />
            <InfoRow label="Node.js" value={systemInfo.nodeVersion} />
          </>
        )}
      </div>

      {/* Operating System */}
      <Text size="big" id="operating-system">
        {t("settings:aboutOperatingSystem")}
      </Text>
      <div className="settings-section">
        {systemInfo ? (
          <>
            <InfoRow label="OS" value={systemInfo.os} />
            <InfoRow label={t("settings:aboutVersion")} value={systemInfo.osVersion} />
            <InfoRow label={t("settings:aboutArchitecture")} value={systemInfo.arch} />
          </>
        ) : (
          <>
            <InfoRow label={t("settings:aboutPlatform")} value={navigator.platform} />
            <InfoRow label={t("settings:aboutUserAgent")} value={navigator.userAgent} />
          </>
        )}
      </div>

      {/* Installation Paths - hide in production */}
      {systemInfo && !isProduction && (
        <>
          <Text size="big" id="installation-paths">
            {t("settings:aboutInstallationPaths")}
          </Text>
          <div className="settings-section">
            <InfoRow
              label={t("settings:aboutApplicationSection")}
              value={systemInfo.installPath}
              copyable
              onCopy={handleCopy}
            />
            <InfoRow
              label={t("settings:aboutCondaEnvironment")}
              value={systemInfo.condaEnvPath}
              copyable
              onCopy={handleCopy}
            />
            <InfoRow
              label={t("settings:aboutData")}
              value={systemInfo.dataPath}
              copyable
              onCopy={handleCopy}
            />
            <InfoRow
              label={t("settings:aboutLogs")}
              value={systemInfo.logsPath}
              copyable
              onCopy={handleCopy}
            />
            <InfoRow
              label={t("settings:aboutNpmPackages")}
              value={systemInfo.optionalNodePath}
              copyable
              onCopy={handleCopy}
            />
          </div>
        </>
      )}

      {/* Features & Versions */}
      {systemInfo && (
        <>
          <Text size="big" id="features">
            {t("settings:aboutFeaturesVersions")}
          </Text>
          <div className="settings-section">
            <InfoRow label="Python" value={systemInfo.pythonVersion} />
            <FeatureStatus
              label="CUDA (GPU)"
              available={systemInfo.cudaAvailable}
              version={systemInfo.cudaVersion}
            />
            <FeatureStatus
              label="Ollama"
              available={systemInfo.ollamaInstalled}
              version={systemInfo.ollamaVersion}
            />
            <FeatureStatus
              label="Llama Server"
              available={systemInfo.llamaServerInstalled}
              version={systemInfo.llamaServerVersion}
            />
          </div>
        </>
      )}

      {/* Copy All Button */}
      {systemInfo && (
        <Box sx={{ marginTop: "1.5em", marginBottom: "1em" }}>
          <Text
            size="small"
            onClick={handleCopyAll}
            sx={{
              color: "var(--palette-primary-main)",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5em",
              "&:hover": {
                textDecoration: "underline"
              }
            }}
          >
            <ContentCopyIcon sx={{ fontSize: "1.2em" }} />
            {t("settings:aboutCopyAllSystemInfo")}
          </Text>
        </Box>
      )}

      {/* Links */}
      <Text size="big" id="links">
        {t("settings:aboutLinks")}
      </Text>
      <div className="settings-section">
        <FlexColumn
          gap={1}
          sx={{
            padding: "0.5em 0"
          }}
        >
          <a
            href="https://github.com/nodetool-ai/nodetool"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--palette-primary-main)",
              textDecoration: "none"
            }}
          >
            {t("settings:aboutGitHubRepository")}
          </a>
          <a
            href="https://forum.nodetool.ai"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--palette-primary-main)",
              textDecoration: "none"
            }}
          >
            {t("settings:aboutForum")}
          </a>
          <a
            href="https://nodetool.ai"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--palette-primary-main)",
              textDecoration: "none"
            }}
          >
            {t("settings:aboutWebsite")}
          </a>
          <a
            href="https://nodetool.ai/privacy"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--palette-primary-main)",
              textDecoration: "none"
            }}
          >
            {t("settings:aboutPrivacyPolicy")}
          </a>
          <a
            href="https://nodetool.ai/terms"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: "var(--palette-primary-main)",
              textDecoration: "none"
            }}
          >
            {t("settings:aboutTermsOfUse")}
          </a>
        </FlexColumn>
      </div>
    </Box>
  );
});
AboutMenu.displayName = "AboutMenu";

export default memo(AboutMenu);
