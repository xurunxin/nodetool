/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { Command, CommandInput } from "cmdk";
import { Workflow, WorkflowList } from "../../stores/ApiTypes";
import { useCallback, useEffect, useState, useRef, memo } from "react";
import { useTranslation } from "react-i18next";
import { Dialog } from "../ui_primitives";
import { getMousePosition } from "../../utils/MousePosition";
import useAlignNodes from "../../hooks/useAlignNodes";
import { useWebsocketRunner } from "../../stores/WorkflowRunner";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { useNotificationStore } from "../../stores/NotificationStore";
import isEqual from "fast-deep-equal";
import React from "react";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  exportWorkflowBundle,
  importWorkflowBundle
} from "../../utils/workflowBundle";
import { useNodes } from "../../contexts/NodeContext";
import { create } from "zustand";
import { shallow } from "zustand/shallow";
import { isDevelopment } from "../../lib/env";
import { useMiniMapStore } from "../../stores/MiniMapStore";
import { useCopyPaste } from "../../hooks/handlers/useCopyPaste";
import { useDuplicateNodes } from "../../hooks/useDuplicate";
import { useSurroundWithGroup } from "../../hooks/nodes/useSurroundWithGroup";
import { useFitView } from "../../hooks/useFitView";
import { useReactFlow } from "@xyflow/react";
import { useSelectionActions } from "../../hooks/useSelectionActions";
import { useFindInWorkflowStore } from "../../stores/FindInWorkflowStore";
import { useRightPanelStore } from "../../stores/RightPanelStore";
import { areNodesEqualIgnoringPosition } from "../../utils/nodeEquality";
import { usePanelStore } from "../../stores/PanelStore";

// Icons — Workflow
import PlayArrowRoundedIcon from "@mui/icons-material/PlayArrowRounded";
import FileDownloadRoundedIcon from "@mui/icons-material/FileDownloadRounded";
import FileUploadRoundedIcon from "@mui/icons-material/FileUploadRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import CancelRoundedIcon from "@mui/icons-material/CancelRounded";
import AutoFixHighRoundedIcon from "@mui/icons-material/AutoFixHighRounded";
import SaveRoundedIcon from "@mui/icons-material/SaveRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import FolderZipRoundedIcon from "@mui/icons-material/FolderZipRounded";

// Icons — Edit
import UndoRoundedIcon from "@mui/icons-material/UndoRounded";
import RedoRoundedIcon from "@mui/icons-material/RedoRounded";
import ContentCutRoundedIcon from "@mui/icons-material/ContentCutRounded";
import ContentPasteRoundedIcon from "@mui/icons-material/ContentPasteRounded";
import FileCopyRoundedIcon from "@mui/icons-material/FileCopyRounded";
import SelectAllRoundedIcon from "@mui/icons-material/SelectAllRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import GroupWorkRoundedIcon from "@mui/icons-material/GroupWorkRounded";
import BlockRoundedIcon from "@mui/icons-material/BlockRounded";
import SearchRoundedIcon from "@mui/icons-material/SearchRounded";

// Icons — Layout & Alignment
import AlignVerticalCenterRoundedIcon from "@mui/icons-material/AlignVerticalCenterRounded";
import SpaceBarRoundedIcon from "@mui/icons-material/SpaceBarRounded";
import AlignHorizontalLeftRoundedIcon from "@mui/icons-material/AlignHorizontalLeftRounded";
import AlignHorizontalCenterRoundedIcon from "@mui/icons-material/AlignHorizontalCenterRounded";
import AlignHorizontalRightRoundedIcon from "@mui/icons-material/AlignHorizontalRightRounded";
import VerticalAlignTopRoundedIcon from "@mui/icons-material/VerticalAlignTopRounded";
import VerticalAlignCenterRoundedIcon from "@mui/icons-material/VerticalAlignCenterRounded";
import VerticalAlignBottomRoundedIcon from "@mui/icons-material/VerticalAlignBottomRounded";
import ViewColumnRoundedIcon from "@mui/icons-material/ViewColumnRounded";

// Icons — View
import MapRoundedIcon from "@mui/icons-material/MapRounded";
import MapOutlinedIcon from "@mui/icons-material/MapOutlined";
import FitScreenRoundedIcon from "@mui/icons-material/FitScreenRounded";
import ZoomInRoundedIcon from "@mui/icons-material/ZoomInRounded";
import ZoomOutRoundedIcon from "@mui/icons-material/ZoomOutRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";

// Icons — Panels
import ChatRoundedIcon from "@mui/icons-material/ChatRounded";
import AccountTreeRoundedIcon from "@mui/icons-material/AccountTreeRounded";
import PermMediaRoundedIcon from "@mui/icons-material/PermMediaRounded";
import InfoRoundedIcon from "@mui/icons-material/InfoRounded";
import SettingsRoundedIcon from "@mui/icons-material/SettingsRounded";

// Icons — Nodes & Workflows list
import FolderOpenRoundedIcon from "@mui/icons-material/FolderOpenRounded";

type CommandMenuProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  undo: (steps?: number | undefined) => void;
  redo: (steps?: number | undefined) => void;
  reactFlowWrapper: React.RefObject<HTMLDivElement | null>;
};

const styles = () =>
  css({
    ".MuiDialog-paper": {
      maxWidth: "800px",
      width: "40vw",
      background: "transparent",
      boxShadow: "none"
    }
  });

const WorkflowCommands = memo(function WorkflowCommands() {
  const { t } = useTranslation("commandMenu");
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
  // Optimization: use shallow equality to prevent the CommandMenu from
  // re-rendering 60 times a second on unrelated node position updates
  const {
    nodes,
    edges,
    currentWorkflow,
    workflowJSON,
    autoLayout
  } = useNodes((state) => ({
    nodes: state.nodes,
    edges: state.edges,
    currentWorkflow: state.workflow,
    workflowJSON: state.workflowJSON,
    autoLayout: state.autoLayout
  }), shallow);
  const run = useWebsocketRunner((state) => state.run);
  const cancel = useWebsocketRunner((state) => state.cancel);
  const { writeClipboard } = useClipboard();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const saveWorkflow = useWorkflowManager((state) => state.saveWorkflow);
  const saveExample = useWorkflowManager((state) => state.saveExample);
  const getCurrentWorkflow = useWorkflowManager((state) => state.getCurrentWorkflow);
  const createNew = useWorkflowManager((state) => state.createNew);
  const removeWorkflow = useWorkflowManager((state) => state.removeWorkflow);
  const openWorkflows = useWorkflowManager((state) => state.openWorkflows);
  const createWorkflow = useWorkflowManager((state) => state.create);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bundleInputRef = useRef<HTMLInputElement>(null);

  const runWorkflow = useCallback(() => {
    run({}, currentWorkflow, nodes, edges);
  }, [run, currentWorkflow, nodes, edges]);

  const downloadWorkflow = useCallback(() => {
    const blob = new Blob([workflowJSON()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.download = `${currentWorkflow.name}.json`;
    link.href = url;
    link.click();
  }, [workflowJSON, currentWorkflow]);

  const copyWorkflow = useCallback(() => {
    writeClipboard(workflowJSON(), true, true);
    addNotification({
      type: "info",
      alert: true,
      content: "Copied workflow JSON to Clipboard!"
    });
  }, [writeClipboard, workflowJSON, addNotification]);

  const handleSave = useCallback(async () => {
    const workflow = getCurrentWorkflow();
    if (workflow) {
      try {
        await saveWorkflow(workflow);
        addNotification({
          content: `Workflow "${workflow.name}" saved`,
          type: "success",
          alert: true
        });
      } catch (error) {
        addNotification({
          content: `Failed to save workflow: ${error instanceof Error ? error.message : "Unknown error"}`,
          type: "error",
          alert: true
        });
      }
    }
  }, [saveWorkflow, getCurrentWorkflow, addNotification]);

  const handleNewWorkflow = useCallback(async () => {
    const newWorkflow = await createNew();
    navigate(`/editor/${newWorkflow.id}`);
  }, [createNew, navigate]);

  const handleCloseWorkflow = useCallback(() => {
    const workflow = getCurrentWorkflow();
    if (workflow) {
      removeWorkflow(workflow.id);
      const remaining = openWorkflows.filter((w) => w.id !== workflow.id);
      if (remaining.length > 0) {
        navigate(`/editor/${remaining[remaining.length - 1].id}`);
      } else {
        navigate("/editor");
      }
    }
  }, [removeWorkflow, getCurrentWorkflow, openWorkflows, navigate]);

  const handleImportWorkflow = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleImportFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text) as Workflow;
        const imported = await createWorkflow({
          name: parsed.name ?? file.name.replace(/\.json$/, ""),
          description: parsed.description ?? "",
          access: "private",
          graph: parsed.graph,
          tags: parsed.tags,
          settings: parsed.settings as Record<string, string | number | boolean | null> | null | undefined,
          run_mode: parsed.run_mode,
          html_app: parsed.html_app
        });
        navigate(`/editor/${imported.id}`);
        addNotification({
          type: "success",
          alert: true,
          content: `Imported workflow "${imported.name}"`
        });
      } catch {
        addNotification({
          type: "error",
          alert: true,
          content: "Failed to import workflow — invalid JSON file"
        });
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    },
    [createWorkflow, navigate, addNotification]
  );

  const exportBundle = useCallback(async () => {
    if (!currentWorkflow?.id) return;
    try {
      await exportWorkflowBundle(currentWorkflow.id, currentWorkflow.name);
    } catch (error) {
      addNotification({
        type: "error",
        alert: true,
        content: `Failed to export bundle: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }
  }, [currentWorkflow, addNotification]);

  const handleImportBundle = useCallback(() => {
    bundleInputRef.current?.click();
  }, []);

  const handleBundleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const result = await importWorkflowBundle(file);
        await queryClient.invalidateQueries({ queryKey: ["workflows"] });
        const first = result.workflows[0];
        if (first) {
          navigate(`/editor/${first.id}`);
        }
        addNotification({
          type: "success",
          alert: true,
          content: `Imported ${result.workflows.length} workflow(s) from bundle`
        });
      } catch (error) {
        addNotification({
          type: "error",
          alert: true,
          content: `Failed to import bundle: ${error instanceof Error ? error.message : "Unknown error"}`
        });
      }
      if (bundleInputRef.current) bundleInputRef.current.value = "";
    },
    [queryClient, navigate, addNotification]
  );

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        aria-label="Import workflow file"
        style={{ display: "none" }}
        onChange={handleImportFileChange}
      />
      <input
        ref={bundleInputRef}
        type="file"
        accept=".nodetool,application/zip"
        aria-label="Import workflow bundle file"
        style={{ display: "none" }}
        onChange={handleBundleFileChange}
      />
    <Command.Group heading={t("workflow")}>
      <Command.Item onSelect={() => executeAndClose(runWorkflow)}>
        <PlayArrowRoundedIcon /> {t("runWorkflow")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(handleSave)}>
        <SaveRoundedIcon /> {t("saveWorkflow")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(handleNewWorkflow)}>
        <AddRoundedIcon /> {t("newWorkflow")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(handleCloseWorkflow)}>
        <CloseRoundedIcon /> {t("closeWorkflow")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(downloadWorkflow)}>
        <FileDownloadRoundedIcon /> {t("downloadWorkflowJson")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(handleImportWorkflow)}>
        <FileUploadRoundedIcon /> {t("importWorkflowJson")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(exportBundle)}>
        <FolderZipRoundedIcon /> {t("exportWorkflowBundle")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(handleImportBundle)}>
        <FolderZipRoundedIcon /> {t("importWorkflowBundle")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(copyWorkflow)}>
        <ContentCopyRoundedIcon /> {t("copyWorkflowJson")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(cancel)}>
        <CancelRoundedIcon /> {t("cancelWorkflow")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(autoLayout)}>
        <AutoFixHighRoundedIcon /> {t("autoLayout")}
      </Command.Item>
      {isDevelopment && (
        <Command.Item onSelect={() => executeAndClose(() => saveExample(""))}>
          <SaveRoundedIcon /> {t("saveAsExample")}
        </Command.Item>
      )}
    </Command.Group>
    </>
  );
});

interface HistoryActions {
  undo: () => void;
  redo: () => void;
}

const EditCommands = memo(function EditCommands({
  undo,
  redo
}: HistoryActions) {
  const { t } = useTranslation("commandMenu");
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
  const { handleCopy, handlePaste, handleCut } = useCopyPaste();
  // Combine multiple useNodes subscriptions into a single selector with shallow equality
  // to reduce unnecessary re-renders when other parts of the node state change
  const { selectAllNodes, toggleBypassSelected } = useNodes(
    (state) => ({
      selectAllNodes: state.selectAllNodes,
      toggleBypassSelected: state.toggleBypassSelected
    }),
    shallow
  );
  const duplicateNodes = useDuplicateNodes();
  const duplicateNodesVertical = useDuplicateNodes(true);
  const selectedNodes = useNodes(
    (state) => state.nodes.filter((node) => node.selected),
    areNodesEqualIgnoringPosition
  );
  const surroundWithGroup = useSurroundWithGroup();
  const selectionActions = useSelectionActions();
  const openFind = useFindInWorkflowStore((state) => state.openFind);

  const handleGroup = useCallback(() => {
    if (selectedNodes.length) {
      surroundWithGroup({ selectedNodes });
    }
  }, [surroundWithGroup, selectedNodes]);

  return (
    <Command.Group heading={t("edit")}>
      <Command.Item onSelect={() => executeAndClose(undo)}>
        <UndoRoundedIcon /> {t("undo")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(redo)}>
        <RedoRoundedIcon /> {t("redo")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(handleCopy)}>
        <FileCopyRoundedIcon /> {t("copy")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(handleCut)}>
        <ContentCutRoundedIcon /> {t("cut")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(handlePaste)}>
        <ContentPasteRoundedIcon /> {t("paste")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(selectAllNodes)}>
        <SelectAllRoundedIcon /> {t("selectAll")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(selectionActions.deleteSelected)}>
        <DeleteRoundedIcon /> {t("deleteSelected")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(duplicateNodes)}>
        <ContentCopyRoundedIcon /> {t("duplicate")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(duplicateNodesVertical)}>
        <ContentCopyRoundedIcon /> {t("duplicateVertical")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(handleGroup)}>
        <GroupWorkRoundedIcon /> {t("groupSelected")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(toggleBypassSelected)}>
        <BlockRoundedIcon /> {t("bypassNode")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(openFind)}>
        <SearchRoundedIcon /> {t("findInWorkflow")}
      </Command.Item>
    </Command.Group>
  );
});

const LayoutCommands = memo(function LayoutCommands() {
  const { t } = useTranslation("commandMenu");
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
  const alignNodes = useAlignNodes();
  const selectionActions = useSelectionActions();

  return (
    <Command.Group heading={t("layoutAndAlignment")}>
      <Command.Item
        onSelect={() =>
          executeAndClose(() => alignNodes({ arrangeSpacing: false }))
        }
      >
        <AlignVerticalCenterRoundedIcon /> {t("alignNodes")}
      </Command.Item>
      <Command.Item
        onSelect={() =>
          executeAndClose(() => alignNodes({ arrangeSpacing: true }))
        }
      >
        <SpaceBarRoundedIcon /> {t("alignNodesWithSpacing")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(selectionActions.alignLeft)}>
        <AlignHorizontalLeftRoundedIcon /> {t("alignLeft")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(selectionActions.alignCenter)}>
        <AlignHorizontalCenterRoundedIcon /> {t("alignCenter")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(selectionActions.alignRight)}>
        <AlignHorizontalRightRoundedIcon /> {t("alignRight")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(selectionActions.alignTop)}>
        <VerticalAlignTopRoundedIcon /> {t("alignTop")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(selectionActions.alignMiddle)}>
        <VerticalAlignCenterRoundedIcon /> {t("alignMiddle")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(selectionActions.alignBottom)}>
        <VerticalAlignBottomRoundedIcon /> {t("alignBottom")}
      </Command.Item>
      <Command.Item onSelect={() => executeAndClose(selectionActions.distributeHorizontal)}>
        <ViewColumnRoundedIcon /> {t("distributeHorizontally")}
      </Command.Item>
    </Command.Group>
  );
});

const ViewCommands = memo(function ViewCommands() {
  const { t } = useTranslation("commandMenu");
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
  const visible = useMiniMapStore((state) => state.visible);
  const toggleVisible = useMiniMapStore((state) => state.toggleVisible);
  const handleFitView = useFitView();
  const reactFlow = useReactFlow();

  return (
    <Command.Group heading={t("view")}>
      <Command.Item
        onSelect={() => executeAndClose(toggleVisible)}
      >
        {visible ? <MapOutlinedIcon /> : <MapRoundedIcon />}
        {visible ? t("hideMiniMap") : t("showMiniMap")}
      </Command.Item>
      <Command.Item
        onSelect={() => executeAndClose(() => handleFitView({ padding: 0.5 }))}
      >
        <FitScreenRoundedIcon /> {t("fitView")}
      </Command.Item>
      <Command.Item
        onSelect={() => executeAndClose(() => reactFlow.zoomIn({ duration: 200 }))}
      >
        <ZoomInRoundedIcon /> {t("zoomIn")}
      </Command.Item>
      <Command.Item
        onSelect={() => executeAndClose(() => reactFlow.zoomOut({ duration: 200 }))}
      >
        <ZoomOutRoundedIcon /> {t("zoomOut")}
      </Command.Item>
      <Command.Item
        onSelect={() => executeAndClose(() => reactFlow.zoomTo(0.5, { duration: 200 }))}
      >
        <RestartAltRoundedIcon /> {t("resetZoom50")}
      </Command.Item>
      <Command.Item
        onSelect={() => executeAndClose(() => reactFlow.zoomTo(1, { duration: 200 }))}
      >
        <ZoomInRoundedIcon /> {t("zoomTo100")}
      </Command.Item>
      <Command.Item
        onSelect={() => executeAndClose(() => reactFlow.zoomTo(2, { duration: 200 }))}
      >
        <ZoomInRoundedIcon /> {t("zoomTo200")}
      </Command.Item>
    </Command.Group>
  );
});

const PanelCommands = memo(function PanelCommands() {
  const { t } = useTranslation("commandMenu");
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
  const rightPanelToggle = useRightPanelStore((state) => state.handleViewChange);
  const leftPanelToggle = usePanelStore((state) => state.handleViewChange);

  return (
    <Command.Group heading={t("panels")}>
      <Command.Item
        onSelect={() => executeAndClose(() => rightPanelToggle("inspector"))}
      >
        <InfoRoundedIcon /> {t("toggleInspector")}
      </Command.Item>
      <Command.Item
        onSelect={() => executeAndClose(() => leftPanelToggle("settings"))}
      >
        <SettingsRoundedIcon /> {t("toggleWorkflowSettings")}
      </Command.Item>
      <Command.Item
        onSelect={() => executeAndClose(() => leftPanelToggle("agent"))}
      >
        <ChatRoundedIcon /> {t("toggleAgent")}
      </Command.Item>
      <Command.Item
        onSelect={() => executeAndClose(() => leftPanelToggle("assets"))}
      >
        <PermMediaRoundedIcon /> {t("toggleAssets")}
      </Command.Item>
      <Command.Item
        onSelect={() => executeAndClose(() => leftPanelToggle("workflows"))}
      >
        <AccountTreeRoundedIcon /> {t("toggleWorkflowsPanel")}
      </Command.Item>
    </Command.Group>
  );
});

const OpenWorkflowCommands = memo(function OpenWorkflowCommands() {
  const { t } = useTranslation("commandMenu");
  const executeAndClose = useCommandMenu((state) => state.executeAndClose);
  const navigate = useNavigate();
  const load = useWorkflowManager((state) => state.load);

  const { data: workflows } = useQuery<WorkflowList>({
    queryKey: ["workflows"],
    queryFn: () => load()
  });

  const openWorkflow = useCallback(
    (workflow: Workflow) => {
      navigate("/editor/" + workflow.id);
    },
    [navigate]
  );

  if (!workflows) { return null; }

  return (
    <Command.Group heading={t("workflows")}>
      {workflows.workflows.map((workflow) => (
        <Command.Item
          key={workflow.id}
          onSelect={() => executeAndClose(() => openWorkflow(workflow))}
        >
          <FolderOpenRoundedIcon /> {workflow.name}
        </Command.Item>
      ))}
    </Command.Group>
  );
});

// Create a context/store for command menu state
const useCommandMenu = create<{
  executeAndClose: (action: () => void) => void;
  reactFlowWrapper: React.RefObject<HTMLDivElement | null>;
}>((_set) => ({
  executeAndClose: () => { },
  reactFlowWrapper: { current: null }
}));

const CommandMenu: React.FC<CommandMenuProps> = ({
  open,
  setOpen,
  undo,
  redo,
  reactFlowWrapper
}) => {
  const { t } = useTranslation("commandMenu");
  const [pastePosition, setPastePosition] = useState({ x: 0, y: 0 });
  const input = useRef<HTMLInputElement>(null);
  const focusInputTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const executeAndClose = useCallback(
    (action: () => void) => {
      action();
      setOpen(false);
    },
    [setOpen]
  );

  // Set up command menu context
  useEffect(() => {
    useCommandMenu.setState({
      executeAndClose,
      reactFlowWrapper
    });
  }, [executeAndClose, reactFlowWrapper]);

  useEffect(() => {
    const focusInput = () => {
      const inputElement = document.querySelector("input[cmdk-input]");
      (inputElement as HTMLInputElement)?.focus();
    };

    if (open) {
      // Clear any existing timeout before setting a new one
      if (focusInputTimeoutRef.current) {
        clearTimeout(focusInputTimeoutRef.current);
      }
      focusInputTimeoutRef.current = setTimeout(focusInput, 0);
    }

    // Cleanup: clear timeout when component unmounts or open changes
    return () => {
      if (focusInputTimeoutRef.current) {
        clearTimeout(focusInputTimeoutRef.current);
      }
    };
  }, [open]);

  // Cleanup timeout on component unmount
  useEffect(() => {
    return () => {
      if (focusInputTimeoutRef.current) {
        clearTimeout(focusInputTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (open) {
      setPastePosition(getMousePosition());
    }
  }, [open, pastePosition]);

  return (
    <Dialog
      open={open}
      onClose={() => setOpen(false)}
      className="command-menu-dialog"
      css={styles()}
    >
      <Command label={t("commandMenu")} className="command-menu">
        <CommandInput ref={input} placeholder={t("searchCommands")} />
        <Command.List>
          <Command.Empty>{t("noResultsFound")}</Command.Empty>
          <WorkflowCommands />
          <EditCommands undo={undo} redo={redo} />
          <LayoutCommands />
          <ViewCommands />
          <PanelCommands />
          <OpenWorkflowCommands />
        </Command.List>
      </Command>
    </Dialog>
  );
};

export default React.memo(CommandMenu, isEqual);
