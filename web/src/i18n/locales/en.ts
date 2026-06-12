export const en = {
  common: {
    cancel: "Cancel",
    delete: "Delete",
    refreshPage: "Refresh Page",
    search: "Search"
  },
  startup: {
    loadingNodeTool: "Loading NodeTool...",
    preparingWorkspace: "Preparing workspace...",
    metadataLoadError: "Error loading application metadata."
  },
  login: {
    tagline: "Node-based AI for text, image, audio & video."
  },
  workspace: {
    empty: "No tabs open - use + to open or create a document."
  },
  navigation: {},
  workflows: {},
  assets: {
    searchAll: "Search all assets",
    searchAllHint: "Search all assets...",
    searchCurrentFolder: "Search current folder",
    searchCurrentFolderHint: "Search current folder...",
    switchToLocalSearch: "Switch to local search",
    switchToGlobalSearch: "Switch to global search",
    clearSearch: "Clear asset search",
    deletePreparing: "Preparing to delete...",
    rootFolderCannotDelete: "Warning: The root folder cannot be deleted.",
    deleteFolderContaining_one: "Delete folder containing {{count}} file?",
    deleteFolderContaining_other: "Delete folder containing {{count}} files?",
    deleteFoldersAndFiles_one:
      "Delete {{folderCount}} folder and {{fileCount}} file containing {{itemCount}} item?",
    deleteFoldersAndFiles_other:
      "Delete {{folderCount}} folders and {{fileCount}} files containing {{itemCount}} items?",
    deleteFiles_one: "Delete {{count}} file?",
    deleteFiles_other: "Delete {{count}} files?",
    deleteTip:
      "You can right click selected assets and download them before deleting."
  },
  models: {},
  chat: {
    newChat: "New Chat",
    startNewChat: "Start a new chat",
    messageInput: "Type your message..."
  },
  settings: {},
  errors: {}
} as const;

type EmptyLocaleObject = Readonly<Record<string, never>>;

type WidenStringLeaves<T> = T extends string
  ? string
  : keyof T extends never
    ? EmptyLocaleObject
    : {
        readonly [Key in keyof T]: WidenStringLeaves<T[Key]>;
      };

export type LocaleResource = WidenStringLeaves<typeof en>;
