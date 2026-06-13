import {
  ipcMain,
  BrowserWindow,
  clipboard,
  globalShortcut,
  shell,
  dialog,
  app,
} from "electron";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "node:crypto";
import {
  getServerState,
  openLogFile,
  showItemInFolder,
  runApp,
  initializeBackendServer,
  stopServer,
  restartLlamaServer,
} from "./server";
import { assertSafeReadablePath } from "./utils";
import { logMessage } from "./logger";
import {
  IpcChannels,
  IpcResponse,
  RuntimePackageId,
  WindowCloseAction,
} from "./types.d";
import {
  readSettingsAsync,
  updateSetting,
  getModelServiceStartupSettings,
  updateModelServiceStartupSettings,
  getUpdateChannel,
  normalizeUpdateChannel,
  setUpdateChannel,
} from "./settings";
import { createPackageManagerWindow, createSettingsWindow } from "./window";
import { IpcRequest } from "./types.d";
import { registerWorkflowShortcut, setupWorkflowShortcuts } from "./shortcuts";
import { emitWorkflowsChanged, emitServerStateChanged } from "./tray";
import {
  fetchAvailablePackages,
  listInstalledPackages,
  installPackage,
  uninstallPackage,
  updatePackage,
  validateRepoId,
  searchNodes,
  checkExpectedPackageVersions,
  getRuntimePackageStatuses,
  installRuntimePackage,
  getCondaInstallLocation,
  RUNTIME_PACKAGE_IDS,
} from "./packageManager";
import {
  installNodePack,
  uninstallNodePack,
  listInstalledNodePacks,
  getNodePackInstallRoot,
} from "./nodePackManager";
import { listBuiltinPacks, setBuiltinPackEnabled } from "./builtinPacks";
import {
  openModelDirectory,
  openPathInExplorer,
  openSystemDirectory,
} from "./fileExplorer";

const MIME_TYPE_MAP: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  ico: "image/x-icon",
  svg: "image/svg+xml",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  flac: "audio/flac",
  aac: "audio/aac",
  mp4: "video/mp4",
  avi: "video/x-msvideo",
  mov: "video/quicktime",
  wmv: "video/x-ms-wmv",
  flv: "video/x-flv",
  webm: "video/webm",
  mkv: "video/x-matroska",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  html: "text/html",
};

import WebSocket from "ws";

/**
 * This module handles Inter-Process Communication (IPC) between the Electron main process
 * and renderer processes. It provides type-safe wrappers for IPC handlers and initializes
 * all IPC channels used by the application.
 *
 * Key features:
 * - Type-safe IPC handler creation using TypeScript generics
 * - Centralized initialization of all IPC channels
 * - Handlers for:
 *   - Clipboard operations (read/write)
 *   - Server state management
 *   - Application control (run, update)
 *   - Window controls (close, minimize, maximize)
 *   - File operations (save)
 *
 * The IPC system ensures secure and typed communication between the isolated renderer
 * process and the privileged main process, following Electron's security best practices.
 */

export type IpcMainHandler<T extends keyof IpcRequest & keyof IpcResponse> = (
  event: Electron.IpcMainInvokeEvent,
  data: IpcRequest[T],
) => Promise<IpcResponse[T]>;

// Channels that should have their payloads redacted for security
const SENSITIVE_CHANNELS = ["clipboard:write-text", "clipboard:read-text"];
// High-frequency channels that only log on error to reduce noise
const QUIET_CHANNELS = [
  "settings-get-close-behavior",
  "frontend-log",
];
const LOCALHOST_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const LOCALHOST_PROXY_WS_STATES = new Map<
  string,
  {
    senderId: number;
    socket: WebSocket;
  }
>();
const LOCALHOST_PROXY_WS_IDS_BY_SENDER = new Map<number, Set<string>>();

/**
 * Defense-in-depth check for URLs passed to `shell.openExternal` / browser.
 * The preload already filters schemes, but a compromised renderer could
 * invoke the IPC channel directly. Only `http:`, `https:`, and `mailto:`
 * are considered safe to hand to the OS.
 */
const SAFE_EXTERNAL_PROTOCOLS = new Set([
  "http:",
  "https:",
  "mailto:",
]);

function isSafeExternalUrl(urlValue: unknown): boolean {
  if (typeof urlValue !== "string" || urlValue.length === 0) {
    return false;
  }
  // Allow well-known OS-preference deep links used by our own code paths.
  // These are expected to come from the main process, not the renderer, so
  // we accept them here for completeness and log any unexpected call.
  if (
    urlValue.startsWith("x-apple.systempreferences:") ||
    urlValue.startsWith("ms-settings:")
  ) {
    return true;
  }
  try {
    const parsed = new URL(urlValue);
    return SAFE_EXTERNAL_PROTOCOLS.has(parsed.protocol);
  } catch {
    return false;
  }
}

function assertLocalhostUrl(
  urlValue: string,
  allowedProtocols: string[] = ["http:", "https:"],
): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlValue);
  } catch {
    throw new Error("代理 URL 无效");
  }

  if (!allowedProtocols.includes(parsed.protocol)) {
    throw new Error(
      `只允许 ${allowedProtocols.join("/")} URL`,
    );
  }
  if (!LOCALHOST_HOSTNAMES.has(parsed.hostname)) {
    throw new Error("只允许 localhost URL");
  }
  return parsed;
}

function sanitizeProxyMethod(method?: string): string {
  const normalized = (method || "GET").toUpperCase();
  const allowedMethods = new Set([
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
  ]);
  if (!allowedMethods.has(normalized)) {
    throw new Error(`不支持的请求方法：${normalized}`);
  }
  return normalized;
}

function cleanupLocalhostProxyWsConnection(connectionId: string): void {
  const existing = LOCALHOST_PROXY_WS_STATES.get(connectionId);
  if (!existing) {
    return;
  }

  const senderConnections = LOCALHOST_PROXY_WS_IDS_BY_SENDER.get(
    existing.senderId,
  );
  if (senderConnections) {
    senderConnections.delete(connectionId);
    if (senderConnections.size === 0) {
      LOCALHOST_PROXY_WS_IDS_BY_SENDER.delete(existing.senderId);
    }
  }

  LOCALHOST_PROXY_WS_STATES.delete(connectionId);
}

function closeAllLocalhostProxyWsForSender(senderId: number): void {
  const senderConnections = LOCALHOST_PROXY_WS_IDS_BY_SENDER.get(senderId);
  if (!senderConnections) {
    return;
  }

  for (const connectionId of senderConnections) {
    const existing = LOCALHOST_PROXY_WS_STATES.get(connectionId);
    if (existing) {
      try {
        existing.socket.close();
      } catch (error) {
        logMessage(
          `Error closing localhost proxy websocket ${connectionId}: ${String(
            error,
          )}`,
          "warn",
        );
      }
    }
    cleanupLocalhostProxyWsConnection(connectionId);
  }
}

/**
 * Type-safe wrapper for IPC main handlers with logging
 */
export function createIpcMainHandler<T extends keyof IpcRequest>(
  channel: T,
  handler: IpcMainHandler<T>,
): void {
  try {
    // Ensure idempotent registration to avoid "Attempted to register a second handler" errors
    ipcMain.removeHandler(channel as string);
  } catch (error) {
    // Best-effort cleanup; continue with handler registration
    logMessage(
      `Warning removing existing IPC handler for ${String(channel)}: ${String(
        error,
      )}`,
      "warn",
    );
  }

  // Wrap the handler with logging
  const wrappedHandler: IpcMainHandler<T> = async (event, data) => {
    const startTime = Date.now();
    const channelStr = String(channel);
    const isSensitive = SENSITIVE_CHANNELS.includes(channelStr);
    const isQuiet = QUIET_CHANNELS.includes(channelStr);

    // Log incoming request (skip quiet channels)
    if (!isQuiet) {
      if (isSensitive) {
        logMessage(`IPC → ${channelStr} (payload redacted)`);
      } else {
        const payloadStr =
          data !== undefined ? JSON.stringify(data) : "undefined";
        const truncatedPayload =
          payloadStr.length > 200
            ? payloadStr.substring(0, 200) + "..."
            : payloadStr;
        logMessage(`IPC → ${channelStr}: ${truncatedPayload}`);
      }
    }

    try {
      const result = await handler(event, data);
      if (!isQuiet) {
        const duration = Date.now() - startTime;
        logMessage(`IPC ← ${channelStr} OK (${duration}ms)`);
      }
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      logMessage(
        `IPC ← ${channelStr} ERROR (${duration}ms): ${String(error)}`,
        "error",
      );
      throw error;
    }
  };

  ipcMain.handle(channel, wrappedHandler);
}

/**
 * Initialize all IPC handlers for the main process
 */
export function initializeIpcHandlers(): void {
  logMessage("Initializing IPC handlers", "info");

  // Clipboard handlers
  createIpcMainHandler(
    IpcChannels.CLIPBOARD_WRITE_TEXT,
    async (_event, data) => {
      clipboard.writeText(data.text, data.type);
    },
  );

  createIpcMainHandler(
    IpcChannels.CLIPBOARD_READ_TEXT,
    async (_event, type) => {
      return clipboard.readText(type);
    },
  );

  createIpcMainHandler(
    IpcChannels.CLIPBOARD_WRITE_IMAGE,
    async (_event, data) => {
      const { nativeImage } = await import("electron");
      const image = nativeImage.createFromDataURL(data.dataUrl);
      clipboard.writeImage(image, data.type);
    },
  );

  createIpcMainHandler(
    IpcChannels.CLIPBOARD_READ_IMAGE,
    async (_event, type) => {
      const image = clipboard.readImage(type);
      return image.toDataURL();
    },
  );

  createIpcMainHandler(
    IpcChannels.CLIPBOARD_READ_HTML,
    async (_event, type) => {
      return clipboard.readHTML(type);
    },
  );

  createIpcMainHandler(
    IpcChannels.CLIPBOARD_WRITE_HTML,
    async (_event, data) => {
      clipboard.writeHTML(data.markup, data.type);
    },
  );

  createIpcMainHandler(IpcChannels.CLIPBOARD_READ_RTF, async (_event, type) => {
    return clipboard.readRTF(type);
  });

  createIpcMainHandler(
    IpcChannels.CLIPBOARD_WRITE_RTF,
    async (_event, data) => {
      clipboard.writeRTF(data.text, data.type);
    },
  );

  createIpcMainHandler(IpcChannels.CLIPBOARD_READ_BOOKMARK, async () => {
    return clipboard.readBookmark();
  });

  createIpcMainHandler(
    IpcChannels.CLIPBOARD_WRITE_BOOKMARK,
    async (_event, data) => {
      clipboard.writeBookmark(data.title, data.url, data.type);
    },
  );

  createIpcMainHandler(IpcChannels.CLIPBOARD_READ_FIND_TEXT, async () => {
    return clipboard.readFindText();
  });

  createIpcMainHandler(
    IpcChannels.CLIPBOARD_WRITE_FIND_TEXT,
    async (_event, text) => {
      clipboard.writeFindText(text);
    },
  );

  createIpcMainHandler(IpcChannels.CLIPBOARD_CLEAR, async (_event, type) => {
    clipboard.clear(type);
  });

  createIpcMainHandler(
    IpcChannels.CLIPBOARD_AVAILABLE_FORMATS,
    async (_event, type) => {
      return clipboard.availableFormats(type);
    },
  );

  createIpcMainHandler(IpcChannels.CLIPBOARD_READ_FILE_PATHS, async () => {
    const formats = clipboard.availableFormats();
    logMessage(`Clipboard formats available: ${formats.join(", ")}`);

    // Linux and some Windows apps use text/uri-list
    if (formats.includes("text/uri-list")) {
      try {
        const uris = clipboard.readText("selection");
        // Also try clipboard type if selection doesn't have uri-list
        const urisClipboard = clipboard.read("text/uri-list");
        const uriText = urisClipboard || uris;
        if (uriText) {
          const paths = uriText
            .split("\n")
            .filter((line: string) => line.trim().startsWith("file://"))
            .map((uri: string) => {
              try {
                return decodeURIComponent(new URL(uri.trim()).pathname);
              } catch {
                return null;
              }
            })
            .filter((p: string | null): p is string => p !== null);
          if (paths.length > 0) {
            logMessage(`Read ${paths.length} file paths from text/uri-list`);
            return paths;
          }
        }
      } catch (error) {
        logMessage(`Error reading text/uri-list: ${error}`, "warn");
      }
    }

    // Windows Explorer uses FileNameW format
    if (formats.includes("FileNameW")) {
      try {
        const buf = clipboard.readBuffer("FileNameW");
        // FileNameW is UTF-16LE (UCS-2) encoded, null-terminated strings
        const decoded = buf.toString("ucs2");
        const paths = decoded.split("\u0000").filter(Boolean);
        if (paths.length > 0) {
          logMessage(`Read ${paths.length} file paths from FileNameW`);
          return paths;
        }
      } catch (error) {
        logMessage(`Error reading FileNameW: ${error}`, "warn");
      }
    }

    // macOS Finder uses public.file-url
    if (formats.includes("public.file-url")) {
      try {
        const fileUrl = clipboard.read("public.file-url");
        if (fileUrl) {
          const paths = fileUrl
            .split("\n")
            .filter(Boolean)
            .map((uri: string) => {
              try {
                // Handle both file:// URLs and plain paths
                if (uri.startsWith("file://")) {
                  return decodeURIComponent(new URL(uri.trim()).pathname);
                }
                return uri.trim();
              } catch {
                return null;
              }
            })
            .filter((p: string | null): p is string => p !== null);
          if (paths.length > 0) {
            logMessage(`Read ${paths.length} file paths from public.file-url`);
            return paths;
          }
        }
      } catch (error) {
        logMessage(`Error reading public.file-url: ${error}`, "warn");
      }
    }

    // Fallback: check if plain text looks like file paths
    try {
      const text = clipboard.readText();
      if (text) {
        // Check if it looks like file path(s)
        const lines = text.split("\n").map((l: string) => l.trim()).filter(Boolean);
        const possiblePaths = lines.filter((line: string) => {
          // Check for common path patterns
          return (
            line.startsWith("/") || // Unix absolute path
            line.startsWith("~") || // Unix home path
            /^[A-Za-z]:\\/.test(line) || // Windows path
            line.startsWith("file://") // File URL
          );
        });
        if (possiblePaths.length > 0 && possiblePaths.length === lines.length) {
          // All lines look like paths
          const paths = possiblePaths.map((p: string) => {
            if (p.startsWith("file://")) {
              try {
                return decodeURIComponent(new URL(p).pathname);
              } catch {
                return p;
              }
            }
            return p;
          });
          logMessage(`Read ${paths.length} file paths from plain text`);
          return paths;
        }
      }
    } catch (error) {
      logMessage(`Error reading plain text for file paths: ${error}`, "warn");
    }

    return [];
  });

  // Read raw buffer data from clipboard for a specific format
  createIpcMainHandler(
    IpcChannels.CLIPBOARD_READ_BUFFER,
    async (_event, format) => {
      try {
        const buffer = clipboard.readBuffer(format);
        if (buffer && buffer.length > 0) {
          // Return as base64 string for safe IPC transfer
          return buffer.toString("base64");
        }
        return null;
      } catch (error) {
        logMessage(`Failed to read clipboard buffer for format ${format}: ${error}`, "warn");
        return null;
      }
    },
  );

  // Get comprehensive clipboard content info for smart paste decisions
  createIpcMainHandler(IpcChannels.CLIPBOARD_GET_CONTENT_INFO, async () => {
    const formats = clipboard.availableFormats();
    
    // Determine content type based on available formats
    const hasImage = formats.some((f: string) => 
      f.includes("image/") || 
      f === "image/png" || 
      f === "image/tiff" || 
      f === "public.tiff" ||
      f === "org.chromium.image-html"
    );
    
    const hasFiles = formats.some((f: string) => 
      f === "text/uri-list" || 
      f === "FileNameW" || 
      f === "public.file-url" ||
      f === "CF_HDROP"
    );
    
    const hasHtml = formats.some((f: string) => 
      f === "text/html" || 
      f.includes("html")
    );
    
    const hasRtf = formats.some((f: string) => 
      f === "text/rtf" || 
      f.includes("rtf")
    );
    
    const hasText = formats.some((f: string) => 
      f === "text/plain" || 
      f === "text" ||
      f === "STRING" ||
      f === "UTF8_STRING"
    );

    return {
      formats,
      hasImage,
      hasFiles,
      hasHtml,
      hasRtf,
      hasText,
      platform: process.platform as "darwin" | "win32" | "linux"
    };
  });

  createIpcMainHandler(
    IpcChannels.FILE_READ_AS_DATA_URL,
    async (_event, filePath) => {
      let safePath: string;
      try {
        safePath = assertSafeReadablePath(filePath);
      } catch (error) {
        logMessage(
          `Refusing FILE_READ_AS_DATA_URL for ${String(filePath)}: ${String(error)}`,
          "warn",
        );
        return null;
      }
      try {
        const buffer = await fs.readFile(safePath);
        const ext = path.extname(safePath).toLowerCase().replace(".", "");
        
        const mimeType = MIME_TYPE_MAP[ext] || "application/octet-stream";

        return `data:${mimeType};base64,${buffer.toString("base64")}`;
      } catch (error) {
        logMessage(`Failed to read file as data URL: ${error}`, "warn");
        return null;
      }
    },
  );

  createIpcMainHandler(
    IpcChannels.FILE_READ_BUFFER,
    async (_event, filePath) => {
      let safePath: string;
      try {
        safePath = assertSafeReadablePath(filePath);
      } catch (error) {
        logMessage(
          `Refusing FILE_READ_BUFFER for ${String(filePath)}: ${String(error)}`,
          "warn",
        );
        return null;
      }
      try {
        const buffer = await fs.readFile(safePath);
        const ext = path.extname(safePath).toLowerCase().replace(".", "");

        const mimeType = MIME_TYPE_MAP[ext] || "application/octet-stream";

        return { buffer, mimeType };
      } catch (error) {
        logMessage(`Failed to read file buffer: ${error}`, "warn");
        return null;
      }
    },
  );

  // Server state handlers
  createIpcMainHandler(IpcChannels.GET_SERVER_STATE, async () => {
    return getServerState();
  });

  createIpcMainHandler(IpcChannels.OPEN_LOG_FILE, async () => {
    openLogFile();
  });

  createIpcMainHandler(
    IpcChannels.SHOW_ITEM_IN_FOLDER,
    async (_event, fullPath) => {
      showItemInFolder(fullPath);
    },
  );

  createIpcMainHandler(
    IpcChannels.FILE_EXPLORER_OPEN_PATH,
    async (_event, request) => {
      return openPathInExplorer(request.path);
    },
  );

  createIpcMainHandler(
    IpcChannels.FILE_EXPLORER_OPEN_DIRECTORY,
    async (_event, target) => {
      return openModelDirectory(target);
    },
  );

  createIpcMainHandler(
    IpcChannels.FILE_EXPLORER_OPEN_SYSTEM_DIRECTORY,
    async (_event, target) => {
      return openSystemDirectory(target);
    },
  );

  // Continue to app handler
  createIpcMainHandler(IpcChannels.START_SERVER, async () => {
    logMessage("用户从包管理器继续进入应用");
    await initializeBackendServer();
    logMessage("服务启动后正在设置工作流快捷方式...");
    await setupWorkflowShortcuts();
  });

  // Restart server handler
  createIpcMainHandler(IpcChannels.RESTART_SERVER, async () => {
    logMessage("根据用户请求重启后端服务");
    try {
      await stopServer();
    } catch (e) {
      logMessage(`重启前停止服务时出错：${e}`, "warn");
    }
    // Small delay to ensure ports and resources are released before restart
    await new Promise((resolve) => setTimeout(resolve, 300));
    await initializeBackendServer();
    await setupWorkflowShortcuts();
  });

  // Restart llama-server handler (used after downloading new models)
  createIpcMainHandler(IpcChannels.RESTART_LLAMA_SERVER, async () => {
    logMessage("正在重启 llama-server 以加载新模型");
    await restartLlamaServer();
  });

  // App control handlers
  createIpcMainHandler(IpcChannels.RUN_APP, async (_event, workflowId) => {
    logMessage(`正在运行应用，工作流 ID：${workflowId}`);
    await runApp(workflowId);
  });

  // Show Package Manager window
  createIpcMainHandler(
    IpcChannels.SHOW_PACKAGE_MANAGER,
    async (_event, nodeSearch) => {
      logMessage(
        `正在打开包管理器窗口${
          nodeSearch ? `，搜索：${nodeSearch}` : ""
        }`,
      );
      createPackageManagerWindow(nodeSearch);
    },
  );

  createIpcMainHandler(IpcChannels.INSTALL_UPDATE, async () => {
    const { autoUpdater } = await import("electron-updater");
    logMessage("用户请求安装更新并重启");
    autoUpdater.quitAndInstall();
  });

  // Window control handlers
  ipcMain.on(IpcChannels.WINDOW_CLOSE, (event) => {
    try {
      const window = BrowserWindow.getFocusedWindow();
      if (window) {
        window.close();
      }
    } catch (error) {
      logMessage(`关闭窗口时出错：${error}`, "error");
    }
  });

  ipcMain.on(IpcChannels.WINDOW_MINIMIZE, (event) => {
    try {
      const window = BrowserWindow.getFocusedWindow();
      if (window) {
        window.minimize();
      }
    } catch (error) {
      logMessage(`最小化窗口时出错：${error}`, "error");
    }
  });

  ipcMain.on(IpcChannels.WINDOW_MAXIMIZE, (event) => {
    try {
      const window = BrowserWindow.getFocusedWindow();
      if (window) {
        if (window.isMaximized()) {
          window.unmaximize();
        } else {
          window.maximize();
        }
      }
    } catch (error) {
      logMessage(`最大化窗口时出错：${error}`, "error");
    }
  });

  createIpcMainHandler(
    IpcChannels.ON_CREATE_WORKFLOW,
    async (event, workflow) => {
      logMessage(`正在创建工作流：${workflow.name}`);
      registerWorkflowShortcut(workflow);
      emitWorkflowsChanged();
    },
  );

  createIpcMainHandler(
    IpcChannels.ON_UPDATE_WORKFLOW,
    async (event, workflow) => {
      logMessage(`正在更新工作流：${workflow.name}`);
      registerWorkflowShortcut(workflow);
      emitWorkflowsChanged();
    },
  );

  createIpcMainHandler(
    IpcChannels.ON_DELETE_WORKFLOW,
    async (event, workflow) => {
      logMessage(`正在删除工作流：${workflow.name}`);
      if (workflow.settings?.shortcut) {
        globalShortcut.unregister(workflow.settings.shortcut);
      }
      emitWorkflowsChanged();
    },
  );

  // Package manager handlers
  createIpcMainHandler(IpcChannels.PACKAGE_LIST_AVAILABLE, async () => {
    logMessage("正在获取可用包");
    return await fetchAvailablePackages();
  });

  createIpcMainHandler(IpcChannels.PACKAGE_LIST_INSTALLED, async () => {
    logMessage("正在列出已安装包");
    return await listInstalledPackages();
  });

  createIpcMainHandler(IpcChannels.PACKAGE_INSTALL, async (_event, request) => {
    logMessage(`正在安装包：${request.repo_id}`);
    const validation = validateRepoId(request.repo_id);
    if (!validation.valid) {
      return {
        success: false,
        message: validation.error || "仓库 ID 无效",
      };
    }
    return await installPackage(request.repo_id);
  });

  createIpcMainHandler(
    IpcChannels.PACKAGE_UNINSTALL,
    async (_event, request) => {
      logMessage(`正在卸载包：${request.repo_id}`);
      const validation = validateRepoId(request.repo_id);
      if (!validation.valid) {
        return {
          success: false,
          message: validation.error || "仓库 ID 无效",
        };
      }
      return await uninstallPackage(request.repo_id);
    },
  );

  createIpcMainHandler(IpcChannels.PACKAGE_UPDATE, async (_event, repoId) => {
    logMessage(`正在更新包：${repoId}`);
    const validation = validateRepoId(repoId);
    if (!validation.valid) {
      return {
        success: false,
        message: validation.error || "仓库 ID 无效",
      };
    }
    return await updatePackage(repoId);
  });

  createIpcMainHandler(
    IpcChannels.PACKAGE_SEARCH_NODES,
    async (_event, query) => {
      try {
        const results = await searchNodes(query || "");
        return results;
      } catch (e) {
        logMessage(`搜索节点时出错：${String(e)}`, "warn");
        return [];
      }
    },
  );

  createIpcMainHandler(
    IpcChannels.PACKAGE_OPEN_EXTERNAL,
    async (_event, url) => {
      if (!isSafeExternalUrl(url)) {
        logMessage(
          `已拒绝打开不安全的外部 URL：${String(url)}`,
          "warn",
        );
        return;
      }
      logMessage(`正在打开外部 URL：${url}`);
      void shell.openExternal(url);
    },
  );

  // Package version check handler
  createIpcMainHandler(IpcChannels.PACKAGE_VERSION_CHECK, async () => {
    logMessage("正在检查预期包版本");
    return await checkExpectedPackageVersions();
  });

  // Node pack handlers (third-party TS node packs)
  createIpcMainHandler(IpcChannels.NODE_PACK_LIST_INSTALLED, async () => {
    return await listInstalledNodePacks();
  });
  createIpcMainHandler(IpcChannels.NODE_PACK_INSTALL, async (_event, req) => {
    logMessage(`正在安装节点包：${req.spec}`);
    return await installNodePack(req.spec);
  });
  createIpcMainHandler(IpcChannels.NODE_PACK_UNINSTALL, async (_event, req) => {
    logMessage(`正在卸载节点包：${req.name}`);
    return await uninstallNodePack(req.name);
  });
  createIpcMainHandler(IpcChannels.NODE_PACK_GET_INSTALL_DIR, async () => {
    return getNodePackInstallRoot();
  });

  // Built-in node pack handlers (first-party packs shipped with NodeTool)
  createIpcMainHandler(IpcChannels.BUILTIN_PACK_LIST, async () => {
    return listBuiltinPacks();
  });
  createIpcMainHandler(
    IpcChannels.BUILTIN_PACK_SET_ENABLED,
    async (_event, req) => {
      logMessage(
        `${req.enabled ? "正在启用" : "正在停用"}内置节点包：${req.id}`,
      );
      return setBuiltinPackEnabled(req.id, req.enabled);
    },
  );

  // Runtime package handlers
  createIpcMainHandler(IpcChannels.RUNTIME_PACKAGE_STATUSES, async () => {
    logMessage("正在获取运行时包状态");
    return await getRuntimePackageStatuses();
  });

  createIpcMainHandler(
    IpcChannels.RUNTIME_PACKAGE_INSTALL,
    async (_event, data: { packageId: string; installLocation?: string }) => {
      if (!RUNTIME_PACKAGE_IDS.includes(data.packageId as RuntimePackageId)) {
        return { success: false, message: `未知包 ID：${data.packageId}` };
      }
      logMessage(`正在安装运行时包：${data.packageId}`);
      return await installRuntimePackage(
        data.packageId as RuntimePackageId,
        data.installLocation,
      );
    },
  );

  createIpcMainHandler(
    IpcChannels.RUNTIME_PACKAGE_UNINSTALL,
    async (_event, data: { packageId: string }) => {
      if (!RUNTIME_PACKAGE_IDS.includes(data.packageId as RuntimePackageId)) {
        return { success: false, message: `未知包 ID：${data.packageId}` };
      }
      logMessage(`正在卸载运行时包：${data.packageId}`);
      const { uninstallRuntimePackage } = await import("./packageManager");
      return await uninstallRuntimePackage(data.packageId as RuntimePackageId);
    },
  );

  createIpcMainHandler(IpcChannels.RUNTIME_GET_INSTALL_LOCATION, async () => {
    return getCondaInstallLocation();
  });

  createIpcMainHandler(
    IpcChannels.RUNTIME_SELECT_INSTALL_LOCATION,
    async () => {
      const { filePaths, canceled } = await dialog.showOpenDialog({
        properties: ["openDirectory", "createDirectory"],
        title: "选择 conda 环境安装文件夹",
        buttonLabel: "选择文件夹",
      });
      if (canceled || !filePaths?.[0]) {
        return null;
      }
      return path.join(filePaths[0], "nodetool-env");
    },
  );

  // Log viewer handlers
  createIpcMainHandler(IpcChannels.GET_LOGS, async () => {
    logMessage("正在获取服务日志");
    return getServerState().logs;
  });

  createIpcMainHandler(IpcChannels.CLEAR_LOGS, async () => {
    logMessage("正在清空服务日志");
    getServerState().logs = [];
  });

  createIpcMainHandler(IpcChannels.FRONTEND_LOG, async (_event, data) => {
    const source = data.source?.trim() ? `[${data.source.trim()}] ` : "";
    // Cap forwarded messages so a runaway log doesn't spam the file, but
    // leave room for full error messages and short stack-trace headers.
    const MAX_FORWARDED_MESSAGE_LENGTH = 4000;
    const message =
      data.message.length > MAX_FORWARDED_MESSAGE_LENGTH
        ? data.message.slice(0, MAX_FORWARDED_MESSAGE_LENGTH) + "…"
        : data.message;
    logMessage(`${source}${message}`, data.level);
  });

  createIpcMainHandler(
    IpcChannels.LOCALHOST_PROXY_REQUEST,
    async (_event, request) => {
      const parsedUrl = assertLocalhostUrl(request.url);
      const method = sanitizeProxyMethod(request.method);
      const responseType = request.responseType || "text";
      logMessage(
        `[localhost-proxy] HTTP ${method} ${parsedUrl.toString()}`,
        "info",
      );

      let response: Response;
      try {
        response = await fetch(parsedUrl.toString(), {
          method,
          headers: request.headers,
          body: request.body,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logMessage(
          `[localhost-proxy] HTTP ${method} ${parsedUrl.toString()} failed: ${message}`,
          "warn",
        );
        return {
          status: 0,
          ok: false,
          headers: {
            "status-text": message,
            "x-localhost-proxy-error": "1",
          },
          error: message,
          data: responseType === "json" ? null : "",
        };
      }

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const data =
        responseType === "json"
          ? await response.json()
          : await response.text();

      logMessage(
        `[localhost-proxy] HTTP ${method} ${parsedUrl.toString()} -> ${response.status}`,
        response.ok ? "info" : "warn",
      );

      return {
        status: response.status,
        ok: response.ok,
        headers: responseHeaders,
        data,
      };
    },
  );

  createIpcMainHandler(
    IpcChannels.LOCALHOST_PROXY_WS_OPEN,
    async (event, request) => {
      const parsedUrl = assertLocalhostUrl(request.url, ["ws:", "wss:"]);
      const senderId = event.sender.id;
      const connectionId = randomUUID();
      logMessage(
        `[localhost-proxy] WS open requested ${parsedUrl.toString()} (sender=${senderId})`,
        "info",
      );
      const socket = new WebSocket(parsedUrl.toString(), request.protocols, {
        headers: request.headers,
      });

      LOCALHOST_PROXY_WS_STATES.set(connectionId, { senderId, socket });
      let senderConnections = LOCALHOST_PROXY_WS_IDS_BY_SENDER.get(senderId);
      if (!senderConnections) {
        senderConnections = new Set<string>();
        LOCALHOST_PROXY_WS_IDS_BY_SENDER.set(senderId, senderConnections);
        event.sender.once("destroyed", () => {
          closeAllLocalhostProxyWsForSender(senderId);
        });
      }
      senderConnections.add(connectionId);

      socket.on("open", () => {
        logMessage(
          `[localhost-proxy] WS open ${connectionId} ${parsedUrl.toString()}`,
          "info",
        );
        if (!event.sender.isDestroyed()) {
          event.sender.send(IpcChannels.LOCALHOST_PROXY_WS_EVENT, {
            connectionId,
            event: "open",
          });
        }
      });

      socket.on("message", (data) => {
        const textData =
          typeof data === "string"
            ? data
            : Array.isArray(data)
              ? Buffer.concat(data).toString("utf8")
              : Buffer.from(data as ArrayBuffer | SharedArrayBuffer).toString("utf8");
        if (!event.sender.isDestroyed()) {
          event.sender.send(IpcChannels.LOCALHOST_PROXY_WS_EVENT, {
            connectionId,
            event: "message",
            data: textData,
          });
        }
        logMessage(
          `[localhost-proxy] WS message ${connectionId} (${textData.length} bytes)`,
          "info",
        );
      });

      socket.on("error", (error) => {
        logMessage(
          `[localhost-proxy] WS error ${connectionId}: ${error.message}`,
          "error",
        );
        if (!event.sender.isDestroyed()) {
          event.sender.send(IpcChannels.LOCALHOST_PROXY_WS_EVENT, {
            connectionId,
            event: "error",
            error: error.message,
          });
        }
      });

      socket.on("close", (code, reason) => {
        logMessage(
          `[localhost-proxy] WS close ${connectionId} code=${code} reason=${reason.toString("utf8")}`,
          "info",
        );
        if (!event.sender.isDestroyed()) {
          event.sender.send(IpcChannels.LOCALHOST_PROXY_WS_EVENT, {
            connectionId,
            event: "close",
            code,
            reason: reason.toString("utf8"),
          });
        }
        cleanupLocalhostProxyWsConnection(connectionId);
      });

      return { connectionId };
    },
  );

  createIpcMainHandler(
    IpcChannels.LOCALHOST_PROXY_WS_SEND,
    async (event, request) => {
      logMessage(
        `[localhost-proxy] WS send ${request.connectionId} (${request.data.length} bytes)`,
        "info",
      );
      const connection = LOCALHOST_PROXY_WS_STATES.get(request.connectionId);
      if (!connection) {
        logMessage(
          `[localhost-proxy] WS send failed: connection ${request.connectionId} not found`,
          "warn",
        );
        throw new Error("WebSocket connection not found");
      }
      if (connection.senderId !== event.sender.id) {
        logMessage(
          `[localhost-proxy] WS send denied for ${request.connectionId}: sender mismatch`,
          "warn",
        );
        throw new Error("WebSocket connection belongs to another renderer");
      }
      if (connection.socket.readyState !== WebSocket.OPEN) {
        logMessage(
          `[localhost-proxy] WS send failed for ${request.connectionId}: socket not open`,
          "warn",
        );
        throw new Error("WebSocket is not open");
      }
      connection.socket.send(request.data);
    },
  );

  createIpcMainHandler(
    IpcChannels.LOCALHOST_PROXY_WS_CLOSE,
    async (event, request) => {
      logMessage(
        `[localhost-proxy] WS close requested ${request.connectionId}`,
        "info",
      );
      const connection = LOCALHOST_PROXY_WS_STATES.get(request.connectionId);
      if (!connection) {
        logMessage(
          `[localhost-proxy] WS close noop: ${request.connectionId} not found`,
          "warn",
        );
        return;
      }
      if (connection.senderId !== event.sender.id) {
        throw new Error("WebSocket connection belongs to another renderer");
      }
      connection.socket.close(request.code, request.reason);
    },
  );

  // Shell module handlers
  createIpcMainHandler(
    IpcChannels.SHELL_SHOW_ITEM_IN_FOLDER,
    async (_event, fullPath) => {
      logMessage(`Showing item in folder: ${fullPath}`);
      shell.showItemInFolder(fullPath);
    },
  );

  createIpcMainHandler(IpcChannels.SHELL_OPEN_PATH, async (_event, path) => {
    let safePath: string;
    try {
      safePath = assertSafeReadablePath(path);
    } catch (error) {
      logMessage(
        `Refusing SHELL_OPEN_PATH for ${String(path)}: ${String(error)}`,
        "warn",
      );
      return `Refused: ${String(error)}`;
    }
    logMessage(`Opening path: ${safePath}`);
    const errorMessage = await shell.openPath(safePath);
    return errorMessage;
  });

  createIpcMainHandler(
    IpcChannels.SHELL_OPEN_EXTERNAL,
    async (_event, request) => {
      if (!isSafeExternalUrl(request.url)) {
        logMessage(
          `Refusing SHELL_OPEN_EXTERNAL for unsafe URL: ${String(request.url)}`,
          "warn",
        );
        return;
      }
      logMessage(`Opening external URL: ${request.url}`);
      await shell.openExternal(request.url, request.options);
    },
  );

  createIpcMainHandler(IpcChannels.SHELL_TRASH_ITEM, async (_event, path) => {
    logMessage(`正在移入回收站：${path}`);
    await shell.trashItem(path);
  });

  createIpcMainHandler(IpcChannels.SHELL_BEEP, async () => {
    shell.beep();
  });

  createIpcMainHandler(
    IpcChannels.SHELL_WRITE_SHORTCUT_LINK,
      async (_event, request) => {
      if (process.platform !== "win32") {
        logMessage("快捷方式链接仅支持 Windows", "warn");
        return false;
      }
      logMessage(`正在写入快捷方式：${request.shortcutPath}`);
      return shell.writeShortcutLink(
        request.shortcutPath,
        request.operation || "create",
        request.options || { target: "" },
      );
    },
  );

  createIpcMainHandler(
    IpcChannels.SHELL_READ_SHORTCUT_LINK,
      async (_event, shortcutPath) => {
      if (process.platform !== "win32") {
        logMessage("快捷方式链接仅支持 Windows", "warn");
        throw new Error("快捷方式链接仅支持 Windows");
      }
      logMessage(`正在读取快捷方式：${shortcutPath}`);
      return shell.readShortcutLink(shortcutPath);
    },
  );

  // Settings handlers
  createIpcMainHandler(IpcChannels.SETTINGS_GET_CLOSE_BEHAVIOR, async () => {
    const settings = await readSettingsAsync();
    const action = settings.windowCloseAction as WindowCloseAction | undefined;
    return action || "ask";
  });

  createIpcMainHandler(
    IpcChannels.SETTINGS_SET_CLOSE_BEHAVIOR,
    async (_event, action) => {
      logMessage(`正在设置窗口关闭行为：${action}`);
      updateSetting("windowCloseAction", action);
      emitServerStateChanged();
    },
  );

  // Auto-updates settings handlers (opt-in)
  createIpcMainHandler(IpcChannels.SETTINGS_GET_AUTO_UPDATES, async () => {
    const settings = await readSettingsAsync();
    // Auto-updates are opt-in, default to false
    return settings.autoUpdatesEnabled === true;
  });

  createIpcMainHandler(
    IpcChannels.SETTINGS_SET_AUTO_UPDATES,
    async (_event, enabled) => {
      logMessage(`正在设置自动更新：${enabled}`);
      updateSetting("autoUpdatesEnabled", enabled);
    },
  );

  createIpcMainHandler(IpcChannels.SETTINGS_GET_UPDATE_CHANNEL, async () => {
    const settings = await readSettingsAsync();
    return getUpdateChannel(settings, app.getVersion());
  });

  createIpcMainHandler(
    IpcChannels.SETTINGS_SET_UPDATE_CHANNEL,
    async (_event, channel) => {
      const nextChannel = normalizeUpdateChannel(channel);
      if (!nextChannel) {
        throw new Error(`更新频道无效：${String(channel)}`);
      }
      logMessage(`正在设置更新频道：${nextChannel}`);
      return setUpdateChannel(nextChannel);
    },
  );

  createIpcMainHandler(
    IpcChannels.SETTINGS_GET_MODEL_SERVICES_STARTUP,
    async () => {
      const settings = await readSettingsAsync();
      return getModelServiceStartupSettings(settings);
    },
  );

  createIpcMainHandler(
    IpcChannels.SETTINGS_SET_MODEL_SERVICES_STARTUP,
    async (_event, update) => {
      logMessage(
        `正在更新模型服务启动设置：${JSON.stringify(update)}`
      );
      const next = updateModelServiceStartupSettings(update);
      emitServerStateChanged();
      return next;
    },
  );

  // Show settings window
  createIpcMainHandler(IpcChannels.SHOW_SETTINGS, async () => {
    logMessage("正在打开设置窗口");
    createSettingsWindow();
  });

  createIpcMainHandler(IpcChannels.GET_SYSTEM_INFO, async () => {
    const { getSystemInfo } = await import("./systemInfo");
    return await getSystemInfo();
  });

  // Dialog handlers for native file/folder selection
  createIpcMainHandler(
    IpcChannels.DIALOG_OPEN_FILE,
    async (_event, request) => {
      logMessage("正在打开原生文件选择对话框");
      const properties: ("openFile" | "multiSelections")[] = ["openFile"];
      if (request.multiSelections) {
        properties.push("multiSelections");
      }

      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: request.title || "选择文件",
        defaultPath: request.defaultPath,
        filters: request.filters,
        properties,
      });

      return { canceled, filePaths };
    },
  );

  createIpcMainHandler(
    IpcChannels.DIALOG_OPEN_FOLDER,
    async (_event, request) => {
      logMessage("正在打开原生文件夹选择对话框");
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: request.title || "选择文件夹",
        defaultPath: request.defaultPath,
        buttonLabel: request.buttonLabel || "选择文件夹",
        properties: ["openDirectory", "createDirectory"],
      });

      return { canceled, filePaths };
    },
  );

  // The agent runtime moved out of the Electron main process; agent
  // sessions now live on the NodeTool server. The renderer talks directly
  // to the server over the `/ws/agent` WebSocket — no IPC bridge required.
}
