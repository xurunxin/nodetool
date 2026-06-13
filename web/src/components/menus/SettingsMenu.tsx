/** @jsxImportSource @emotion/react */
// Full-page settings (formerly a Dialog).
import React, { memo, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Tabs,
  Tab,
  useMediaQuery
} from "@mui/material";
import { useTheme } from "@mui/material/styles";
import WarningIcon from "@mui/icons-material/Warning";
import { useSettingsStore } from "../../stores/SettingsStore";
import useAuth from "../../stores/useAuth";
import {
  SearchInput,
  TextInput,
  LabeledSwitch,
  SelectField,
  Text,
  Tooltip,
  EditorButton,
  FlexColumn,
  Box
} from "../ui_primitives";
import ArrowBackRoundedIcon from "@mui/icons-material/ArrowBackRounded";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { isLocalhost, isElectron } from "../../lib/env";
import RemoteSettingsMenuComponent from "./RemoteSettingsMenu";
import useRemoteSettingsStore from "../../stores/RemoteSettingStore";
import FoldersSettings from "./FoldersSettingsMenu";
import AboutMenu from "./AboutMenu";
import {
  APIKeysTabContent,
  APIKeysRightSidebar,
  SecurityNotice
} from "./APIKeysTab";
import {
  getDisplayedSettingGroups,
  settingGroupSlug
} from "./RemoteSettingsMenu";
import ServerNumberSetting from "./ServerNumberSetting";
import { getAboutSidebarSections } from "./aboutSidebarUtils";
import DefaultModelsMenu from "./DefaultModelsMenu";
import MCPSettingsMenu from "./MCPSettingsMenu";
import BrowserExtensionSettingsMenu from "./BrowserExtensionSettingsMenu";
import PackagesMenu from "./PackagesMenu";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useState, useCallback, useEffect, useRef } from "react";
import SettingsSidebar from "./SettingsSidebar";
import useSecretsStore from "../../stores/SecretsStore";
import { settingsStyles } from "./settingsMenuStyles";

// Tab indices. Models, Collections, and Workspaces now live as standalone
// full-screen pages reachable from the logo menu.
const TAB_GENERAL = 0;
const TAB_API_KEYS = 1;
const TAB_INTEGRATIONS = 2;
const aboutTabIndex = 3;
const packagesTabIndex = 4;

const TIME_FORMAT_OPTIONS = [
  { value: "12h", label: "12h" },
  { value: "24h", label: "24h" }
] as const;

interface TabPanelProps {
  children?: React.ReactNode;
  index: number;
  value: number;
}

const TabPanel = React.memo(function TabPanel(props: TabPanelProps) {
  const { children, value, index, ...other } = props;

  return (
    <div
      role="tabpanel"
      hidden={value !== index}
      id={`settings-tabpanel-${index}`}
      aria-labelledby={`settings-tab-${index}`}
      className="tab-panel"
      {...other}
    >
      {value === index && <Box className="tab-panel-content">{children}</Box>}
    </div>
  );
});

interface SearchItemProps {
  /** Lowercased, trimmed search term. Empty string shows everything. */
  search: string;
  /** Free-text the item matches against (label + description keywords). */
  keywords: string;
  id?: string;
  className?: string;
  children?: React.ReactNode;
}

/**
 * A single settings row that hides itself when it doesn't match the current
 * search. Returning null removes it from the DOM so the surrounding
 * `.settings-section`/heading can collapse via CSS `:has()`.
 */
const SearchItem = React.memo(function SearchItem({
  search,
  keywords,
  id,
  className = "settings-item",
  children
}: SearchItemProps) {
  if (search && !keywords.toLowerCase().includes(search)) {
    return null;
  }
  return (
    <div id={id} className={className}>
      {children}
    </div>
  );
});

function SettingsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const session = useAuth((state) => state.session);
  const { t } = useTranslation("settings");
  const updateChannelOptions = useMemo(
    () => [
      { value: "latest", label: t("updateChannelStable") },
      { value: "nightly", label: t("updateChannelNightly") }
    ],
    [t]
  );
  const closeBehaviorOptions = useMemo(
    () => [
      { value: "ask", label: t("closeBehaviorAsk") },
      { value: "quit", label: t("closeBehaviorQuit") },
      { value: "background", label: t("closeBehaviorBackground") }
    ],
    [t]
  );
  const panControlsOptions = useMemo(
    () => [
      { value: "LMB", label: t("panWithLmb") },
      { value: "RMB", label: t("panWithRmb") }
    ],
    [t]
  );
  const selectionModeOptions = useMemo(
    () => [
      { value: "full", label: t("selectionModeFull") },
      { value: "partial", label: t("selectionModePartial") }
    ],
    [t]
  );
  const autosaveIntervalOptions = useMemo(
    () =>
      [1, 5, 10, 15, 30, 60].map((value) => ({
        value,
        label: t("minuteInterval", { count: value })
      })),
    [t]
  );
  const maxVersionsOptions = useMemo(
    () =>
      [10, 25, 50, 100].map((value) => ({
        value,
        label: t("versionCount", { count: value })
      })),
    [t]
  );

  const tabSubtitle = (tab: number): string => {
    switch (tab) {
      case TAB_GENERAL:
        return t("generalSubtitle");
      case TAB_API_KEYS:
        return t("apiKeysSubtitle");
      case TAB_INTEGRATIONS:
        return t("integrationsSubtitle");
      default:
        if (tab === packagesTabIndex) {
          return t("discoverPackagesSubtitle");
        }
        return t("defaultSubtitle");
    }
  };

  const settingsTab = useMemo(() => {
    const raw = Number(searchParams.get("tab") ?? 0);
    if (Number.isNaN(raw)) return 0;
    return Math.min(packagesTabIndex, Math.max(0, raw));
  }, [searchParams]);

  const setGridSnap = useSettingsStore((state) => state.setGridSnap);
  const setConnectionSnap = useSettingsStore(
    (state) => state.setConnectionSnap
  );
  const setPanControls = useSettingsStore((state) => state.setPanControls);
  const setSelectionMode = useSettingsStore((state) => state.setSelectionMode);
  const setTimeFormat = useSettingsStore((state) => state.setTimeFormat);
  const setSelectNodesOnDrag = useSettingsStore(
    (state) => state.setSelectNodesOnDrag
  );
  const setShowWelcomeOnStartup = useSettingsStore(
    (state) => state.setShowWelcomeOnStartup
  );
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const setSoundNotifications = useSettingsStore(
    (state) => state.setSoundNotifications
  );
  const updateAutosaveSettings = useSettingsStore(
    (state) => state.updateAutosaveSettings
  );
  const updateSettings = useSettingsStore((state) => state.updateSettings);
  const settings = useSettingsStore((state) => state.settings);
  const [apiSearchTerm, setApiSearchTerm] = useState("");
  const [generalSearchTerm, setGeneralSearchTerm] = useState("");
  const generalSearch = generalSearchTerm.toLowerCase().trim();
  // Sections/components that aren't individual settings rows still need to hide
  // when they don't match the search.
  const generalMatches = useCallback(
    (keywords: string) =>
      !generalSearch || keywords.toLowerCase().includes(generalSearch),
    [generalSearch]
  );

  const [activeSection, setActiveSection] = useState("editor");
  const [, setSecretsUpdated] = useState({});
  const settingsContentRef = useRef<HTMLDivElement | null>(null);
  const [closeBehavior, setCloseBehavior] = useState<
    "ask" | "quit" | "background"
  >("ask");
  const [autoUpdatesEnabled, setAutoUpdatesEnabled] = useState(false);
  const [updateChannel, setUpdateChannel] = useState<"latest" | "nightly">("latest");
  const desktopUpdateSettingsApi = useMemo(() => {
    // `isElectron` and `window.api` are static for the lifetime of the renderer session.
    if (!isElectron) {
      return null;
    }

    const api = window.api?.settings;
    if (
      !api ||
      typeof api.getAutoUpdates !== "function" ||
      typeof api.setAutoUpdates !== "function" ||
      typeof api.getUpdateChannel !== "function" ||
      typeof api.setUpdateChannel !== "function"
    ) {
      return null;
    }

    const getAutoUpdates = api.getAutoUpdates;
    const setAutoUpdates = api.setAutoUpdates;
    const getUpdateChannel = api.getUpdateChannel;
    const setUpdateChannel = api.setUpdateChannel;

    return {
      getAutoUpdates: () => getAutoUpdates(),
      setAutoUpdates: (enabled: boolean) => setAutoUpdates(enabled),
      getUpdateChannel: () => getUpdateChannel(),
      setUpdateChannel: (channel: "latest" | "nightly") =>
        setUpdateChannel(channel),
    };
  }, []);
  const supportsDesktopUpdateSettings = desktopUpdateSettingsApi !== null;

  // Load close behavior setting on mount (Electron only)
  useEffect(() => {
    if (isElectron && window.api?.settings?.getCloseBehavior) {
      window.api.settings
        .getCloseBehavior()
        .then((action: "ask" | "quit" | "background") => {
          setCloseBehavior(action);
        });
    }
    if (supportsDesktopUpdateSettings) {
      desktopUpdateSettingsApi
        .getAutoUpdates()
        .then(setAutoUpdatesEnabled)
        .catch((error: unknown) => {
          console.error("Failed to load desktop auto-update setting:", error);
        });
      desktopUpdateSettingsApi
        .getUpdateChannel()
        .then(setUpdateChannel)
        .catch((error: unknown) => {
          console.error("Failed to load desktop update channel:", error);
        });
    }
  }, [desktopUpdateSettingsApi, supportsDesktopUpdateSettings]);

  const handleCloseBehaviorChange = useCallback(
    (action: "ask" | "quit" | "background") => {
      setCloseBehavior(action);
      if (window.api?.settings?.setCloseBehavior) {
        window.api.settings.setCloseBehavior(action);
      }
    },
    []
  );

  const handleAutoUpdatesChange = useCallback((checked: boolean) => {
    if (!supportsDesktopUpdateSettings) {
      return;
    }
    const previousValue = autoUpdatesEnabled;
    setAutoUpdatesEnabled(checked);
    void desktopUpdateSettingsApi.setAutoUpdates(checked).catch((error: unknown) => {
      setAutoUpdatesEnabled(previousValue);
      console.error("Failed to update desktop auto-update setting:", error);
      addNotification({
        type: "error",
        alert: true,
        content: t("failedAutomaticUpdatePreference")
      });
    });
  }, [addNotification, autoUpdatesEnabled, desktopUpdateSettingsApi, supportsDesktopUpdateSettings, t]);

  const handleUpdateChannelChange = useCallback((value: string) => {
    if (!supportsDesktopUpdateSettings) {
      return;
    }
    const channel = value === "nightly" ? "nightly" : "latest";
    const previousChannel = updateChannel;
    setUpdateChannel(channel);
    void desktopUpdateSettingsApi
      .setUpdateChannel(channel)
      .catch((error: unknown) => {
        setUpdateChannel(previousChannel);
        console.error("Failed to update desktop update channel:", error);
        addNotification({
          type: "error",
          alert: true,
          content: t("failedUpdateChannelPreference")
        });
      });
  }, [addNotification, desktopUpdateSettingsApi, supportsDesktopUpdateSettings, t, updateChannel]);

  // Subscribe to secrets store changes to update sidebar when secrets are modified
  useEffect(() => {
    const unsubscribe = useSecretsStore.subscribe(() => setSecretsUpdated({}));
    return unsubscribe;
  }, []);

  const handleTabChange = useCallback(
    (_event: React.SyntheticEvent, newValue: number) => {
      const next = new URLSearchParams(searchParams);
      next.set("tab", String(newValue));
      setSearchParams(next, { replace: true });
      setApiSearchTerm("");
      setGeneralSearchTerm("");
    },
    [searchParams, setSearchParams]
  );

  // Memoized handlers for settings controls to prevent re-renders
  const handleShowWelcomeChange = useCallback(
    (checked: boolean) => {
      setShowWelcomeOnStartup(checked);
    },
    [setShowWelcomeOnStartup]
  );

  const handleSelectNodesOnDragChange = useCallback(
    (checked: boolean) => {
      setSelectNodesOnDrag(checked);
    },
    [setSelectNodesOnDrag]
  );

  const handleSoundNotificationsChange = useCallback(
    (checked: boolean) => {
      setSoundNotifications(checked);
    },
    [setSoundNotifications]
  );

  const handleGridSnapChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setGridSnap(Number(e.target.value));
    },
    [setGridSnap]
  );

  const handleConnectionSnapChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setConnectionSnap(Number(e.target.value));
    },
    [setConnectionSnap]
  );

  const handlePanControlsChange = useCallback(
    (value: string) => {
      setPanControls(value);
    },
    [setPanControls]
  );

  const handleSelectionModeChange = useCallback(
    (value: string) => {
      setSelectionMode(value);
    },
    [setSelectionMode]
  );

  const handleTimeFormatChange = useCallback(
    (value: string) => {
      setTimeFormat(value === "12h" ? "12h" : "24h");
    },
    [setTimeFormat]
  );
  const handleClose = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  const copyAuthToken = async () => {
    const accessToken = session?.access_token;
    if (accessToken) {
      try {
        await navigator.clipboard.writeText(accessToken);
        addNotification({
          type: "info",
          alert: true,
          content: t("nodetoolApiTokenCopied")
        });
      } catch (error) {
        console.error("Failed to copy to clipboard:", error);
        addNotification({
          type: "error",
          alert: true,
          content: t("failedCopyToken")
        });
      }
    }
  };

  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);

    // Scope scrolling to this component's visible tab panel.
    requestAnimationFrame(() => {
      const container = settingsContentRef.current;
      if (!container) {
        return;
      }

      const activePanel = container.querySelector<HTMLElement>(
        ".tab-panel:not([hidden])"
      );
      const safeId = CSS.escape(sectionId);
      const target =
        activePanel?.querySelector<HTMLElement>(`#${safeId}`) ??
        container.querySelector<HTMLElement>(`#${safeId}`);

      if (!target) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const topOffset = 20;
      const top =
        container.scrollTop + targetRect.top - containerRect.top - topOffset;

      container.scrollTo({
        top: Math.max(top, 0),
        behavior: "smooth"
      });
    });
  };

  // Tab 0: General sidebar folders — every section listed, in page order.
  const generalSidebarSections = [
    {
      category: t("workspace"),
      items: [
        { id: "editor", label: t("editor") },
        ...(isElectron ? [{ id: "updates", label: t("updates") }] : [])
      ]
    },
    {
      category: t("execution"),
      items: [{ id: "execution", label: t("execution") }]
    },
    {
      category: t("canvas"),
      items: [{ id: "canvas-navigation", label: t("canvasNavigation") }]
    },
    {
      category: t("ai"),
      items: [{ id: "default-models", label: t("defaultModels") }]
    },
    {
      category: t("history"),
      items: [
        { id: "autosave", label: t("autosave") },
        { id: "appearance", label: t("appearance") }
      ]
    }
  ];

  // Subscribe to store data so the Integrations sidebar mirrors the live
  // (registry-driven) list of setting groups rendered in the panel.
  const remoteSettings = useRemoteSettingsStore((state) => state.settings);
  const secrets = useSecretsStore((state) => state.secrets);
  void secrets;

  // Tab 2: Integrations sidebar folders — Configuration lists every group the
  // generic settings panel renders, so the sidebar shows all items.
  const integrationsSidebarSections = useMemo(() => {
    const configItems = [
      { id: "api-settings", label: t("apiSettings") },
      { id: "huggingface-oauth", label: "HuggingFace" },
      { id: "search-provider", label: t("searchProvider") },
      ...getDisplayedSettingGroups(remoteSettings ?? []).map((group) => ({
        id: settingGroupSlug(group),
        label: group
      }))
    ];
    return [
      ...(session?.access_token && !isLocalhost
        ? [
            {
              category: t("credentials"),
              items: [
                { id: "nodetool-api-token", label: t("nodetoolApiToken") }
              ]
            }
          ]
        : []),
      { category: t("configuration"), items: configItems },
      ...(isLocalhost
        ? [
            {
              category: t("servers"),
              items: [
                { id: "mcp-integration", label: t("mcpServers") },
                { id: "browser-extension", label: t("browserExtension") }
              ]
            }
          ]
        : []),
      { category: t("storage"), items: [{ id: "folders", label: t("folders") }] }
    ];
  }, [remoteSettings, session?.access_token, t]);

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  return (
    <FlexColumn
      className={`settings-page${isMobile ? " settings-page--mobile" : ""}`}
      sx={{
        flex: 1,
        minHeight: 0,
        backgroundColor: theme.vars.palette.background.default
      }}
    >
      <Box css={settingsStyles(theme)} sx={{ flex: 1, minHeight: 0 }}>
        <header className="settings-page-header">
          <EditorButton
            className="settings-back"
            density="normal"
            onClick={handleClose}
            startIcon={<ArrowBackRoundedIcon sx={{ fontSize: 16 }} />}
            aria-label={t("back")}
          >
            {t("back")}
          </EditorButton>
          <div className="settings-page-header__titles">
            <h1 className="settings-page-header__title">{t("title")}</h1>
            <p className="settings-page-header__subtitle">
              {settingsTab === aboutTabIndex
                ? t("aboutApplication")
                : tabSubtitle(settingsTab)}
            </p>
          </div>
        </header>

          <div className="settings-menu">
            <div className="sticky-header">
              <Tabs
                value={settingsTab}
                onChange={handleTabChange}
                className="settings-tabs"
                aria-label={t("settingsTabs")}
              >
                <Tab label={t("general")} id="settings-tab-0" />
                <Tab label={t("apiKeys")} id="settings-tab-1" />
                <Tab label={t("integrations")} id="settings-tab-2" />
                <Tab label={t("about")} id={`settings-tab-${aboutTabIndex}`} />
                <Tab label={t("packages")} id={`settings-tab-${packagesTabIndex}`} />
              </Tabs>
            </div>

            <div className={`settings-container${settingsTab === TAB_API_KEYS && !isMobile ? " settings-container--api-keys" : ""}`}>
              {!isMobile &&
                (settingsTab === TAB_GENERAL ||
                  settingsTab === TAB_INTEGRATIONS ||
                  settingsTab === aboutTabIndex) && (
                  <SettingsSidebar
                    key={`sidebar-${settingsTab}`}
                    activeSection={activeSection}
                    sections={
                      settingsTab === TAB_GENERAL
                        ? generalSidebarSections
                        : settingsTab === TAB_INTEGRATIONS
                          ? integrationsSidebarSections
                          : settingsTab === aboutTabIndex
                            ? getAboutSidebarSections()
                            : []
                    }
                    onSectionClick={scrollToSection}
                  />
                )}

              <div
                className={`settings-content${
                  settingsTab === packagesTabIndex
                    ? " settings-content--full"
                    : ""
                }${settingsTab === TAB_API_KEYS ? " settings-content--api-keys" : ""}`}
                ref={settingsContentRef}
              >
                {/* Tab 0: General */}
                <TabPanel value={settingsTab} index={TAB_GENERAL}>
                  <div style={{ marginBottom: "1.5em" }}>
                    <SearchInput
                      placeholder={t("searchSettings")}
                      value={generalSearchTerm}
                      onChange={setGeneralSearchTerm}
                      size="small"
                      showClear
                    />
                  </div>
                  <div className="general-settings">
                    <div className="settings-section">
                      <Text size="big" id="editor" className="settings-heading">
                        {t("editor")}
                      </Text>
                      <SearchItem
                        search={generalSearch}
                        keywords="editor workspace show welcome screen startup"
                      >
                        <LabeledSwitch
                          label={t("showWelcomeScreen")}
                          checked={!!settings.showWelcomeOnStartup}
                          onChange={handleShowWelcomeChange}
                          description={t("showWelcomeScreenDescription")}
                        />
                      </SearchItem>

                      <SearchItem
                        search={generalSearch}
                        keywords="editor workspace select nodes on drag selection"
                      >
                        <LabeledSwitch
                          label={t("selectNodesOnDrag")}
                          checked={!!settings.selectNodesOnDrag}
                          onChange={handleSelectNodesOnDragChange}
                        />
                        <Text className="description">
                          {t("selectNodesOnDragDescription")}
                          <br />
                          {t("selectNodesOnDragDisabledDescription")}
                        </Text>
                      </SearchItem>

                      {isElectron && (
                        <SearchItem
                          search={generalSearch}
                          keywords="editor workspace sound notifications beep"
                        >
                          <LabeledSwitch
                            label={t("soundNotifications")}
                            checked={!!settings.soundNotifications}
                            onChange={handleSoundNotificationsChange}
                            description={t("soundNotificationsDescription")}
                          />
                        </SearchItem>
                      )}

                      {supportsDesktopUpdateSettings && (
                        <SearchItem
                          search={generalSearch}
                          keywords="editor workspace updates automatic desktop"
                        >
                          <LabeledSwitch
                            label={t("automaticUpdates")}
                            checked={autoUpdatesEnabled}
                            onChange={handleAutoUpdatesChange}
                            description={t("automaticUpdatesDescription")}
                          />
                        </SearchItem>
                      )}

                      {supportsDesktopUpdateSettings && (
                        <SearchItem
                          search={generalSearch}
                          id="updates"
                          keywords="editor workspace update channel stable nightly"
                        >
                          <SelectField
                            label={t("updateChannel")}
                            value={updateChannel}
                            variant="standard"
                            onChange={handleUpdateChannelChange}
                            options={updateChannelOptions}
                          />
                          <Text className="description">
                            {t("updateChannelDescription")}
                          </Text>
                        </SearchItem>
                      )}

                      {isElectron && (
                        <SearchItem
                          search={generalSearch}
                          keywords="editor workspace on close behavior quit background tray"
                        >
                          <SelectField
                            label={t("onCloseBehavior")}
                            value={closeBehavior}
                            variant="standard"
                            onChange={(v) =>
                              handleCloseBehaviorChange(
                                v as "ask" | "quit" | "background"
                              )
                            }
                            options={closeBehaviorOptions}
                          />
                          <Text className="description">
                            {t("closeBehaviorDescription")}
                            <br />
                            <b>{t("closeBehaviorAsk")}:</b>{" "}
                            {t("closeBehaviorAskDescription")}
                            <br />
                            <b>{t("closeBehaviorQuitShort")}:</b>{" "}
                            {t("closeBehaviorQuitDescription")}
                            <br />
                            <b>{t("closeBehaviorBackgroundShort")}:</b>{" "}
                            {t("closeBehaviorBackgroundDescription")}
                          </Text>
                        </SearchItem>
                      )}
                    </div>

                    <div className="settings-section">
                      <Text
                        size="big"
                        id="execution"
                        className="settings-heading"
                      >
                        {t("execution")}
                      </Text>
                      <SearchItem
                        search={generalSearch}
                        keywords="execution warn before large runs confirmation"
                      >
                        <LabeledSwitch
                          label={t("warnBeforeLargeRuns")}
                          checked={settings.confirmLargeRun ?? true}
                          onChange={(checked) =>
                            updateSettings({ confirmLargeRun: checked })
                          }
                          description={t("warnBeforeLargeRunsDescription")}
                        />
                      </SearchItem>

                      <SearchItem
                        search={generalSearch}
                        keywords="execution large-run threshold"
                      >
                        <TextInput
                          type="number"
                          autoComplete="off"
                          slotProps={{ htmlInput: { min: 1, max: 100 } }}
                          id="large-run-threshold-input"
                          label={t("largeRunThreshold")}
                          value={settings.largeRunThreshold ?? 5}
                          onChange={(e) =>
                            updateSettings({
                              largeRunThreshold: Math.max(
                                1,
                                Number(e.target.value) || 1
                              )
                            })
                          }
                          variant="standard"
                          size="small"
                          disabled={!(settings.confirmLargeRun ?? true)}
                        />
                        <Text className="description">
                          {t("largeRunThresholdDescription")}
                        </Text>
                      </SearchItem>

                      <SearchItem
                        search={generalSearch}
                        keywords="audio buffer latency realtime synth playback dropout"
                      >
                        <TextInput
                          type="number"
                          autoComplete="off"
                          slotProps={{ htmlInput: { min: 20, max: 1000, step: 10 } }}
                          id="audio-buffer-ms-input"
                          label="Audio Buffer (ms)"
                          value={settings.audioBufferMs ?? 100}
                          onChange={(e) =>
                            updateSettings({
                              audioBufferMs: Math.min(
                                1000,
                                Math.max(20, Number(e.target.value) || 100)
                              )
                            })
                          }
                          variant="standard"
                          size="small"
                        />
                        <Text className="description">
                          Playback buffer for realtime audio (modular synth
                          patches). Lower values reduce knob-to-ear latency;
                          higher values prevent dropouts when the editor is
                          busy.
                        </Text>
                      </SearchItem>

                      <SearchItem
                        search={generalSearch}
                        keywords="execution max concurrent jobs runs queue concurrency parallel"
                      >
                        <ServerNumberSetting
                          envVar="MAX_CONCURRENT_JOBS"
                          label={t("maxConcurrentRuns")}
                          defaultValue={4}
                          min={1}
                          max={64}
                          description={t("maxConcurrentRunsDescription")}
                        />
                      </SearchItem>

                      <SearchItem
                        search={generalSearch}
                        keywords="execution max concurrent runs per workflow same queue concurrency parallel"
                      >
                        <ServerNumberSetting
                          envVar="MAX_CONCURRENT_RUNS_PER_WORKFLOW"
                          label={t("maxConcurrentRunsPerWorkflow")}
                          defaultValue={4}
                          min={1}
                          max={64}
                          description={t(
                            "maxConcurrentRunsPerWorkflowDescription"
                          )}
                        />
                      </SearchItem>
                    </div>

                    <div className="settings-section">
                      <Text
                        size="big"
                        id="canvas-navigation"
                        className="settings-heading"
                      >
                        {t("canvasNavigation")}
                      </Text>
                      <SearchItem
                        search={generalSearch}
                        keywords="canvas navigation pan controls mouse"
                      >
                        <SelectField
                          label={t("panControls")}
                          value={settings.panControls}
                          variant="standard"
                          onChange={handlePanControlsChange}
                          options={panControlsOptions}
                        />
                        <div className="description">
                          <Text>{t("panControlsDescription")}</Text>
                          <Text>{t("panControlsRmbDescription")}</Text>
                        </div>
                      </SearchItem>

                      <SearchItem
                        search={generalSearch}
                        keywords="canvas navigation node selection mode full partial"
                      >
                        <SelectField
                          label={t("nodeSelectionMode")}
                          value={settings.selectionMode}
                          variant="standard"
                          onChange={handleSelectionModeChange}
                          options={selectionModeOptions}
                        />
                        <Text className="description">
                          {t("nodeSelectionModeDescription")}
                          <br />
                          <b>{t("selectionModeFull")}:</b>{" "}
                          {t("selectionModeFullDescription")}
                          <br />
                          <b>{t("selectionModePartial")}:</b>{" "}
                          {t("selectionModePartialDescription")}
                        </Text>
                      </SearchItem>

                      <SearchItem
                        search={generalSearch}
                        keywords="canvas navigation grid snap precision"
                      >
                        <TextInput
                          type="number"
                          autoComplete="off"
                          slotProps={{ htmlInput: { min: 1, max: 100 } }}
                          id="grid-snap-input"
                          label={t("gridSnapPrecision")}
                          value={settings.gridSnap}
                          onChange={handleGridSnapChange}
                          variant="standard"
                          size="small"
                        />
                        <Text className="description">
                          {t("gridSnapPrecisionDescription")}
                        </Text>
                      </SearchItem>

                      <SearchItem
                        search={generalSearch}
                        keywords="canvas navigation connection snap range"
                      >
                        <TextInput
                          type="number"
                          autoComplete="off"
                          slotProps={{ htmlInput: { min: 5, max: 30 } }}
                          id="connection-snap-input"
                          label={t("connectionSnapRange")}
                          value={settings.connectionSnap}
                          onChange={handleConnectionSnapChange}
                          variant="standard"
                          size="small"
                        />
                        <Text className="description">
                          {t("connectionSnapRangeDescription")}
                        </Text>
                      </SearchItem>
                    </div>

                    {generalMatches("ai default models provider") && (
                      <DefaultModelsMenu />
                    )}

                    <div className="settings-section">
                      <Text
                        size="big"
                        id="autosave"
                        className="settings-heading"
                      >
                        {t("autosaveVersionHistory")}
                      </Text>
                      <SearchItem
                        search={generalSearch}
                        keywords="autosave version history enable"
                      >
                        <LabeledSwitch
                          label={t("enableAutosave")}
                          checked={settings.autosave?.enabled ?? true}
                          onChange={(checked) =>
                            updateAutosaveSettings({ enabled: checked })
                          }
                          description={t("enableAutosaveDescription")}
                        />
                      </SearchItem>

                      <SearchItem
                        search={generalSearch}
                        keywords="autosave version history interval minutes"
                      >
                        <SelectField
                          label={t("autosaveIntervalMinutes")}
                          value={settings.autosave?.intervalMinutes ?? 10}
                          variant="standard"
                          onChange={(v) =>
                            updateAutosaveSettings({
                              intervalMinutes: Number(v)
                            })
                          }
                          options={autosaveIntervalOptions}
                          disabled={!settings.autosave?.enabled}
                          description={t("autosaveIntervalDescription")}
                        />
                      </SearchItem>

                      <SearchItem
                        search={generalSearch}
                        keywords="autosave version history save before running checkpoint"
                      >
                        <LabeledSwitch
                          label={t("saveBeforeRunning")}
                          checked={settings.autosave?.saveBeforeRun ?? true}
                          onChange={(checked) =>
                            updateAutosaveSettings({
                              saveBeforeRun: checked
                            })
                          }
                          description={t("saveBeforeRunningDescription")}
                        />
                      </SearchItem>

                      <SearchItem
                        search={generalSearch}
                        keywords="autosave version history save on window close"
                      >
                        <LabeledSwitch
                          label={t("saveOnWindowClose")}
                          checked={settings.autosave?.saveOnClose ?? true}
                          onChange={(checked) =>
                            updateAutosaveSettings({
                              saveOnClose: checked
                            })
                          }
                          description={t("saveOnWindowCloseDescription")}
                        />
                      </SearchItem>

                      <SearchItem
                        search={generalSearch}
                        keywords="autosave version history max versions per workflow"
                      >
                        <SelectField
                          label={t("maxVersionsPerWorkflow")}
                          value={
                            settings.autosave?.maxVersionsPerWorkflow ?? 50
                          }
                          variant="standard"
                          onChange={(v) =>
                            updateAutosaveSettings({
                              maxVersionsPerWorkflow: Number(v)
                            })
                          }
                          options={maxVersionsOptions}
                          description={t("maxVersionsPerWorkflowDescription")}
                        />
                      </SearchItem>
                    </div>

                    <div className="settings-section">
                      <Text
                        size="big"
                        id="appearance"
                        className="settings-heading"
                      >
                        {t("appearance")}
                      </Text>
                      <SearchItem
                        search={generalSearch}
                        keywords="appearance time format 12h 24h"
                      >
                        <SelectField
                          label={t("timeFormat")}
                          value={settings.timeFormat}
                          variant="standard"
                          onChange={handleTimeFormatChange}
                          options={TIME_FORMAT_OPTIONS}
                          description={t("timeFormatDescription")}
                        />
                      </SearchItem>
                    </div>
                  </div>
                </TabPanel>

                {/* Tab 1: API Keys (provider credentials only) */}
                <TabPanel value={settingsTab} index={TAB_API_KEYS}>
                  <div style={{ marginBottom: "1.5em" }}>
                    <SearchInput
                      placeholder={t("searchProviders")}
                      value={apiSearchTerm}
                      onChange={setApiSearchTerm}
                      size="small"
                      showClear
                    />
                  </div>
                  <APIKeysTabContent searchTerm={apiSearchTerm} />
                  <Box sx={{ marginTop: "1.5em" }}>
                    <SecurityNotice />
                  </Box>
                </TabPanel>

                {/* Tab 2: Integrations (endpoints, MCP, storage, Nodetool API) */}
                <TabPanel value={settingsTab} index={TAB_INTEGRATIONS}>
                  <div className="integrations-settings">
                  {session?.access_token && !isLocalhost && (
                    <>
                      <Text
                        size="big"
                        id="nodetool-api-token"
                        className="settings-heading"
                      >
                        {t("nodetoolApi")}
                      </Text>
                      <Text
                        className="explanation"
                        sx={{ margin: "0 0 1em 0" }}
                      >
                        {t("nodetoolApiExplanation")}
                        <br />
                        <br />
                        <a
                          target="_blank"
                          rel="noopener noreferrer"
                          href="https://github.com/nodetool-ai/nodetool#using-the-workflow-api-"
                        >
                          {t("nodetoolApiDocumentation")} <br />
                        </a>
                      </Text>
                      <div
                        className="settings-section"
                        style={{
                          border:
                            "1px solid" + theme.vars.palette.warning.main,
                          borderRight:
                            "1px solid" + theme.vars.palette.warning.main
                        }}
                      >
                        <Text
                          sx={{
                            fontSize: "var(--fontSizeNormal)",
                            color: theme.palette.text.primary
                          }}
                        >
                          {t("nodetoolApiToken")}
                        </Text>
                        <div className="description">
                          <Text>
                            {t("nodetoolApiTokenDescription")}
                          </Text>
                          <div className="secrets">
                            <WarningIcon
                              sx={{
                                color: (theme) =>
                                  theme.vars.palette.warning.main
                              }}
                            />
                            <Text component="span">
                              {t("nodetoolApiTokenWarning")}
                            </Text>
                          </div>
                        </div>
                        <Tooltip title={t("copyToClipboard")}>
                          <EditorButton
                            style={{ margin: ".5em 0" }}
                            size="small"
                            variant="outlined"
                            startIcon={<ContentCopyIcon />}
                            onClick={copyAuthToken}
                          >
                            {t("copyToken")}
                          </EditorButton>
                        </Tooltip>
                      </div>
                    </>
                  )}

                  <Text
                    size="big"
                    id="api-settings"
                    className="settings-heading"
                  >
                    {t("apiSettings")}
                  </Text>
                  <RemoteSettingsMenuComponent />

                  {isLocalhost && (
                    <>
                      <Text
                        size="big"
                        id="mcp-integration"
                        className="settings-heading"
                      >
                        {t("mcpIntegration")}
                      </Text>
                      <MCPSettingsMenu />

                      <Text
                        size="big"
                        id="browser-extension"
                        className="settings-heading"
                      >
                        {t("browserExtension")}
                      </Text>
                      <BrowserExtensionSettingsMenu />
                    </>
                  )}

                  <Text size="big" id="folders" className="settings-heading">
                    {t("folders")}
                  </Text>
                  <FoldersSettings />
                  </div>
                </TabPanel>

                {/* About */}
                <TabPanel value={settingsTab} index={aboutTabIndex}>
                  <AboutMenu />
                </TabPanel>

                {/* Packages */}
                <TabPanel value={settingsTab} index={packagesTabIndex}>
                  <PackagesMenu />
                </TabPanel>
              </div>

              {settingsTab === TAB_API_KEYS && !isMobile && (
                <APIKeysRightSidebar />
              )}
            </div>
          </div>
      </Box>
    </FlexColumn>
  );
}

export default memo(SettingsPage);
