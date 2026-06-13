import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  PackageInfo,
  PackageModel,
  PackageListResponse,
  InstalledPackageListResponse,
  RuntimePackageStatus,
  RuntimePackageId,
  BuiltinPackStatus,
} from "../types";

interface PackageManagerProps {
  onSkip: () => void;
}

const MAX_CONSOLE_LINES = 500;

const PackageManager: React.FC<PackageManagerProps> = ({ onSkip }) => {
  const [availablePackages, setAvailablePackages] = useState<PackageInfo[]>([]);
  const [installedPackages, setInstalledPackages] = useState<PackageModel[]>(
    []
  );
  const [runtimePackages, setRuntimePackages] = useState<
    RuntimePackageStatus[]
  >([]);
  const [builtinPacks, setBuiltinPacks] = useState<BuiltinPackStatus[]>([]);
  const [builtinRestartNeeded, setBuiltinRestartNeeded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [installLocation, setInstallLocation] = useState<string>("");
  const [consoleLogs, setConsoleLogs] = useState<string[]>([]);
  const [isConsoleCollapsed, setIsConsoleCollapsed] = useState(false);
  const consoleBodyRef = useRef<HTMLDivElement | null>(null);

  const loadRuntimeStatuses = useCallback(async () => {
    try {
      const [statuses, location] = await Promise.all([
        window.api.packages.getRuntimeStatuses(),
        window.api.packages.getInstallLocation(),
      ]);
      setRuntimePackages(statuses);
      setInstallLocation(location);
    } catch (err) {
      console.error("Failed to load runtime statuses:", err);
    }
  }, []);

  const loadPackages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [availableResponse, installedResponse, builtinResponse] =
        await Promise.all([
          window.api.packages.listAvailable().catch(() => ({ packages: [] })),
          window.api.packages.listInstalled().catch(() => ({ packages: [] })),
          window.api.nodePacks.listBuiltin().catch(() => []),
        ]);

      setAvailablePackages(
        (availableResponse as PackageListResponse).packages || []
      );
      setInstalledPackages(
        (installedResponse as InstalledPackageListResponse).packages || []
      );
      setBuiltinPacks(builtinResponse);

      await loadRuntimeStatuses();
    } catch (err) {
      setError("加载包失败，请重试。");
    } finally {
      setLoading(false);
    }
  }, [loadRuntimeStatuses]);

  useEffect(() => {
    loadPackages();
  }, [loadPackages]);

  // Stream live command output from the main process into the console panel.
  // `server-log` is broadcast for every stdout/stderr line from uv and
  // micromamba during install/uninstall/update operations.
  useEffect(() => {
    const unsubscribe = window.api.server.onLog((message: string) => {
      setConsoleLogs((prev) => {
        if (prev.length >= MAX_CONSOLE_LINES) {
          return [...prev.slice(prev.length - MAX_CONSOLE_LINES + 1), message];
        }
        return [...prev, message];
      });
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // Auto-scroll the console to the newest line when logs arrive.
  useEffect(() => {
    if (isConsoleCollapsed) return;
    const body = consoleBodyRef.current;
    if (body) {
      body.scrollTop = body.scrollHeight;
    }
  }, [consoleLogs, isConsoleCollapsed]);

  const handleClearConsole = useCallback(() => {
    setConsoleLogs([]);
  }, []);

  const handleToggleConsole = useCallback(() => {
    setIsConsoleCollapsed((prev) => !prev);
  }, []);

  const handleSelectLocation = useCallback(async () => {
    try {
      const selected = await window.api.packages.selectInstallLocation();
      if (selected) {
        setInstallLocation(selected);
      }
    } catch (err) {
      console.error("Failed to select location:", err);
    }
  }, []);

  const handleRuntimeInstall = useCallback(
    async (packageId: RuntimePackageId) => {
      setInstalling((prev) => new Set(prev).add(packageId));
      try {
        const location = installLocation || undefined;
        const result = await window.api.packages.installRuntime(
          packageId,
          location
        );
        if (result.success) {
          await loadRuntimeStatuses();
        } else {
          setError(result.message || "安装失败");
        }
      } catch (err) {
        console.error("Runtime installation error:", err);
        setError("安装失败，请重试。");
      } finally {
        setInstalling((prev) => {
          const newSet = new Set(prev);
          newSet.delete(packageId);
          return newSet;
        });
      }
    },
    [loadRuntimeStatuses, installLocation]
  );

  const handleToggleBuiltin = useCallback(
    async (pack: BuiltinPackStatus) => {
      try {
        const updated = await window.api.nodePacks.setBuiltinEnabled(
          pack.id,
          !pack.enabled
        );
        setBuiltinPacks(updated);
        setBuiltinRestartNeeded(true);
      } catch (err) {
        console.error("Failed to toggle built-in pack:", err);
        setError(
          `无法${pack.enabled ? "禁用" : "启用"} ${pack.name}，请重试。`
        );
      }
    },
    []
  );

  const handleRestartForBuiltins = useCallback(() => {
    try {
      window.api.server.restart();
      setBuiltinRestartNeeded(false);
    } catch (e) {
      console.warn("Restart server failed:", e);
    }
  }, []);

  const handleInstall = useCallback(
    async (repoId: string) => {
      setInstalling((prev) => new Set(prev).add(repoId));
      try {
        const result = await window.api.packages.install(repoId);
        if (result.success) {
          alert(
            "包安装成功。服务器将重启以应用更改。"
          );
          await loadPackages();
          try {
            window.api.server.restart();
          } catch (e) {
            console.warn("Restart server failed:", e);
          }
        } else {
          setError(result.message || "安装失败");
        }
      } catch (err) {
        console.error("Installation error:", err);
        setError("安装失败，请重试。");
      } finally {
        setInstalling((prev) => {
          const newSet = new Set(prev);
          newSet.delete(repoId);
          return newSet;
        });
      }
    },
    [loadPackages]
  );

  const handleUninstall = useCallback(
    async (repoId: string) => {
      setInstalling((prev) => new Set(prev).add(repoId));
      try {
        const result = await window.api.packages.uninstall(repoId);
        if (result.success) {
          await loadPackages();
        } else {
          setError(result.message || "卸载失败");
        }
      } catch (err) {
        console.error("Uninstallation error:", err);
        setError("卸载失败，请重试。");
      } finally {
        setInstalling((prev) => {
          const newSet = new Set(prev);
          newSet.delete(repoId);
          return newSet;
        });
      }
    },
    [loadPackages]
  );

  const handleUpdate = useCallback(
    async (repoId: string) => {
      setInstalling((prev) => new Set(prev).add(repoId));
      try {
        const result = await window.api.packages.update(repoId);
        if (result.success) {
          alert(
            "包更新成功。服务器将重启以应用更改。"
          );
          await loadPackages();
          try {
            window.api.server.restart();
          } catch (e) {
            console.warn("Restart server failed:", e);
          }
        } else {
          setError(result.message || "更新失败");
        }
      } catch (err) {
        console.error("Update error:", err);
        setError("更新失败，请重试。");
      } finally {
        setInstalling((prev) => {
          const newSet = new Set(prev);
          newSet.delete(repoId);
          return newSet;
        });
      }
    },
    [loadPackages]
  );

  const isInstalled = useCallback(
    (repoId: string) => {
      return installedPackages.some((pkg) => pkg.repo_id === repoId);
    },
    [installedPackages]
  );

  const getInstalledPackage = useCallback(
    (repoId: string) => {
      return installedPackages.find((pkg) => pkg.repo_id === repoId);
    },
    [installedPackages]
  );

  const isProcessing = useCallback(
    (id: string) => {
      return installing.has(id);
    },
    [installing]
  );

  if (loading) {
    return (
      <div className="package-manager">
        <div className="loading-message">正在加载包...</div>
      </div>
    );
  }

  return (
    <div className="package-manager">
      <div className="package-manager-header">
        <h1>NodeTool 包管理器</h1>
        <p style={{ color: "#999", margin: "8px 0 0" }}>
          安装运行时和包，扩展 NodeTool 的能力。
        </p>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button onClick={() => setError(null)} className="dismiss-error">
            ×
          </button>
        </div>
      )}

      <div className="package-sections">
        {/* Runtime Packages Section */}
        <div className="package-section">
          <h2>运行时包</h2>
          <p className="section-description" style={{ color: "#999", margin: "4px 0 12px", fontSize: "13px" }}>
            AI 能力所需的核心运行时。按需安装即可。
          </p>

          {/* Install location selector */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              margin: "0 0 16px",
              padding: "10px 14px",
              background: "rgba(255,255,255,0.04)",
              borderRadius: "8px",
              fontSize: "13px",
            }}
          >
            <span style={{ color: "#999", whiteSpace: "nowrap" }}>
              安装位置：
            </span>
            <code
              style={{
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                color: "#ccc",
                fontSize: "12px",
              }}
              title={installLocation}
            >
              {installLocation}
            </code>
            <button
              onClick={handleSelectLocation}
              style={{
                padding: "4px 10px",
                borderRadius: "4px",
                border: "1px solid rgba(255,255,255,0.15)",
                background: "transparent",
                color: "#ccc",
                cursor: "pointer",
                fontSize: "12px",
                whiteSpace: "nowrap",
              }}
            >
              更改
            </button>
          </div>

          <div className="package-list">
            {runtimePackages.map((pkg) => {
              return (
                <div
                  key={pkg.id}
                  className={`package-item ${pkg.installed ? "installed" : "available"}`}
                >
                  <div className="package-info">
                    <div className="package-header-row">
                      <h3>{pkg.name}</h3>
                      {pkg.installed && (
                        <span className="status-badge up-to-date">
                          已安装
                        </span>
                      )}
                    </div>
                    <p className="package-description">{pkg.description}</p>
                  </div>
                  <div className="package-actions">
                    {pkg.installed ? (
                      <button className="installed-indicator" disabled>
                        已安装
                      </button>
                    ) : (
                      <button
                        className="install-button"
                        onClick={() => handleRuntimeInstall(pkg.id)}
                        disabled={
                          isProcessing(pkg.id) ||
                          pkg.installing
                        }
                      >
                        {isProcessing(pkg.id) || pkg.installing
                          ? "正在安装..."
                          : "安装"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Included Node Packs Section */}
        {builtinPacks.length > 0 && (
          <div className="package-section">
            <h2>内置节点包</h2>
            <p
              className="section-description"
              style={{ color: "#999", margin: "4px 0 12px", fontSize: "13px" }}
            >
              这些节点包随 NodeTool 提供，但默认只启用基础包。启用你使用的服务商后，
              对应节点会添加到编辑器中。
            </p>

            {builtinRestartNeeded && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  margin: "0 0 16px",
                  padding: "10px 14px",
                  background: "rgba(74, 158, 255, 0.12)",
                  border: "1px solid rgba(74, 158, 255, 0.4)",
                  borderRadius: "8px",
                  fontSize: "13px",
                  color: "#ccc",
                }}
              >
                <span style={{ flex: 1 }}>
                  更改将在服务器重启后生效。
                </span>
                <button
                  className="install-button"
                  onClick={handleRestartForBuiltins}
                >
                  重启服务器
                </button>
              </div>
            )}

            <div className="package-list">
              {builtinPacks.map((pack) => (
                <div
                  key={pack.id}
                  className={`package-item ${pack.enabled ? "installed" : "available"}`}
                  style={pack.enabled ? undefined : { opacity: 0.6 }}
                >
                  <div className="package-info">
                    <div className="package-header-row">
                      <h3>{pack.name}</h3>
                      {pack.enabled ? (
                        <span className="status-badge up-to-date">已启用</span>
                      ) : (
                        <span className="status-badge update-available">
                          已禁用
                        </span>
                      )}
                    </div>
                    <p className="package-description">{pack.description}</p>
                  </div>
                  <div className="package-actions">
                    {pack.required ? (
                      <button
                        className="installed-indicator"
                        disabled
                        title="核心节点 - 始终启用"
                      >
                        始终开启
                      </button>
                    ) : pack.enabled ? (
                      <button
                        className="uninstall-button"
                        onClick={() => handleToggleBuiltin(pack)}
                      >
                        禁用
                      </button>
                    ) : (
                      <button
                        className="install-button"
                        onClick={() => handleToggleBuiltin(pack)}
                      >
                        启用
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Installed Packages Section */}
        {installedPackages.length > 0 && (
          <div className="package-section">
            <h2>已安装包（{installedPackages.length}）</h2>
            <div className="package-list">
              {installedPackages.map((pkg) => (
                <div key={pkg.repo_id} className="package-item installed">
                  <div className="package-info">
                    <div className="package-header-row">
                      <h3>{pkg.name}</h3>
                      <span className="status-badge up-to-date">已安装</span>
                    </div>
                    <div className="version-info">
                      <p className="package-version">v{pkg.version}</p>
                      {pkg.hasUpdate && pkg.latestVersion && (
                        <p className="update-available">
                          可更新：v{pkg.latestVersion}
                        </p>
                      )}
                    </div>
                    <p className="package-description">{pkg.description}</p>
                  </div>
                  <div className="package-actions">
                    {pkg.hasUpdate && (
                      <button
                        className="update-button"
                        onClick={() => handleUpdate(pkg.repo_id)}
                        disabled={isProcessing(pkg.repo_id)}
                      >
                        {isProcessing(pkg.repo_id) ? "正在更新..." : "更新"}
                      </button>
                    )}
                    <button
                      className="uninstall-button"
                      onClick={() => handleUninstall(pkg.repo_id)}
                      disabled={isProcessing(pkg.repo_id)}
                    >
                      {isProcessing(pkg.repo_id)
                        ? "正在卸载..."
                        : "卸载"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Available Packages Section */}
        <div className="package-section">
          <h2>可用包（{availablePackages.length}）</h2>
          {availablePackages.length === 0 ? (
            <p className="no-packages">暂无可用包</p>
          ) : (
            <div className="package-list">
              {availablePackages.map((pkg) => {
                const installed = isInstalled(pkg.repo_id);
                const installedPkg = getInstalledPackage(pkg.repo_id);
                const hasUpdate = installedPkg?.hasUpdate || false;
                const isUpToDate = installed && !hasUpdate;

                return (
                  <div
                    key={pkg.repo_id}
                    className={`package-item ${installed ? "installed" : "available"}`}
                  >
                    <div className="package-info">
                      <div className="package-header-row">
                        <h3>{pkg.name}</h3>
                        {isUpToDate && (
                          <span className="status-badge up-to-date">
                            最新
                          </span>
                        )}
                        {hasUpdate && (
                          <span className="status-badge update-available">
                            有更新
                          </span>
                        )}
                      </div>
                      {installed && installedPkg && (
                        <p className="package-version">
                          v{installedPkg.version}
                          {hasUpdate && installedPkg.latestVersion && (
                            <span className="version-arrow">
                              {" "}
                              -&gt; v{installedPkg.latestVersion}
                            </span>
                          )}
                        </p>
                      )}
                      <p className="package-description">{pkg.description}</p>
                    </div>
                    <div className="package-actions">
                      {installed ? (
                        <>
                          {hasUpdate && (
                            <button
                              className="update-button"
                              onClick={() => handleUpdate(pkg.repo_id)}
                              disabled={isProcessing(pkg.repo_id)}
                            >
                              {isProcessing(pkg.repo_id)
                                ? "正在更新..."
                                : "更新"}
                            </button>
                          )}
                          <button className="installed-indicator" disabled>
                            已安装
                          </button>
                        </>
                      ) : (
                        <button
                          className="install-button"
                          onClick={() => handleInstall(pkg.repo_id)}
                          disabled={isProcessing(pkg.repo_id)}
                        >
                          {isProcessing(pkg.repo_id)
                            ? "正在安装..."
                            : "安装"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div
        className={`package-console ${
          isConsoleCollapsed ? "collapsed" : ""
        }`}
      >
        <div className="package-console-header">
          <div className="package-console-title">
            <span className="package-console-indicator" />
            控制台输出
            {consoleLogs.length > 0 && (
              <span className="package-console-count">
                ({consoleLogs.length})
              </span>
            )}
          </div>
          <div className="package-console-actions">
            <button
              type="button"
              className="package-console-button"
              onClick={handleClearConsole}
              disabled={consoleLogs.length === 0}
            >
              清除
            </button>
            <button
              type="button"
              className="package-console-button"
              onClick={handleToggleConsole}
            >
              {isConsoleCollapsed ? "显示" : "隐藏"}
            </button>
          </div>
        </div>
        {!isConsoleCollapsed && (
          <div
            className="package-console-body"
            ref={consoleBodyRef}
            role="log"
            aria-live="polite"
            aria-label="包管理器控制台输出"
          >
            {consoleLogs.length === 0 ? (
              <div className="package-console-empty">
                安装、更新或卸载包时，控制台输出会显示在这里。
              </div>
            ) : (
              consoleLogs.map((line, i) => (
                <div
                  key={`${i}-${line.length}`}
                  className="package-console-line"
                >
                  {line}
                </div>
              ))
            )}
          </div>
        )}
      </div>

      <div
        style={{
          padding: "16px 24px",
          borderTop: "1px solid rgba(255,255,255,0.1)",
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <button
          className="nav-button next"
          onClick={onSkip}
          style={{
            padding: "10px 24px",
            borderRadius: "8px",
            border: "none",
            background: "var(--c_primary, #4a9eff)",
            color: "#fff",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          继续进入应用
        </button>
      </div>
    </div>
  );
};

export default PackageManager;
