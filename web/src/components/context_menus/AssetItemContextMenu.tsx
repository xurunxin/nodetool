import type { MouseEvent } from "react";
import { useCallback, memo } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
//mui
import { MenuItem } from "@mui/material";
import { Text, Divider, ContextMenu } from "../ui_primitives";
import ContextMenuItem from "./ContextMenuItem";
//icons
import RemoveCircleIcon from "@mui/icons-material/RemoveCircle";
import DriveFileRenameOutlineIcon from "@mui/icons-material/DriveFileRenameOutline";
import DriveFileMoveIcon from "@mui/icons-material/DriveFileMove";
import FileDownloadIcon from "@mui/icons-material/FileDownload";
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import CompareIcon from "@mui/icons-material/Compare";
import TabIcon from "@mui/icons-material/Tab";
import MovieEditIcon from "@mui/icons-material/Movie";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
import { useAssetStore } from "../../stores/AssetStore";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useNotificationStore } from "../../stores/NotificationStore";
import { useWorkspaceTabsStore } from "../../stores/WorkspaceTabsStore";
import { assetTabType } from "../workspace/assetTabType";
import { useEditVideoAsset } from "../../hooks/useEditVideoAsset";
import { isElectron } from "../../utils/browser";
import { copyAssetToClipboard, isClipboardSupported } from "../../utils/clipboardUtils";
import AssetInfoPanel from "./AssetInfoPanel";
import { useShallow } from "zustand/react/shallow";

const AssetItemContextMenu = () => {
  const { t } = useTranslation("assets");
  const menuPosition = useContextMenuStore((state) => state.menuPosition);
  const closeContextMenu = useContextMenuStore((state) => state.closeContextMenu);

  const {
    setRenameDialogOpen,
    setMoveToFolderDialogOpen,
    setDeleteDialogOpen,
    selectedAssetIds,
    selectedAssets,
    openCompareView,
    setCreateFolderDialogOpen
  } = useAssetGridStore(
    useShallow((state) => ({
      setRenameDialogOpen: state.setRenameDialogOpen,
      setMoveToFolderDialogOpen: state.setMoveToFolderDialogOpen,
      setDeleteDialogOpen: state.setDeleteDialogOpen,
      selectedAssetIds: state.selectedAssetIds,
      selectedAssets: state.selectedAssets,
      openCompareView: state.openCompareView,
      setCreateFolderDialogOpen: state.setCreateFolderDialogOpen
    }))
  );

  const download = useAssetStore((state) => state.download);
  const addNotification = useNotificationStore((state) => state.addNotification);

  const openTab = useWorkspaceTabsStore((state) => state.openTab);
  const navigate = useNavigate();
  const editVideoAsset = useEditVideoAsset();

  const isFolder = selectedAssets.some(
    (asset) => asset.content_type === "folder"
  );

  // A single video opens in the timeline editor: its source timeline when one
  // exists, otherwise a fresh timeline wrapping the video.
  const singleVideo =
    selectedAssets.length === 1 &&
    selectedAssets[0]?.content_type?.startsWith("video/")
      ? selectedAssets[0]
      : null;

  // Check if the selected asset is a single item that supports clipboard
  const isSingleClipboardSupported =
    selectedAssets.length === 1 &&
    selectedAssets[0]?.content_type &&
    isClipboardSupported(selectedAssets[0].content_type);

  // Check if exactly 2 images are selected for comparison
  const isTwoImages =
    selectedAssets.length === 2 &&
    selectedAssets.every((asset) => asset.content_type?.startsWith("image/"));

  // Resolve the workspace tab type for a single selected asset ("Open as Tab").
  // Null when nothing is openable as a tab (multi-select, folder, or a content
  // type with no document surface, e.g. video).
  const openableTabType =
    selectedAssets.length === 1 && selectedAssets[0]
      ? assetTabType(selectedAssets[0])
      : null;

  // Determine if we have non-folder assets selected for moving to new folder
  const hasSelectedAssets = selectedAssets.length > 0 && !isFolder;

  const handleCopyToClipboard = useCallback(async () => {
    const asset = selectedAssets[0];
    if (!isSingleClipboardSupported || !asset?.get_url || !asset?.content_type) {
      return;
    }

    try {
      await copyAssetToClipboard(asset.content_type, asset.get_url, asset.name || undefined);

      const contentTypeLabel = asset.content_type.startsWith("image/")
        ? t("image")
        : asset.content_type.startsWith("video/")
        ? t("videoInfo")
        : asset.content_type.startsWith("audio/")
        ? t("audioInfo")
        : t("content");

      addNotification({
        type: "success",
        content: t("copiedToClipboard", { item: contentTypeLabel }),
        alert: true
      });
    } catch (error) {
      console.error("Failed to copy to clipboard", error);
      addNotification({
        type: "error",
        content: t("failedToCopyToClipboard"),
        alert: true
      });
    }
  }, [isSingleClipboardSupported, selectedAssets, addNotification, t]);

  const handleDownloadAssets = async (selectedAssetIds: string[]) => {
    addNotification({
      type: "info",
      content: t("downloadStarted"),
      alert: true
    });
    try {
      await download(selectedAssetIds);
      addNotification({
        type: "success",
        content: t("downloadFinished"),
        alert: true
      });
    } catch (error) {
      console.error("Download failed", error);
      addNotification({
        type: "error",
        content: t("downloadFailed"),
        alert: true
      });
    }
  };

  const withMenuClose =
    (action: () => Promise<void> | void) =>
    async (event?: MouseEvent<HTMLElement>) => {
      event?.stopPropagation();
      await action();
      closeContextMenu();
    };

  const openRenameDialog = withMenuClose(() => setRenameDialogOpen(true));
  const openMoveDialog = withMenuClose(() => setMoveToFolderDialogOpen(true));
  const openCreateFolderDialog = withMenuClose(() =>
    setCreateFolderDialogOpen(true)
  );
  const openDeleteDialog = withMenuClose(() => setDeleteDialogOpen(true));
  const downloadSelected = withMenuClose(async () => {
    await handleDownloadAssets(selectedAssetIds);
  });
  const copyToClipboard = withMenuClose(async () => {
    await handleCopyToClipboard();
  });
  const handleCompareImages = withMenuClose(() => {
    if (isTwoImages) {
      openCompareView(selectedAssets[0], selectedAssets[1]);
    }
  });

  const handleOpenAsTab = withMenuClose(() => {
    const asset = selectedAssets[0];
    if (openableTabType && asset) {
      openTab({
        type: openableTabType,
        ref: asset.id,
        mode: "view",
        title: asset.name || "Untitled"
      });
      navigate("/workspace");
    }
  });

  const handleEditVideo = withMenuClose(() => {
    if (singleVideo) {
      void editVideoAsset(singleVideo);
    }
  });

  const singleAsset =
    selectedAssets.length === 1 ? selectedAssets[0] : null;

  if (!menuPosition) {return null;}
  return (
    <>
      <ContextMenu
        className="context-menu asset-item-context-menu"
        open={menuPosition !== null}
        onClose={closeContextMenu}
        onContextMenu={(event) => event.preventDefault()}
        style={{ padding: "1em" }}
        position={menuPosition}
        paperSx={singleAsset ? { display: "flex", overflow: "visible" } : undefined}
      >
        <MenuItem disabled>
          <Text className="title">
            {isFolder
              ? "Folder"
              : `${selectedAssetIds.length} item${
                  selectedAssetIds.length > 1 ? "s" : ""
                }`}
          </Text>
        </MenuItem>
        <Divider />
        <ContextMenuItem
          onClick={openRenameDialog}
          label={t("rename")}
          IconComponent={<DriveFileRenameOutlineIcon />}
          tooltip={t("renameSelectedAssets")}
        />
        {openableTabType && (
          <ContextMenuItem
            onClick={handleOpenAsTab}
            label={t("openAsTab")}
            IconComponent={<TabIcon />}
            tooltip={t("openAssetInNewEditorTab")}
          />
        )}
        {singleVideo && (
          <ContextMenuItem
            onClick={handleEditVideo}
            label={
              singleVideo.timeline_id
                ? t("editTimeline")
                : t("createTimelineFromVideo")
            }
            IconComponent={<MovieEditIcon />}
            tooltip={
              singleVideo.timeline_id
                ? t("openRenderedVideoTimeline")
                : t("createTimelineFromVideoTooltip")
            }
          />
        )}
        <Divider />
        <ContextMenuItem
          onClick={openMoveDialog}
          label={t("moveToExistingFolder")}
          IconComponent={<DriveFileMoveIcon />}
          tooltip={t("moveSelectedAssetsToExistingFolder")}
        />
        <ContextMenuItem
          onClick={openCreateFolderDialog}
          label={hasSelectedAssets ? t("moveToNewFolder") : t("createNewFolder")}
          IconComponent={<CreateNewFolderIcon />}
          tooltip={
            hasSelectedAssets
              ? t("createFolderAndMoveSelectedAssets")
              : t("createNewFolderCurrentLocation")
          }
        />
        <Divider />
        <ContextMenuItem
          onClick={downloadSelected}
          label={t("downloadSelectedAssets")}
          IconComponent={<FileDownloadIcon />}
          tooltip={t("downloadSelectedAssetsTooltip")}
        />
        {isElectron && isSingleClipboardSupported && (
          <ContextMenuItem
            onClick={copyToClipboard}
            label={
              selectedAssets[0]?.content_type?.startsWith("image/")
                ? t("copyImage")
                : selectedAssets[0]?.content_type?.startsWith("video/")
                ? t("copyVideoInfo")
                : selectedAssets[0]?.content_type?.startsWith("audio/")
                ? t("copyAudioInfo")
                : t("copyContent")
            }
            IconComponent={<ContentCopyIcon />}
            tooltip={
              selectedAssets[0]?.content_type?.startsWith("image/")
                ? t("copyImageToClipboard")
                : selectedAssets[0]?.content_type?.startsWith("video/")
                ? t("copyVideoInfoToClipboard")
                : selectedAssets[0]?.content_type?.startsWith("audio/")
                ? t("copyAudioInfoToClipboard")
                : t("copyContentToClipboard")
            }
          />
        )}
        {isTwoImages && (
          <ContextMenuItem
            onClick={handleCompareImages}
            label={t("compareImages")}
            IconComponent={<CompareIcon />}
            tooltip={t("compareImagesTooltip")}
          />
        )}
        <Divider />
        <div style={{ height: ".5em" }} />
        <ContextMenuItem
          onClick={openDeleteDialog}
          label={t("delete")}
          addButtonClassName="delete"
          IconComponent={<RemoveCircleIcon />}
          tooltip={t("deleteSelectedAssets")}
        />
        {singleAsset && <AssetInfoPanel asset={singleAsset} />}
      </ContextMenu>
    </>
  );
};

export default memo(AssetItemContextMenu);
