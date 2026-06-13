/** @jsxImportSource @emotion/react */
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useReactFlow } from "@xyflow/react";

import { EditorButton, Text, Divider, FlexRow, ContextMenu } from "../ui_primitives";
import ContextMenuItem from "./ContextMenuItem";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
import { useFavoriteNodesStore } from "../../stores/FavoriteNodesStore";
//icons
import SouthEastIcon from "@mui/icons-material/SouthEast";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import AddCommentIcon from "@mui/icons-material/AddComment";
import GroupWorkIcon from "@mui/icons-material/GroupWork";
import StarIcon from "@mui/icons-material/Star";
import DataObjectIcon from "@mui/icons-material/DataObject";
import InputIcon from "@mui/icons-material/Input";
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
//behaviours
import { useCopyPaste } from "../../hooks/handlers/useCopyPaste";
import { useClipboard } from "../../hooks/browser/useClipboard";
import { useFitView } from "../../hooks/useFitView";
import useMetadataStore from "../../stores/MetadataStore";
import { useNodes } from "../../contexts/NodeContext";
import {
  GROUP_NODE_METADATA,
  COMMENT_NODE_METADATA
} from "../../utils/nodeUtils";
import { getShortcutTooltip } from "../../config/shortcuts";
import { WORKFLOW_NODE_TYPE } from "../node/WorkflowNode";
import { SUBGRAPH_NODE_TYPE } from "../node/SubgraphNode";
import { shallow } from "zustand/shallow";

const PaneContextMenu: React.FC = () => {
  const { t } = useTranslation("nodeMenu");
  const { handlePaste } = useCopyPaste();
  const reactFlowInstance = useReactFlow();
  const { isClipboardValid } = useClipboard();
  const menuPosition = useContextMenuStore((state) => state.menuPosition);
  const closeContextMenu = useContextMenuStore(
    (state) => state.closeContextMenu
  );
  const fitView = useFitView();
  const favorites = useFavoriteNodesStore((state) => state.favorites);
  const getMetadata = useMetadataStore((state) => state.getMetadata);
  const [constantMenuAnchorEl, setConstantMenuAnchorEl] =
    useState<HTMLElement | null>(null);
  const [inputMenuAnchorEl, setInputMenuAnchorEl] =
    useState<HTMLElement | null>(null);

  const { createNode, addNode } = useNodes((state) => ({
    createNode: state.createNode,
    addNode: state.addNode
  }), shallow);

  const closeAllMenus = useCallback(() => {
    setConstantMenuAnchorEl(null);
    setInputMenuAnchorEl(null);
    closeContextMenu();
  }, [closeContextMenu]);


  const addComment = useCallback(
    (event: React.MouseEvent) => {
      const metadata = COMMENT_NODE_METADATA;
      const newNode = createNode(
        metadata,
        reactFlowInstance.screenToFlowPosition({
          x: menuPosition?.x || event.clientX,
          y: menuPosition?.y || event.clientY
        })
      );
      newNode.width = 150;
      newNode.height = 100;
      newNode.style = { width: 150, height: 100 };
      addNode(newNode);
    },
    [createNode, addNode, reactFlowInstance, menuPosition]
  );

  const addGroupNode = useCallback(
    (event: React.MouseEvent) => {
      // Use the imported constant
      const metadata = GROUP_NODE_METADATA;
      const position = reactFlowInstance.screenToFlowPosition({
        x: menuPosition?.x || event.clientX,
        y: menuPosition?.y || event.clientY
      });
      const newNode = createNode(metadata, position);
      addNode(newNode);
      closeAllMenus();
    },
    [createNode, addNode, reactFlowInstance, menuPosition, closeAllMenus]
  );

  const addFavoriteNode = useCallback(
    (nodeType: string) => (event: React.MouseEvent | undefined) => {
      if (!event) {
        return;
      }
      const metadata = getMetadata(nodeType);
      if (metadata) {
        const position = reactFlowInstance.screenToFlowPosition({
          x: menuPosition?.x || event.clientX,
          y: menuPosition?.y || event.clientY
        });
        const newNode = createNode(metadata, position);
        addNode(newNode);
      }
      closeAllMenus();
    },
    [
      createNode,
      addNode,
      reactFlowInstance,
      menuPosition,
      closeAllMenus,
      getMetadata
    ]
  );

  const getNodeDisplayName = useCallback(
    (nodeType: string) => {
      const metadata = getMetadata(nodeType);
      if (metadata) {
        return (
          metadata.title || metadata.node_type.split(".").pop() || nodeType
        );
      }
      return nodeType.split(".").pop() || nodeType;
    },
    [getMetadata]
  );

  const constantNodeOptions = useMemo(
    () =>
      [
        { label: t("nodeTypes.bool"), nodeTypes: ["nodetool.constant.Bool"] },
        { label: t("nodeTypes.dataFrame"), nodeTypes: ["nodetool.constant.DataFrame"] },
        { label: t("nodeTypes.date"), nodeTypes: ["nodetool.constant.Date"] },
        { label: t("nodeTypes.dateTime"), nodeTypes: ["nodetool.constant.DateTime"] },
        { label: t("nodeTypes.dict"), nodeTypes: ["nodetool.constant.Dict"] },
        { label: t("nodeTypes.document"), nodeTypes: ["nodetool.constant.Document"] },
        { label: t("nodeTypes.float"), nodeTypes: ["nodetool.constant.Float"] },
        { label: t("nodeTypes.image"), nodeTypes: ["nodetool.constant.Image"] },
        { label: t("nodeTypes.integer"), nodeTypes: ["nodetool.constant.Integer"] },
        { label: t("nodeTypes.json"), nodeTypes: ["nodetool.constant.JSON"] },
        { label: t("nodeTypes.list"), nodeTypes: ["nodetool.constant.List"] },
        { label: t("nodeTypes.audio"), nodeTypes: ["nodetool.constant.Audio"] },
        {
          label: t("nodeTypes.model3d"),
          nodeTypes: [
            "nodetool.constant.Model3D",
            "nodetool.constant.Model3d",
            "nodetool.constant.Model_3D"
          ]
        },
        { label: t("nodeTypes.select"), nodeTypes: ["nodetool.constant.Select"] },
        { label: t("nodeTypes.string"), nodeTypes: ["nodetool.constant.String"] },
        { label: t("nodeTypes.video"), nodeTypes: ["nodetool.constant.Video"] }
      ].sort((a, b) => a.label.localeCompare(b.label)),
    [t]
  );

  const inputNodeOptions = useMemo(
    () =>
      [
        { label: t("nodeTypes.string"), nodeTypes: ["nodetool.input.StringInput"] },
        { label: t("nodeTypes.integer"), nodeTypes: ["nodetool.input.IntegerInput"] },
        { label: t("nodeTypes.float"), nodeTypes: ["nodetool.input.FloatInput"] },
        { label: t("nodeTypes.boolean"), nodeTypes: ["nodetool.input.BooleanInput"] },
        { label: t("nodeTypes.image"), nodeTypes: ["nodetool.input.ImageInput"] },
        { label: t("nodeTypes.audio"), nodeTypes: ["nodetool.input.AudioInput"] },
        { label: t("nodeTypes.video"), nodeTypes: ["nodetool.input.VideoInput"] },
        { label: t("nodeTypes.document"), nodeTypes: ["nodetool.input.DocumentInput"] },
        { label: t("nodeTypes.dataFrame"), nodeTypes: ["nodetool.input.DataFrameInput"] },
        { label: t("nodeTypes.select"), nodeTypes: ["nodetool.input.SelectInput"] }
      ].sort((a, b) => a.label.localeCompare(b.label)),
    [t]
  );

  const resolveNodeType = useCallback(
    (nodeTypes: string[]) =>
      nodeTypes.find((nodeType) => Boolean(getMetadata(nodeType))) || null,
    [getMetadata]
  );

  const handleCreateNode = useCallback(
    (nodeType: string | null) => (event?: React.MouseEvent) => {
      if (!event || !nodeType) {
        return;
      }
      const metadata = getMetadata(nodeType);
      if (!metadata) {
        console.error(`Metadata not found for node type: ${nodeType}`);
        return;
      }
      const position = reactFlowInstance.screenToFlowPosition({
        x: menuPosition?.x || event.clientX,
        y: menuPosition?.y || event.clientY
      });
      const newNode = createNode(metadata, position);
      addNode(newNode);
      closeAllMenus();
    },
    [
      getMetadata,
      createNode,
      addNode,
      reactFlowInstance,
      menuPosition,
      closeAllMenus
    ]
  );

  const handleOpenConstantMenu = useCallback(
    (event?: React.MouseEvent<HTMLElement>) => {
      if (!event) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setConstantMenuAnchorEl(event.currentTarget);
      setInputMenuAnchorEl(null);
    },
    []
  );

  const handleOpenInputMenu = useCallback(
    (event?: React.MouseEvent<HTMLElement>) => {
      if (!event) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setInputMenuAnchorEl(event.currentTarget);
      setConstantMenuAnchorEl(null);
    },
    []
  );

  const handlePasteAndClose = useCallback(() => {
    handlePaste();
    closeAllMenus();
  }, [handlePaste, closeAllMenus]);

  const handleFitViewAndClose = useCallback(
    (event?: React.MouseEvent<HTMLElement>) => {
      if (event) {
        event.preventDefault();
        fitView({ padding: 0.5 });
      }
      closeAllMenus();
    },
    [fitView, closeAllMenus]
  );

  const handleAddCommentAndClose = useCallback(
    (event?: React.MouseEvent<HTMLElement>) => {
      if (event) {
        event.preventDefault();
        addComment(event);
      }
      closeAllMenus();
    },
    [addComment, closeAllMenus]
  );

  const handleAddGroupAndClose = useCallback(
    (event?: React.MouseEvent<HTMLElement>) => {
      if (event) {
        event.preventDefault();
        addGroupNode(event);
      }
      closeAllMenus();
    },
    [addGroupNode, closeAllMenus]
  );

  if (!menuPosition) {
    return null;
  }

  return (
    <>
      <ContextMenu
        className="context-menu pane-context-menu"
        open={menuPosition !== null}
        onClose={closeAllMenus}
        onContextMenu={(event) => event.preventDefault()}
        onClick={(e) => e.stopPropagation()}
        MenuListProps={{
          onClick: (event) => event.stopPropagation()
        }}
        position={menuPosition}
        slotProps={{
          paper: {
            className: "context-menu pane-context-menu"
          }
        }}
        paperSx={{ borderRadius: "var(--rounded-lg)", width: "240px" }}
      >
        <ContextMenuItem
          onClick={handlePasteAndClose}
          label={t("paste")}
          addButtonClassName={`action ${!isClipboardValid ? "disabled" : ""}`}
          IconComponent={<SouthEastIcon />}
          tooltip={
            !isClipboardValid ? (
              <span>
                {getShortcutTooltip("paste-selection")}
                <br />
                <span className="attention">
                  {t("noValidNodeData")}
                  <br />
                  {t("inClipboard")}
                </span>
              </span>
            ) : (
              getShortcutTooltip("paste-selection")
            )
          }
        />
        <ContextMenuItem
          onClick={handleFitViewAndClose}
          label={t("fitScreen")}
          IconComponent={<FitScreenIcon />}
          tooltip={getShortcutTooltip("fit-view")}
        />
        {favorites.length > 0 && [
          <Divider key="favorites-divider" />,
          <FlexRow
            key="favorites-header"
            align="center"
            sx={{
              gap: "0.5em",
              padding: "4px 16px",
              color: "text.secondary",
              fontSize: "var(--fontSizeSmaller)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.5px"
            }}
          >
            <StarIcon
              sx={{ fontSize: "var(--fontSizeNormal)", color: "warning.main" }}
            />
            <Text>{t("favorites")}</Text>
          </FlexRow>,
          ...favorites.map((favorite) => {
            const displayName = getNodeDisplayName(favorite.nodeType);
            return (
              <ContextMenuItem
                key={favorite.nodeType}
                onClick={addFavoriteNode(favorite.nodeType)}
                label={displayName}
                IconComponent={
                  <StarIcon
                    sx={{ fontSize: "var(--fontSizeNormal)", color: "warning.main", opacity: 0.7 }}
                  />
                }
                tooltip={t("addNodeTooltip", { name: displayName })}
              />
            );
          })
        ]}
        <Divider />
        <ContextMenuItem
          onClick={handleOpenConstantMenu}
          controlElement={
            <EditorButton
              className="action"
              endIcon={<KeyboardArrowRightIcon />}
              density="normal"
            >
              <DataObjectIcon />
              <span className="label">{t("addConstantNode")}</span>
            </EditorButton>
          }
        />
        <ContextMenuItem
          onClick={handleOpenInputMenu}
          controlElement={
            <EditorButton
              className="action"
              endIcon={<KeyboardArrowRightIcon />}
              density="normal"
            >
              <InputIcon />
              <span className="label">{t("addInputNode")}</span>
            </EditorButton>
          }
        />
        <Divider />
        <ContextMenuItem
          onClick={handleAddCommentAndClose}
          label={t("addComment")}
          IconComponent={<AddCommentIcon />}
          tooltip={t("holdCKeyAndDrag")}
        />
        <ContextMenuItem
          onClick={handleAddGroupAndClose}
          label={t("addGroup")}
          IconComponent={<GroupWorkIcon />}
          tooltip={t("addGroupNodeTooltip")}
        />
        <ContextMenuItem
          onClick={handleCreateNode(WORKFLOW_NODE_TYPE)}
          label={t("addWorkflow")}
          tooltip={t("addWorkflowNodeTooltip")}
        />
        <ContextMenuItem
          onClick={handleCreateNode(SUBGRAPH_NODE_TYPE)}
          label={t("addSubgraph")}
          tooltip={t("addInlineSubgraphNodeTooltip")}
        />
      </ContextMenu>
      <ContextMenu
        className="context-menu pane-submenu"
        anchorEl={constantMenuAnchorEl}
        open={Boolean(constantMenuAnchorEl)}
        onClose={() => setConstantMenuAnchorEl(null)}
        slotProps={{
          paper: {
            className: "context-menu pane-submenu"
          }
        }}
        anchorOrigin={{
          vertical: "top",
          horizontal: "right"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left"
        }}
      >
        {constantNodeOptions.map((option) => {
          const nodeType = resolveNodeType(option.nodeTypes);
          if (!nodeType) {
            return null;
          }
          return (
            <ContextMenuItem
              key={nodeType}
              onClick={handleCreateNode(nodeType)}
              label={option.label}
            />
          );
        })}
      </ContextMenu>
      <ContextMenu
        className="context-menu pane-submenu"
        anchorEl={inputMenuAnchorEl}
        open={Boolean(inputMenuAnchorEl)}
        onClose={() => setInputMenuAnchorEl(null)}
        slotProps={{
          paper: {
            className: "context-menu pane-submenu"
          }
        }}
        anchorOrigin={{
          vertical: "top",
          horizontal: "right"
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "left"
        }}
      >
        {inputNodeOptions.map((option) => {
          const nodeType = resolveNodeType(option.nodeTypes);
          if (!nodeType) {
            return null;
          }
          return (
            <ContextMenuItem
              key={nodeType}
              onClick={handleCreateNode(nodeType)}
              label={option.label}
            />
          );
        })}
      </ContextMenu>
    </>
  );
};

export default React.memo(PaneContextMenu);
