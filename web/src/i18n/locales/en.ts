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
    automaticUpdates: "Automatic Updates",
    automaticUpdatesDescription:
      "Check for and download desktop app updates from the selected release channel.",
    autosave: "Autosave",
    autosaveIntervalDescription:
      "How often to automatically save your workflow.",
    autosaveIntervalMinutes: "Autosave Interval (minutes)",
    autosaveVersionHistory: "Autosave & Version History",
    back: "Back",
    browserExtension: "Browser Extension",
    canvas: "Canvas",
    canvasNavigation: "Canvas & Navigation",
    closeBehaviorAsk: "Ask Every Time",
    closeBehaviorAskDescription: "Shows a dialog with options.",
    closeBehaviorBackground: "Keep Running in Background",
    closeBehaviorBackgroundDescription:
      "Keeps the app running in the system tray.",
    closeBehaviorBackgroundShort: "Background",
    closeBehaviorDescription:
      "Choose what happens when you close the main window.",
    closeBehaviorQuit: "Quit Application",
    closeBehaviorQuitDescription: "Closes the application completely.",
    closeBehaviorQuitShort: "Quit",
    configuration: "Configuration",
    connectionSnapRange: "Connection Snap Range",
    connectionSnapRangeDescription: "Snap distance for connecting nodes.",
    credentials: "Credentials",
    defaultModels: "Default Models",
    defaultSubtitle: "Manage API keys, providers, and editor preferences.",
    discoverPackagesSubtitle:
      "Discover, trust, and install third-party node packs.",
    editor: "Editor",
    enableAutosave: "Enable Autosave",
    enableAutosaveDescription:
      "Automatically save your workflow at regular intervals.",
    execution: "Execution",
    failedAutomaticUpdatePreference:
      "Failed to save automatic update preference.",
    failedUpdateChannelPreference: "Failed to save update channel preference.",
    folders: "Folders",
    general: "General",
    generalSubtitle: "Editor and workspace preferences.",
    gridSnapPrecision: "Grid Snap Precision",
    gridSnapPrecisionDescription:
      "Snap precision for moving nodes on the canvas.",
    ai: "AI",
    history: "History",
    integrations: "Integrations",
    integrationsSubtitle:
      "Service endpoints, MCP servers, storage, and the Nodetool API.",
    largeRunThreshold: "Large-Run Threshold",
    largeRunThresholdDescription:
      "Warn when a run would execute more than this many model/provider nodes (LLM, image, audio, API, etc.).",
    language: "Language",
    maxConcurrentRuns: "Max Concurrent Runs",
    maxConcurrentRunsDescription:
      "Maximum number of workflow runs you can execute at once. Additional runs queue and start automatically as running ones finish.",
    maxConcurrentRunsPerWorkflow: "Max Concurrent Runs per Workflow",
    maxConcurrentRunsPerWorkflowDescription:
      "How many runs of the same workflow may run at once before further runs queue. Applies to concurrent generation (timeline, sketch); canvas runs always stay sequential.",
    maxVersionsPerWorkflow: "Max Versions per Workflow",
    maxVersionsPerWorkflowDescription:
      "Maximum number of versions to keep per workflow.",
    mcpIntegration: "MCP Integration",
    mcpServers: "MCP Servers",
    minuteInterval_one: "{{count}} minute",
    minuteInterval_other: "{{count}} minutes",
    nodeSelectionMode: "Node Selection Mode",
    nodeSelectionModeDescription:
      "When drawing a selection box for node selections:",
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
    panControls: "Pan Controls",
    panControlsDescription:
      "Move the canvas by dragging with the left or right mouse button.",
    panControlsRmbDescription:
      "With RMB selected, you can also pan with the Middle Mouse Button.",
    panWithLmb: "Pan with LMB",
    panWithRmb: "Pan with RMB",
    copyToClipboard: "Copy to clipboard",
    copyToken: "Copy Token",
    failedCopyToken: "Failed to copy token to clipboard",
    onCloseBehavior: "On Close Behavior",
    saveBeforeRunning: "Save Before Running",
    saveBeforeRunningDescription:
      "Create a checkpoint version before executing workflow.",
    saveOnWindowClose: "Save on Window Close",
    saveOnWindowCloseDescription:
      "Automatically save when closing the tab or window.",
    searchProviders: "Search providers...",
    searchProvider: "Search Provider",
    searchSettings: "Search settings...",
    selectNodesOnDrag: "Select Nodes On Drag",
    selectNodesOnDragDescription:
      "Mark nodes as selected after changing a node's position.",
    selectNodesOnDragDisabledDescription:
      "If disabled, nodes can still be selected by clicking on them.",
    selectionModeFull: "Full",
    selectionModeFullDescription: "nodes have to be fully enclosed.",
    selectionModePartial: "Partial",
    selectionModePartialDescription:
      "intersecting nodes will be selected.",
    servers: "Servers",
    settingsTabs: "settings tabs",
    showWelcomeScreen: "Show Welcome Screen",
    showWelcomeScreenDescription:
      "Show the welcome screen when starting the application.",
    soundNotifications: "Sound Notifications",
    soundNotificationsDescription:
      "Play a system beep sound when workflows complete, exports finish, or other important events occur.",
    storage: "Storage",
    timeFormat: "Time Format",
    timeFormatDescription: "Display time in 12h or 24h format.",
    title: "Settings",
    updateChannel: "Update Channel",
    updateChannelDescription:
      "Stable follows full releases. Nightly follows prerelease nightly builds. Nightly builds default to the Nightly channel.",
    updateChannelNightly: "Nightly",
    updateChannelStable: "Stable",
    updates: "Updates",
    versionCount_one: "{{count}} version",
    versionCount_other: "{{count}} versions",
    warnBeforeLargeRuns: "Warn Before Large Runs",
    warnBeforeLargeRunsDescription:
      "Running a workflow executes every node at once. Show a confirmation when a run would launch many model/provider nodes that could overload an API.",
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
