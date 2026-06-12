import type { LocaleResource } from "./en";

export const zhCN: LocaleResource = {
  common: {
    cancel: "取消",
    delete: "删除",
    refreshPage: "刷新页面",
    search: "搜索"
  },
  startup: {
    loadingNodeTool: "正在加载 NodeTool...",
    preparingWorkspace: "正在准备工作区 Workspace...",
    metadataLoadError: "应用元数据加载失败。"
  },
  login: {
    tagline: "面向文本、图像、音频和视频的节点式 AI。"
  },
  workspace: {
    empty: "当前没有打开的标签页 - 使用 + 打开或创建文档。"
  },
  navigation: {},
  workflows: {},
  assets: {
    searchAll: "搜索所有资产 Asset",
    searchAllHint: "搜索所有资产 Asset...",
    searchCurrentFolder: "搜索当前文件夹",
    searchCurrentFolderHint: "搜索当前文件夹...",
    switchToLocalSearch: "切换到当前文件夹搜索",
    switchToGlobalSearch: "切换到全局资产搜索",
    clearSearch: "清除资产搜索",
    deletePreparing: "正在准备删除...",
    rootFolderCannotDelete: "警告：根文件夹不能删除。",
    deleteFolderContaining_one: "删除包含 {{count}} 个文件的文件夹？",
    deleteFolderContaining_other: "删除包含 {{count}} 个文件的文件夹？",
    folderLabel_one: "个文件夹",
    folderLabel_other: "个文件夹",
    fileLabel_one: "个文件",
    fileLabel_other: "个文件",
    itemLabel_one: "个项目",
    itemLabel_other: "个项目",
    deleteFoldersAndFiles_one:
      "删除 {{folderCount}}{{folderLabel}}和 {{fileCount}}{{fileLabel}}，其中包含 {{itemCount}}{{itemLabel}}？",
    deleteFoldersAndFiles_other:
      "删除 {{folderCount}}{{folderLabel}}和 {{fileCount}}{{fileLabel}}，其中包含 {{itemCount}}{{itemLabel}}？",
    deleteFiles_one: "删除 {{count}} 个文件？",
    deleteFiles_other: "删除 {{count}} 个文件？",
    deleteTip: "删除前可以右键选中的资产 Asset 并下载备份。"
  },
  models: {},
  chat: {
    newChat: "新建聊天 Chat",
    startNewChat: "开始新的聊天 Chat",
    messageInput: "输入消息..."
  },
  settings: {},
  errors: {}
};
