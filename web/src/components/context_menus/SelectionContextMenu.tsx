import React, { useCallback, useMemo, memo } from "react";
import { useTranslation } from "react-i18next";
import { MenuItem } from "@mui/material";
import { Text, Divider, ContextMenu } from "../ui_primitives";
import ContextMenuItem from "./ContextMenuItem";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
//behaviours
import { useCopyPaste } from "../../hooks/handlers/useCopyPaste";
import { useDuplicateNodes } from "../../hooks/useDuplicate";
import useAlignNodes from "../../hooks/useAlignNodes";
import { useSurroundWithGroup } from "../../hooks/nodes/useSurroundWithGroup";
import { useRemoveFromGroup } from "../../hooks/nodes/useRemoveFromGroup";
import { useSelectConnected } from "../../hooks/useSelectConnected";
//icons
import QueueIcon from "@mui/icons-material/Queue";
import CopyAllIcon from "@mui/icons-material/CopyAll";
import FormatAlignLeftIcon from "@mui/icons-material/FormatAlignLeft";
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";
import GroupWorkIcon from "@mui/icons-material/GroupWork";
import BlockIcon from "@mui/icons-material/Block";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import { useNodes } from "../../contexts/NodeContext";
import isEqual from "fast-deep-equal";
import { shallow } from "zustand/shallow";

interface SelectionContextMenuProps {
  top?: number;
  left?: number;
}

const SelectionContextMenu: React.FC<SelectionContextMenuProps> = () => {
  const { t } = useTranslation("nodeMenu");
  const { handleCopy } = useCopyPaste();
  const { deleteNodes, toggleBypassSelected } = useNodes((state) => ({
    deleteNodes: state.deleteNodes,
    toggleBypassSelected: state.toggleBypassSelected
  }), shallow);
  const duplicateNodes = useDuplicateNodes();
  const alignNodes = useAlignNodes();
  const surroundWithGroup = useSurroundWithGroup();
  const removeFromGroup = useRemoveFromGroup();
  const selectConnectedAll = useSelectConnected({ direction: "both" });
  const selectConnectedInputs = useSelectConnected({ direction: "upstream" });
  const selectConnectedOutputs = useSelectConnected({ direction: "downstream" });
  const menuPosition = useContextMenuStore((state) => state.menuPosition);
  const closeContextMenu = useContextMenuStore(
    (state) => state.closeContextMenu
  );
  // Use simplified selector with custom equality to avoid re-renders during drag operations.
  // Only extract the properties needed by this component and its hooks:
  // - id, parentId, data for context menu logic and hooks
  // - position, measured for useSurroundWithGroup and useRemoveFromGroup hooks
  // This prevents unnecessary re-renders when other node properties change.
  // Note: data reference is stable during position updates, so this is efficient.
  const selectedNodes = useNodes(
    (state) =>
      state.nodes
        .filter((node) => node.selected)
        .map((node) => ({
          id: node.id,
          parentId: node.parentId,
          data: node.data,
          position: node.position,
          measured: node.measured
        })),
    isEqual
  );

  // any has parent
  const anyHasParent = useMemo(() => {
    return selectedNodes.some((node) => node.parentId);
  }, [selectedNodes]);

  // Check if majority of selected nodes are bypassed
  const majorityBypassed = useMemo(() => {
    if (selectedNodes.length === 0) {
      return false;
    }
    const bypassedCount = selectedNodes.filter((n) => n.data.bypassed).length;
    return bypassedCount >= selectedNodes.length / 2;
  }, [selectedNodes]);

  // bypass
  const handleToggleBypass = useCallback(() => {
    toggleBypassSelected();
    closeContextMenu();
  }, [toggleBypassSelected, closeContextMenu]);

  //duplicate
  const handleDuplicateNodes = useCallback(() => {
    duplicateNodes();
  }, [duplicateNodes]);

  //delete
  const handleDelete = useCallback(() => {
    if (selectedNodes?.length) {
      // [PERF] Use batch deletion (deleteNodes) instead of iterating deleteNode(node.id) to avoid O(N) re-renders
      deleteNodes(selectedNodes.map((node) => node.id));
    }
    closeContextMenu();
  }, [closeContextMenu, deleteNodes, selectedNodes]);

  //select connected
  const handleSelectConnectedAll = useCallback(() => {
    selectConnectedAll.selectConnected();
    closeContextMenu();
  }, [selectConnectedAll, closeContextMenu]);

  const handleSelectConnectedInputs = useCallback(() => {
    selectConnectedInputs.selectConnected();
    closeContextMenu();
  }, [selectConnectedInputs, closeContextMenu]);

  const handleSelectConnectedOutputs = useCallback(() => {
    selectConnectedOutputs.selectConnected();
    closeContextMenu();
  }, [selectConnectedOutputs, closeContextMenu]);

  const handleAlignNodes = useCallback(
    (arrangeSpacing: boolean) => {
      alignNodes({ arrangeSpacing });
    },
    [alignNodes]
  );

  const handleSurroundWithGroup = useCallback(() => {
    surroundWithGroup({ selectedNodes });
  }, [surroundWithGroup, selectedNodes]);

  const handleRemoveFromGroup = useCallback(() => {
    removeFromGroup(selectedNodes);
  }, [removeFromGroup, selectedNodes]);

  const handleCopyNodes = useCallback(() => {
    handleCopy();
  }, [handleCopy]);

  const handleAlignNodesFalse = useCallback(() => {
    handleAlignNodes(false);
  }, [handleAlignNodes]);

  const handleAlignNodesTrue = useCallback(() => {
    handleAlignNodes(true);
  }, [handleAlignNodes]);

  if (!menuPosition) {
    return null;
  }
  return (
    <ContextMenu
      className="context-menu selection-context-menu"
      open={menuPosition !== null}
      onClose={closeContextMenu}
      onContextMenu={(event) => event.preventDefault()}
      onClick={(e) => e.stopPropagation()}
      position={menuPosition}
    >
      <MenuItem disabled>
        <Text
          style={{
            margin: ".1em 0",
            padding: "0"
          }}
        >
          {t("selection").toUpperCase()}
        </Text>
      </MenuItem>

      <ContextMenuItem
        onClick={handleDuplicateNodes}
        label={t("duplicate")}
        IconComponent={<QueueIcon />}
        tooltip={
          <div className="tooltip-span">
            <div className="tooltip-title">{t("duplicate")}</div>
            <div className="tooltip-key">
              <kbd>{t("ctrlKey")}</kbd>+<kbd>D</kbd> / <kbd>⌘</kbd>+<kbd>D</kbd>
            </div>
          </div>
        }
      />
      <ContextMenuItem
        onClick={handleCopyNodes}
        label={t("copy")}
        IconComponent={<CopyAllIcon />}
        tooltip={
          <div className="tooltip-span">
            <div className="tooltip-title">{t("copy")}</div>
            <div className="tooltip-key">
              <kbd>{t("ctrlKey")}</kbd>+<kbd>C</kbd> / <kbd>⌘</kbd>+<kbd>C</kbd>
            </div>
          </div>
        }
      />
      {selectedNodes?.length > 1 && (
        <ContextMenuItem
          onClick={handleAlignNodesFalse}
          label={t("align")}
          IconComponent={<FormatAlignLeftIcon />}
          tooltip={
            <div className="tooltip-span">
              <div className="tooltip-title">{t("align")}</div>
              <div className="tooltip-key">
                <kbd>A</kbd>
              </div>
            </div>
          }
        />
      )}
      {selectedNodes?.length > 1 && (
        <ContextMenuItem
          onClick={handleAlignNodesTrue}
          label={t("arrange")}
          IconComponent={<FormatAlignLeftIcon />}
          tooltip={
            <div className="tooltip-span">
              <div className="tooltip-title">{t("arrange")}</div>
              <div className="tooltip-key">
                <kbd>{t("shiftKey")}</kbd>+<kbd>A</kbd>
              </div>
            </div>
          }
        />
      )}

      <ContextMenuItem
        onClick={handleToggleBypass}
        label={majorityBypassed ? t("enableAll") : t("bypassAll")}
        IconComponent={<BlockIcon />}
        tooltip={
          <div className="tooltip-span">
            <div className="tooltip-title">
              {majorityBypassed ? t("enableNodes") : t("bypassNodes")}
            </div>
            <div className="tooltip-key">
              <kbd>B</kbd>
            </div>
          </div>
        }
      />

      {!anyHasParent && (
        <ContextMenuItem
          onClick={handleSurroundWithGroup}
          label={t("surroundWithGroup")}
          IconComponent={<GroupWorkIcon />}
          tooltip={
            <div className="tooltip-span">
              <div className="tooltip-title">{t("surroundWithGroup")}</div>
              <div className="tooltip-key">
                <kbd>{t("ctrlKey")}</kbd>/<kbd>⌘</kbd>+<kbd>G</kbd>
              </div>
            </div>
          }
          addButtonClassName={`action ${
            selectedNodes.length < 1 ? "disabled" : ""
          }`}
        />
      )}

      {anyHasParent && (
        <ContextMenuItem
          onClick={handleRemoveFromGroup}
          label={t("removeFromGroup")}
          IconComponent={<GroupWorkIcon />}
          tooltip={
            <div className="tooltip-span">
              <div className="tooltip-title">{t("removeFromGroup")}</div>
              <div className="tooltip-key">
                <kbd>{t("rightClick")}</kbd>
              </div>
            </div>
          }
          addButtonClassName={`action ${
            selectedNodes.length < 1 ? "disabled" : ""
          }`}
        />
      )}

      <Divider />

      <MenuItem disabled>
        <Text
          style={{
            margin: ".1em 0",
            padding: "0"
          }}
        >
          {t("connected").toUpperCase()}
        </Text>
      </MenuItem>

      <ContextMenuItem
        onClick={handleSelectConnectedAll}
        label={t("selectAllConnected")}
        IconComponent={<CallSplitIcon />}
        tooltip={
          <div className="tooltip-span">
            <div className="tooltip-title">{t("selectAllConnected")}</div>
            <div className="tooltip-key">
              <kbd>{t("shiftKey")}</kbd>+<kbd>C</kbd>
            </div>
          </div>
        }
        addButtonClassName={`action ${
          selectedNodes.length < 1 ? "disabled" : ""
        }`}
      />
      <ContextMenuItem
        onClick={handleSelectConnectedInputs}
        label={t("selectInputs")}
        IconComponent={<ArrowBackIcon />}
        tooltip={
          <div className="tooltip-span">
            <div className="tooltip-title">{t("selectInputs")}</div>
            <div className="tooltip-key">
              <kbd>{t("shiftKey")}</kbd>+<kbd>I</kbd>
            </div>
          </div>
        }
        addButtonClassName={`action ${
          selectedNodes.length < 1 ? "disabled" : ""
        }`}
      />
      <ContextMenuItem
        onClick={handleSelectConnectedOutputs}
        label={t("selectOutputs")}
        IconComponent={<ArrowForwardIcon />}
        tooltip={
          <div className="tooltip-span">
            <div className="tooltip-title">{t("selectOutputs")}</div>
            <div className="tooltip-key">
              <kbd>{t("shiftKey")}</kbd>+<kbd>O</kbd>
            </div>
          </div>
        }
        addButtonClassName={`action ${
          selectedNodes.length < 1 ? "disabled" : ""
        }`}
      />

      <Divider />
      <ContextMenuItem
        onClick={handleDelete}
        label={t("deleteSelected")}
        IconComponent={<RemoveCircleIcon />}
        tooltip={
          <div className="tooltip-span">
            <div className="tooltip-title">{t("deleteSelected")}</div>
            <div className="tooltip-key">
              <kbd>{t("backspaceKey")}</kbd> / <kbd>{t("delKey")}</kbd>
            </div>
          </div>
        }
        addButtonClassName="delete"
      />
    </ContextMenu>
  );
};

export default memo(SelectionContextMenu);
