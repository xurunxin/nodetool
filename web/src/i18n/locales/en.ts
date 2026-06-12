export const en = {
  common: {
    back: "Back",
    cancel: "Cancel",
    delete: "Delete",
    edit: "Edit",
    new: "New",
    refreshPage: "Refresh Page",
    retry: "Retry",
    view: "View",
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
    appMode: "App",
    editMode: "Edit",
    empty: "No tabs open - use + to open or create a document.",
    newTab: "New",
    openOrCreateTab: "Open or create a tab",
    viewMode: "View"
  },
  navigation: {
    agent: "Agent",
    assets: "Assets",
    chat: "Chat",
    closePanel: "Close panel",
    currentWorkspace: "Current workspace",
    dashboard: "Dashboard",
    favorites: "Favorites",
    fullscreen: "Fullscreen",
    goToDashboard: "Go to Dashboard",
    history: "History",
    image: "Image",
    leftPanel: "Left panel",
    models: "Models",
    nodes: "Nodes",
    openInFullChat: "Open in full chat",
    openLeftPanel: "Open left panel",
    resizePanel: "Resize panel",
    returnToImageEditor: "Return to Image Editor",
    returnToTimeline: "Return to Timeline",
    settings: "Settings",
    showAssets: "Show assets",
    showSketches: "Show sketches",
    showTimelines: "Show timelines",
    showWorkflows: "Show workflows",
    sketches: "Sketches",
    timeline: "Timeline",
    timelines: "Timelines",
    togglePanel: "Toggle Panel",
    workflows: "Workflows",
    workflowsAssetsPanel: "Workflows, sketches, timelines, and assets panel",
    workspace: "Workspace"
  },
  workflows: {
    helpImproveTemplates: "Help us improve the templates",
    joinDiscord: "Join our Discord",
    joinForum: "Join the Nodetool Forum",
    letUsKnowMissing: "Let us know what you're missing!",
    loadingTemplates: "Loading Templates",
    newWorkflow: "New Workflow",
    noResultsFor: "Nothing found for",
    run: "Run",
    save: "Save",
    searchingTemplates: "Searching for Templates",
    templates: "Templates",
    exploreTemplates: "Explore Templates"
  },
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
    folderLabel_one: "folder",
    folderLabel_other: "folders",
    fileLabel_one: "file",
    fileLabel_other: "files",
    itemLabel_one: "item",
    itemLabel_other: "items",
    deleteFoldersAndFiles_one:
      "Delete {{folderCount}} {{folderLabel}} and {{fileCount}} {{fileLabel}} containing {{itemCount}} {{itemLabel}}?",
    deleteFoldersAndFiles_other:
      "Delete {{folderCount}} {{folderLabel}} and {{fileCount}} {{fileLabel}} containing {{itemCount}} {{itemLabel}}?",
    deleteFiles_one: "Delete {{count}} file?",
    deleteFiles_other: "Delete {{count}} files?",
    deleteTip:
      "You can right click selected assets and download them before deleting."
  },
  models: {
    downloadManager: "Download Manager",
    localModels: "Local Models",
    managerSubtitle: "Browse, download, and manage local AI models.",
    managerTitle: "Model Manager",
    title: "Models"
  },
  chat: {
    backToEditor: "Back to editor",
    conversations: "Conversations",
    emptyConversation: "Empty conversation",
    failedToLoadThreads: "Failed to load threads: {{message}}",
    loadingChat: "Loading chat...",
    mediaMessage: "[Media message]",
    newChat: "New Chat",
    newConversation: "New conversation",
    openConversations: "Open conversations",
    startNewChat: "Start a new chat",
    threadPreviewLoading: "Loading...",
    messageInput: "Type your message..."
  },
  settings: {
    about: "About",
    aboutApplication: "About this application.",
    apiKeys: "API Keys",
    apiKeysSubtitle: "Provider API keys and credentials.",
    apiSettings: "API Settings",
    appearance: "Appearance",
    autosave: "Autosave",
    back: "Back",
    browserExtension: "Browser Extension",
    canvas: "Canvas",
    canvasNavigation: "Canvas & Navigation",
    configuration: "Configuration",
    credentials: "Credentials",
    defaultModels: "Default Models",
    defaultSubtitle: "Manage API keys, providers, and editor preferences.",
    discoverPackagesSubtitle:
      "Discover, trust, and install third-party node packs.",
    editor: "Editor",
    execution: "Execution",
    failedAutomaticUpdatePreference:
      "Failed to save automatic update preference.",
    failedUpdateChannelPreference: "Failed to save update channel preference.",
    folders: "Folders",
    general: "General",
    generalSubtitle: "Editor and workspace preferences.",
    ai: "AI",
    history: "History",
    integrations: "Integrations",
    integrationsSubtitle:
      "Service endpoints, MCP servers, storage, and the Nodetool API.",
    language: "Language",
    mcpIntegration: "MCP Integration",
    mcpServers: "MCP Servers",
    nodetoolApi: "Nodetool API",
    nodetoolApiDocumentation: "API documentation on GitHub",
    nodetoolApiExplanation:
      "Use the Nodetool API to execute workflows programmatically.",
    nodetoolApiToken: "Nodetool API Token",
    nodetoolApiTokenCopied: "Nodetool API Token copied to Clipboard!",
    nodetoolApiTokenDescription:
      "This token is used to authenticate your account with the Nodetool API.",
    nodetoolApiTokenWarning:
      "Keep this token secure and do not share it publicly",
    packages: "Packages",
    copyToClipboard: "Copy to clipboard",
    copyToken: "Copy Token",
    failedCopyToken: "Failed to copy token to clipboard",
    searchProviders: "Search providers...",
    searchProvider: "Search Provider",
    searchSettings: "Search settings...",
    servers: "Servers",
    settingsTabs: "settings tabs",
    storage: "Storage",
    title: "Settings",
    updates: "Updates",
    workspace: "Workspace"
  },
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
