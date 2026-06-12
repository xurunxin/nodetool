/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";

import React, { useState, useCallback, useEffect } from "react";
import { InsertDriveFile } from "@mui/icons-material";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useAssetDeletion } from "../../serverState/useAssetDeletion";
import { useAssets } from "../../serverState/useAssets";
import AssetTree from "./AssetTree";
import { Asset } from "../../stores/ApiTypes";
import { useAuth } from "../../stores/useAuth";
import {
  Dialog,
  DialogActionButtons,
  LoadingSpinner,
  ListGroup,
  ListItemRow,
  Text
} from "../ui_primitives";

const styles = css({
  ".asset-delete-confirmation-content": {
    position: "relative",
    minWidth: "600px",
    minHeight: "200px",
    maxHeight: "60vh"
  }
});

interface AssetDeleteConfirmationProps {
  assets: string[];
}

const AssetDeleteConfirmation: React.FC<AssetDeleteConfirmationProps> = ({
  assets
}) => {
  const { t } = useTranslation(["assets", "common"]);
  const [isLoading, setIsLoading] = useState(false);
  const [totalAssets, setTotalAssets] = useState(0);
  const [folderCount, setFolderCount] = useState(0);
  const [fileCount, setFileCount] = useState(0);
  const [fileAssets, setFileAssets] = useState<Asset[]>([]);
  const [isAssetTreeLoading, setIsAssetTreeLoading] = useState(true);
  const [isPreparingDelete, setIsPreparingDelete] = useState(true);
  const [showRootFolderWarning, setShowRootFolderWarning] = useState(false);
  const dialogOpen = useAssetGridStore((state) => state.deleteDialogOpen);
  const setDialogOpen = useAssetGridStore((state) => state.setDeleteDialogOpen);
  const { mutation } = useAssetDeletion();
  const { refetchAssetsAndFolders } = useAssets();
  const selectedAssets = useAssetGridStore((state) => state.selectedAssets);
  const user = useAuth((state) => state.user);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!dialogOpen) {return;} // Only process when dialog is actually open

    const countAssetTypes = () => {
      setIsPreparingDelete(true);
      let folders = 0;
      let files = 0;
      const fileAssetsTemp: Asset[] = [];
      setTotalAssets(0);
      let hasRootFolder = false;

      for (const asset of selectedAssets) {
        if (asset.content_type === "folder") {
          folders++;
          if (asset.id === "1" || (user && asset.id === user.id)) {
            hasRootFolder = true;
          }
        } else {
          files++;
          fileAssetsTemp.push(asset);
        }
      }

      setFolderCount(folders);
      setFileCount(files);
      setFileAssets(fileAssetsTemp);
      if (folders === 0) {
        setIsAssetTreeLoading(false);
      }
      if (files > 0 && folders === 0) {
        setTotalAssets(files);
      }
      setIsPreparingDelete(false);
      setShowRootFolderWarning(hasRootFolder);
    };

    countAssetTypes();
  }, [dialogOpen, selectedAssets, user]);

  const handleClose = useCallback(() => {
    // Blur focused element to prevent aria-hidden focus warning
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setDialogOpen(false);
  }, [setDialogOpen]);

  const handleTotalAssetsCalculated = useCallback((assetCount: number) => {
    setTotalAssets(assetCount);
  }, []);

  const executeDeletion = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await mutation.mutateAsync(assets);
      if (response === undefined) {
        console.error("Received undefined response from server");
      } else if (typeof response === "object" && response !== null) {
        console.info("Deleted asset IDs:", (response as { deleted_asset_ids?: string[] }).deleted_asset_ids);
      }
      // Blur focused element to prevent aria-hidden focus warning
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      setDialogOpen(false);
      // Invalidate all asset queries (including workflow-specific ones)
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
      await refetchAssetsAndFolders();
    } catch (error) {
      if (error instanceof Error) {
        console.error("Execute deletion error:", error.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, [mutation, assets, setDialogOpen, refetchAssetsAndFolders, queryClient]);

  const getDialogTitle = () => {
    if (isAssetTreeLoading && folderCount > 0) {
      return t("assets:deletePreparing");
    } else if (showRootFolderWarning) {
      return t("assets:rootFolderCannotDelete");
    } else if (folderCount === 1 && fileCount === 0) {
      return t("assets:deleteFolderContaining", {
        count: Math.max(totalAssets - 1, 0)
      });
    } else if (folderCount > 0) {
      const folderLabel = t("assets:folderLabel", { count: folderCount });
      const fileLabel = t("assets:fileLabel", { count: fileCount });
      const itemLabel = t("assets:itemLabel", { count: totalAssets });
      return t("assets:deleteFoldersAndFiles", {
        count: totalAssets,
        folderCount,
        folderLabel,
        fileCount,
        fileLabel,
        itemCount: totalAssets,
        itemLabel
      });
    } else {
      return t("assets:deleteFiles", { count: fileCount });
    }
  };

  return (
    <Dialog
      css={styles}
      className="asset-delete-confirmation"
      open={dialogOpen}
      onClose={handleClose}
      disableRestoreFocus
      title={getDialogTitle()}
    >
      <div className="asset-delete-confirmation-content">
        <Text
          color="secondary"
          style={{ marginBottom: "1em" }}
        >
          {t("assets:deleteTip")}
        </Text>
        {isPreparingDelete ? (
          <LoadingSpinner size="small" />
        ) : (
          <>
            {!showRootFolderWarning && (
              <>
                {folderCount > 0 ? (
                  assets.map((assetId) => (
                    <AssetTree
                      key={assetId}
                      folderId={assetId}
                      onTotalAssetsCalculated={handleTotalAssetsCalculated}
                      onLoading={setIsAssetTreeLoading}
                    />
                  ))
                ) : (
                  <ListGroup compact flush>
                    {fileAssets.map((file) => (
                      <ListItemRow
                        key={file.id}
                        primary={file.name}
                        icon={<InsertDriveFile />}
                      />
                    ))}
                  </ListGroup>
                )}
              </>
            )}
          </>
        )}
      </div>
      <DialogActionButtons
        onConfirm={executeDeletion}
        onCancel={handleClose}
        confirmText={t("common:delete")}
        cancelText={t("common:cancel")}
        isLoading={isLoading}
        confirmDisabled={isAssetTreeLoading || showRootFolderWarning}
        destructive={true}
      />
    </Dialog>
  );
};

export default AssetDeleteConfirmation;
