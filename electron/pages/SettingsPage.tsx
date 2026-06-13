import React, { useState, useEffect } from "react";
import "./settings.css";
import { UpdateInfo } from "../src/types";

const Settings: React.FC = () => {
  const [autoUpdatesEnabled, setAutoUpdatesEnabled] = useState(false);
  const [startLlamaCppOnStartup, setStartLlamaCppOnStartup] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [serviceSaving, setServiceSaving] = useState(false);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    initialize();
  }, []);

  useEffect(() => {
    // Subscribe to update available events
    if (window.api?.updates?.onAvailable) {
      const unsubscribe = window.api.updates.onAvailable((info: UpdateInfo) => {
        setUpdateInfo(info);
      });
      return () => {
        unsubscribe?.();
      };
    }
  }, []);

  const initialize = async () => {
    try {
      if (window.api?.settings?.getAutoUpdates) {
        const enabled = await window.api.settings.getAutoUpdates();
        setAutoUpdatesEnabled(enabled);
      }
      if (window.api?.settings?.getModelServicesStartup) {
        const startup = await window.api.settings.getModelServicesStartup();
        setStartLlamaCppOnStartup(startup.startLlamaCppOnStartup);
      }
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleAutoUpdatesToggle = async () => {
    if (saving) return;

    const newValue = !autoUpdatesEnabled;
    setSaving(true);

    try {
      if (window.api?.settings?.setAutoUpdates) {
        await window.api.settings.setAutoUpdates(newValue);
        setAutoUpdatesEnabled(newValue);
      }
    } catch (error) {
      console.error("Failed to save auto-updates setting:", error);
      alert("保存设置失败，请重试。");
    } finally {
      setSaving(false);
    }
  };

  const handleInstallUpdate = async () => {
    if (isInstalling || !updateInfo) return;

    setIsInstalling(true);

    try {
      if (window.api?.updates?.restartAndInstall) {
        await window.api.updates.restartAndInstall();
      }
    } catch (error) {
      console.error("Failed to install update:", error);
      alert("安装更新失败，请重试。");
      setIsInstalling(false);
    }
  };

  const handleModelServiceStartupToggle = async (
    key: "startLlamaCppOnStartup",
    value: boolean
  ) => {
    if (serviceSaving) return;
    setServiceSaving(true);

    try {
      if (window.api?.settings?.setModelServicesStartup) {
        const next = await window.api.settings.setModelServicesStartup({
          [key]: value,
        });
        setStartLlamaCppOnStartup(next.startLlamaCppOnStartup);
      }
    } catch (error) {
      console.error("Failed to save model service startup setting:", error);
      alert("保存设置失败，请重试。");
    } finally {
      setServiceSaving(false);
    }
  };

  const openReleaseNotes = () => {
    if (updateInfo?.releaseUrl && window.api?.shell?.openExternal) {
      window.api.shell.openExternal(updateInfo.releaseUrl);
    }
  };

  if (loading) {
    return (
      <div className="app-wrapper">
        <div className="header-region">
          <h1>设置</h1>
        </div>
        <div className="container">
          <div className="loading-container">
            <div className="spinner"></div>
            <div>正在加载设置...</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="app-wrapper">
      <div className="header-region">
        <h1>设置</h1>
      </div>

      <div className="container">
        {/* Update Available Banner */}
        {updateInfo && (
          <div className="update-banner">
            <div className="update-banner-content">
              <div className="update-banner-icon">🎉</div>
              <div className="update-banner-text">
                <div className="update-banner-title">
                  有可用更新：v{updateInfo.version}
                </div>
                <div className="update-banner-subtitle">
                  {updateInfo.downloaded
                    ? "更新已下载，可立即安装"
                    : "发现新版本"}
                </div>
              </div>
            </div>
            <div className="update-banner-actions">
              <button
                className="btn btn-secondary"
                onClick={openReleaseNotes}
              >
                发布说明
              </button>
              <button
                className="btn btn-primary"
                onClick={handleInstallUpdate}
                disabled={isInstalling || !updateInfo.downloaded}
              >
                {isInstalling
                  ? "正在安装..."
                  : updateInfo.downloaded
                  ? "重启并安装"
                  : "正在下载..."}
              </button>
            </div>
          </div>
        )}

        {/* Settings Sections */}
        <div className="settings-section">
          <div className="settings-section-header">
            <h2>本地模型服务</h2>
            <p className="settings-section-description">
              控制 NodeTool 启动时自动启动哪些由 Electron 托管的本地模型服务
            </p>
          </div>

          <div className="settings-card">
            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-label">启动时运行 Llama.cpp</div>
                <div className="setting-description">
                  桌面应用启动时启动或连接到 `llama-server`。
                </div>
              </div>
              <div className="setting-control">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={startLlamaCppOnStartup}
                    onChange={(event) =>
                      void handleModelServiceStartupToggle(
                        "startLlamaCppOnStartup",
                        event.target.checked
                      )
                    }
                    disabled={serviceSaving}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-header">
            <h2>更新</h2>
            <p className="settings-section-description">
              配置 NodeTool 如何处理应用更新
            </p>
          </div>

          <div className="settings-card">
            <div className="setting-row">
              <div className="setting-info">
                <div className="setting-label">自动更新</div>
                <div className="setting-description">
                  应用启动时自动检查并下载更新。关闭后，你仍可从“帮助”菜单手动检查更新。
                </div>
              </div>
              <div className="setting-control">
                <label className="toggle-switch">
                  <input
                    type="checkbox"
                    checked={autoUpdatesEnabled}
                    onChange={handleAutoUpdatesToggle}
                    disabled={saving}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="info-section">
          <div className="info-icon">ℹ️</div>
          <div className="info-text">
            设置会立即保存。自动更新偏好将在下次应用重启后生效。
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
