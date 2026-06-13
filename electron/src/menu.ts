import { Menu, shell, dialog, clipboard } from "electron";
import { IpcChannels } from "./types.d";
import { getMainWindow } from "./state";
import { createPackageManagerWindow, createLogViewerWindow, createSettingsWindow } from "./window";
import { createChatWindow } from "./workflowWindow";
import { getSystemInfo } from "./systemInfo";
import { openPerformanceMonitorWindow } from "./perfMonitor";

/**
 * Builds the application menu
 */
const buildMenu = () => {
  const mainWindow = getMainWindow();
  if (!mainWindow) {
    return;
  }
  const menu = Menu.buildFromTemplate([
    {
      label: process.platform === "darwin" ? "NodeTool" : "",
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "services" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    {
      label: "文件",
      submenu: [
        {
          label: "保存",
          accelerator: "CmdOrCtrl+S",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "saveWorkflow",
            });
          },
        },
        { type: "separator" },
        {
          label: "新建工作流",
          accelerator: "CmdOrCtrl+T",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "newTab",
            });
          },
        },
        {
          label: "关闭标签页",
          accelerator: "CmdOrCtrl+W",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "close",
            });
          },
        },
      ],
    },
    {
      label: "编辑",
      submenu: [
        {
          label: "撤销",
          accelerator: "CmdOrCtrl+Z",
          role: "undo",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "undo",
            });
          },
        },
        {
          label: "重做",
          accelerator: "Shift+CmdOrCtrl+Z",
          role: "redo",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "redo",
            });
          },
        },
        { type: "separator" },
        {
          label: "剪切",
          accelerator: "CmdOrCtrl+X",
          click: () => {
            // Execute native cut operation first (for text fields)
            mainWindow.webContents.cut();
            // Also send IPC event for custom handling (e.g., node cutting)
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "cut",
            });
          },
        },
        {
          label: "复制",
          accelerator: "CmdOrCtrl+C",
          click: () => {
            // Execute native copy operation first (for text fields)
            mainWindow.webContents.copy();
            // Also send IPC event for custom handling (e.g., node copying)
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "copy",
            });
          },
        },
        {
          label: "粘贴",
          accelerator: "CmdOrCtrl+V",
          click: () => {
            // Execute native paste operation first (for text fields)
            mainWindow.webContents.paste();
            // Also send IPC event for custom handling (e.g., node pasting)
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "paste",
            });
          },
        },
        {
          label: "复制节点",
          accelerator: "CmdOrCtrl+D",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "duplicate",
            });
          },
        },
        {
          label: "垂直复制",
          accelerator: "CmdOrCtrl+Shift+D",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "duplicateVertical",
            });
          },
        },
        {
          label: "分组",
          accelerator: "CmdOrCtrl+G",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "group",
            });
          },
        },
        {
          label: "全选",
          accelerator: "CmdOrCtrl+A",
          role: "selectAll",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "selectAll",
            });
          },
        },
        { type: "separator" },
        {
          label: "对齐",
          accelerator: "CmdOrCtrl+A",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "align",
            });
          },
        },
        {
          label: "等距对齐",
          accelerator: "Shift+CmdOrCtrl+A",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "alignWithSpacing",
            });
          },
        },
      ],
    },
    {
      label: "视图",
      submenu: [
        {
          label: "适配视图",
          accelerator: "CmdOrCtrl+0",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "fitView",
            });
          },
        },
        { type: "separator" },
        {
          label: "重置缩放",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "resetZoom",
            });
          },
        },
        {
          label: "放大",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "zoomIn",
            });
          },
        },
        {
          label: "缩小",
          click: () => {
            mainWindow.webContents.send(IpcChannels.MENU_EVENT, {
              type: "zoomOut",
            });
          },
        },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "工具",
      submenu: [
        {
          label: "聊天",
          click: () => createChatWindow(),
        },
        {
          label: "包管理器",
          click: () => createPackageManagerWindow(),
        },
        {
          label: "日志查看器",
          click: () => createLogViewerWindow(),
        },
        {
          label: "性能监视器",
          click: () => openPerformanceMonitorWindow(),
        },
        { type: "separator" },
        {
          label: "设置",
          click: () => createSettingsWindow(),
        },
      ],
    },
    {
      label: "窗口",
      submenu: [{ role: "minimize" }],
    },
    {
      role: "help",
      submenu: [
        {
          label: "了解更多",
          click: async () => {
            await shell.openExternal("https://nodetool.ai");
          },
        },
        { type: "separator" },
        {
          label: "系统信息",
          click: async () => {
            await showSystemInfoDialog();
          },
        },
      ],
    },
  ]);

  Menu.setApplicationMenu(menu);
};

/**
 * Shows a native dialog with system information
 */
async function showSystemInfoDialog(): Promise<void> {
  const mainWindow = getMainWindow();
  
  try {
    const info = await getSystemInfo();
    
    const message = `NodeTool ${info.appVersion}

应用
  Electron: ${info.electronVersion}
  Chrome: ${info.chromeVersion}
  Node.js: ${info.nodeVersion}

操作系统
  系统: ${info.os}
  版本: ${info.osVersion}
  架构: ${info.arch}

安装路径
  应用: ${info.installPath}
  Conda 环境: ${info.condaEnvPath}
  数据: ${info.dataPath}
  日志: ${info.logsPath}

功能与版本
  Python: ${info.pythonVersion || "不可用"}
  CUDA: ${info.cudaAvailable ? (info.cudaVersion || "可用") : "不可用"}
  Llama Server: ${info.llamaServerInstalled ? (info.llamaServerVersion || "已安装") : "未安装"}`;

    const dialogOptions = {
      type: "info" as const,
      title: "系统信息",
      message: `NodeTool ${info.appVersion}`,
      detail: message,
      buttons: ["确定", "复制到剪贴板"],
    };

    const showDialog = mainWindow 
      ? dialog.showMessageBox(mainWindow, dialogOptions)
      : dialog.showMessageBox(dialogOptions);
    
    const result = await showDialog;
    if (result.response === 1) {
      // Copy to clipboard
      clipboard.writeText(message);
    }
  } catch (error) {
    dialog.showErrorBox("错误", `无法收集系统信息：${error}`);
  }
}

export { buildMenu };
