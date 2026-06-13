import React, { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Divider, ContextMenu } from "../ui_primitives";
import ContextMenuItem from "./ContextMenuItem";
import { useNodeContextMenu } from "../../hooks/nodes/useNodeContextMenu";
import GroupRemoveIcon from "@mui/icons-material/GroupRemove";
import SearchIcon from "@mui/icons-material/Search";
import EditIcon from "@mui/icons-material/Edit";
import FilterListIcon from "@mui/icons-material/FilterList";
import DeleteIcon from "@mui/icons-material/Delete";
import SwapHorizIcon from "@mui/icons-material/SwapHoriz";
import BlockIcon from "@mui/icons-material/Block";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PowerSettingsNewIcon from "@mui/icons-material/PowerSettingsNew";
import DataArrayIcon from "@mui/icons-material/DataArray";
import QueueIcon from "@mui/icons-material/Queue";
import SouthIcon from "@mui/icons-material/South";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import { Node } from "@xyflow/react";
import { NodeData } from "../../stores/NodeData";
import { isDevelopment } from "../../lib/env";
import { useRemoveFromGroup } from "../../hooks/nodes/useRemoveFromGroup";
import { useGroupIntoSubgraph } from "../../hooks/nodes/useGroupIntoSubgraph";
import { useNodes } from "../../contexts/NodeContext";

const NodeContextMenu: React.FC = () => {
  const { t } = useTranslation("nodeMenu");
  const {
    menuPosition,
    closeContextMenu,
    node,
    handlers,
    conditions
  } = useNodeContextMenu();
  const removeFromGroup = useRemoveFromGroup();
  const handleRemoveFromGroup = useCallback(() => {
    removeFromGroup([node as Node<NodeData>]);
  }, [removeFromGroup, node]);

  const groupIntoSubgraph = useGroupIntoSubgraph();
  const getSelectedNodes = useNodes((s) => s.getSelectedNodes);
  const handleGroupIntoSubgraph = useCallback(() => {
    const selected = getSelectedNodes();
    const ids =
      selected.length > 0
        ? selected.map((n) => n.id)
        : node
        ? [node.id]
        : [];
    if (ids.length === 0) return;
    groupIntoSubgraph(ids);
    closeContextMenu();
  }, [groupIntoSubgraph, getSelectedNodes, node, closeContextMenu]);

  const menuItems = [
    conditions.isInGroup && (
      <ContextMenuItem
        key="remove-from-group"
        onClick={handleRemoveFromGroup}
        label={t("removeFromGroup")}
        IconComponent={<GroupRemoveIcon />}
        tooltip={t("removeNodeFromGroup")}
      />
    ),
    <ContextMenuItem
      key="duplicate"
      onClick={handlers.handleDuplicate}
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
    />,
    <ContextMenuItem
      key="duplicate-vertical"
      onClick={handlers.handleDuplicateVertical}
      label={t("duplicateVertical")}
      IconComponent={<SouthIcon />}
      tooltip={
        <div className="tooltip-span">
          <div className="tooltip-title">{t("duplicateVertical")}</div>
          <div className="tooltip-key">
            <kbd>{t("ctrlKey")}</kbd>+<kbd>{t("shiftKey")}</kbd>+<kbd>D</kbd> / <kbd>⌘</kbd>+<kbd>{t("shiftKey")}</kbd>+<kbd>D</kbd>
          </div>
        </div>
      }
    />,
    <ContextMenuItem
      key="run-from-here"
      onClick={handlers.handleRunFromHere}
      label={conditions.isWorkflowRunning ? t("running") : t("runNode")}
      IconComponent={<PlayArrowIcon />}
      tooltip={t("runNodeTooltip")}
      addButtonClassName={conditions.isWorkflowRunning ? "disabled" : ""}
    />,
    <ContextMenuItem
      key="toggle-bypass"
      onClick={handlers.handleToggleBypass}
      label={conditions.isBypassed ? t("enableNode") : t("bypassNode")}
      IconComponent={conditions.isBypassed ? <PowerSettingsNewIcon /> : <BlockIcon />}
      tooltip={
        <div className="tooltip-span">
          <div className="tooltip-title">
            {conditions.isBypassed ? t("enableNode") : t("bypassNode")}
          </div>
          <div className="tooltip-key">
            <kbd>B</kbd>
          </div>
        </div>
      }
    />,
    <ContextMenuItem
      key="toggle-comment"
      onClick={handlers.handleToggleComment}
      label={conditions.hasCommentTitle ? t("removeComment") : t("addComment")}
      IconComponent={<EditIcon />}
      tooltip={
        conditions.hasCommentTitle
          ? t("removeCommentTooltip")
          : t("addCommentTooltip")
      }
    />,
    <ContextMenuItem
      key="group-into-subgraph"
      onClick={handleGroupIntoSubgraph}
      label={t("groupIntoSubgraph")}
      IconComponent={<AccountTreeIcon />}
      tooltip={t("groupIntoSubgraphTooltip")}
    />,
    conditions.canConvertToInput && (
      <ContextMenuItem
        key="convert-to-input"
        onClick={handlers.handleConvertToInput}
        label={t("convertToInputNode")}
        IconComponent={<SwapHorizIcon />}
        tooltip={t("convertConstantToInputTooltip")}
      />
    ),
    conditions.canConvertToConstant && (
      <ContextMenuItem
        key="convert-to-constant"
        onClick={handlers.handleConvertToConstant}
        label={t("convertToConstantNode")}
        IconComponent={<SwapHorizIcon />}
        tooltip={t("convertInputToConstantTooltip")}
      />
    ),
    <ContextMenuItem
      key="show-templates"
      onClick={handlers.handleFindTemplates}
      label={t("showTemplates")}
      IconComponent={<SearchIcon />}
      tooltip={t("findTemplatesUsingNode")}
    />,
    <ContextMenuItem
      key="select-all"
      onClick={handlers.handleSelectAllSameType}
      label={t("selectAllNodes")}
      IconComponent={<FilterListIcon />}
      tooltip={t("selectAllNodesSameType")}
    />,
    <Divider key="divider-before-delete" />,
    <ContextMenuItem
      key="delete-node"
      onClick={handlers.handleDeleteNode}
      label={t("deleteNode")}
      IconComponent={<DeleteIcon />}
      tooltip={t("deleteNodeTooltip")}
    />,
    isDevelopment && <Divider key="dev-divider" />,
    isDevelopment && (
      <ContextMenuItem
        key="copy-nodedata"
        onClick={handlers.handleCopyMetadataToClipboard}
        label={t("copyNodeData")}
        IconComponent={<DataArrayIcon />}
        tooltip={t("copyNodeDataTooltip")}
      />
    )
  ];

  return (
    <ContextMenu
      className="context-menu node-context-menu"
      open={menuPosition !== null}
      onClose={closeContextMenu}
      onContextMenu={(event) => event.preventDefault()}
      position={menuPosition}
      paperSx={{ borderRadius: "var(--rounded-lg)" }}
    >
      {menuItems.filter(Boolean)}
    </ContextMenu>
  );
};

export default memo(NodeContextMenu);
