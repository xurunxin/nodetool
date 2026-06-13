import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text, FlexRow, AlertBanner, Surface, TextInput } from "../ui_primitives";
import { EditorButton } from "../editor_ui";
import { getMousePosition } from "../../utils/MousePosition";
import { useAssetStore } from "../../stores/AssetStore";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import useAssets from "../../serverState/useAssets";
import { useNotificationStore } from "../../stores/NotificationStore";
import { Asset } from "../../stores/ApiTypes";
import { useTheme } from "@mui/material/styles";

const AssetCreateFolderConfirmation: React.FC = () => {
  const { t } = useTranslation("assets");
  const setDialogOpen = useAssetGridStore(
    (state) => state.setCreateFolderDialogOpen
  );
  const dialogOpen = useAssetGridStore((state) => state.createFolderDialogOpen);
  const selectedAssetIds = useAssetGridStore((state) => state.selectedAssetIds);
  const currentFolder = useAssetGridStore((state) => state.currentFolder);
  const setSelectedAssetIds = useAssetGridStore(
    (state) => state.setSelectedAssetIds
  );
  const setSelectedAssets = useAssetGridStore(
    (state) => state.setSelectedAssets
  );

  const [dialogPosition, setDialogPosition] = useState({ x: 0, y: 0 });
  const [folderName, setFolderName] = useState(() => t("newFolderDefault"));
  const [showAlert, setShowAlert] = useState<string | null>(null);
  const handleClose = useCallback(() => {
    setDialogOpen(false);
  }, [setDialogOpen]);
  const inputRef = useRef<HTMLInputElement>(null);
  const theme = useTheme();
  const createFolder = useAssetStore((state) => state.createFolder);
  const updateAsset = useAssetStore((state) => state.update);
  const { refetchAssetsAndFolders, folderFilesFiltered } = useAssets();
  const addNotification = useNotificationStore(
    (state) => state.addNotification
  );

  // Build a Map for O(1) lookups instead of O(n*m) nested find operations
  const assetMap = useMemo(() => {
    const map = new Map<string, Asset>();
    folderFilesFiltered.forEach((asset) => map.set(asset.id, asset));
    return map;
  }, [folderFilesFiltered]);

  // Derive selectedAssets from selectedAssetIds and current assets to ensure they're in sync
  // Uses Map for O(n) lookup instead of nested O(n*m) find operations
  const selectedAssets = useMemo(() => {
    if (selectedAssetIds.length === 0) {
      return [];
    }
    return selectedAssetIds
      .map((id) => assetMap.get(id))
      .filter((asset): asset is Asset => asset !== undefined);
  }, [selectedAssetIds, assetMap]);

  // Check if we have non-folder assets selected for moving
  const isFolder = selectedAssets.some(
    (asset) => asset.content_type === "folder"
  );
  const hasSelectedAssets = selectedAssets.length > 0 && !isFolder;

  useEffect(() => {
    if (dialogOpen) {
      setFolderName(t("newFolderDefault"));
      const mousePosition = getMousePosition();
      setDialogPosition({ x: mousePosition.x, y: mousePosition.y });
      setShowAlert(null);
      const timer = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [dialogOpen, t]);

  const handleCreateFolder = useCallback(async () => {
    const invalidCharsRegex = /[/*?"<>|#%{}^[\]`'=&$§!°äüö;+~|$!]+/g;

    function startsWithEmoji(fileName: string): boolean {
      // Unicode range for emojis
      const emojiRegex =
        /^[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F900}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
      return emojiRegex.test(fileName);
    }

    // Check if the name starts with a special character
    if (
      startsWithEmoji(folderName) ||
      folderName.startsWith(".") ||
      folderName.startsWith(",") ||
      folderName.startsWith(" ") ||
      folderName.match(/^[-#*&]/)
    ) {
      setShowAlert(t("folderNameCannotStartSpecial"));
      return;
    }

    // Find invalid characters in the name
    const invalidCharsFound = folderName.match(invalidCharsRegex);

    // Check for empty or overly long names
    if (!folderName) {
      setShowAlert(t("folderNameCannotBeEmpty"));
      return;
    } else if (folderName.length > 100) {
      setShowAlert(t("folderNameTooLong"));
      return;
    }

    // complain about invalid characters
    if (invalidCharsFound) {
      const uniqueInvalidChars = invalidCharsFound.filter(
        (char, index, array) => array.indexOf(char) === index
      );
      setShowAlert(
        t("invalidCharacters", { chars: uniqueInvalidChars.join(", ") })
      );
      return;
    }

    const cleanedName = folderName.trim();

    try {
      // Create the folder
      const newFolder = await createFolder(
        currentFolder?.id || "",
        cleanedName
      );

      // If we have selected assets and they're not folders, move them to the new folder
      if (hasSelectedAssets && newFolder) {
        const updatePromises = selectedAssetIds.map((assetId) =>
          updateAsset({ id: assetId, parent_id: newFolder.id })
        );
        await Promise.all(updatePromises);

        addNotification({
          type: "success",
          content: t("createFolderAndMovedSuccess", {
            name: cleanedName,
            count: selectedAssetIds.length
          })
        });

        // Clear selection since assets were moved
        setSelectedAssetIds([]);
        setSelectedAssets([]);
      } else {
        addNotification({
          type: "success",
          content: t("createFolderSuccess", { name: cleanedName })
        });
      }

      setDialogOpen(false);
      refetchAssetsAndFolders();
    } catch (error) {
      console.error("Failed to create folder", error);
      setShowAlert(t("createFolderFailed"));
    }
  }, [
    folderName,
    currentFolder?.id,
    hasSelectedAssets,
    selectedAssetIds,
    createFolder,
    updateAsset,
    addNotification,
    setDialogOpen,
    refetchAssetsAndFolders,
    setSelectedAssetIds,
    setSelectedAssets,
    t
  ]);

  const screenWidth = window.innerWidth;
  const dialogWidth = 400;
  const leftPosition = dialogPosition.x - dialogWidth;

  const safeLeft = Math.min(
    Math.max(leftPosition, 50),
    screenWidth - dialogWidth - 50
  );

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (event: React.MouseEvent) => {
      if (event.target === event.currentTarget) {
        setDialogOpen(false);
      }
    },
    [setDialogOpen]
  );

  if (!dialogOpen) {
    return null;
  }

  return (
    <div
      className="asset-create-folder-backdrop"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "transparent",
        zIndex: 1300
      }}
      onClick={handleBackdropClick}
    >
      <Surface
        className="asset-create-folder-dialog"
        elevation={3}
        sx={{
          position: "absolute",
          left: `${safeLeft}px`,
          top: `${dialogPosition.y - 200}px`,
          width: 400,
          maxWidth: "calc(100vw - 32px)",
          backgroundColor: `rgba(${theme.vars.palette.background.defaultChannel} / 0.9)`,
          backdropFilter: "blur(10px)",
          borderRadius: 1,
          overflow: "hidden"
        }}
      >
        <Text
          className="asset-create-folder-dialog-title"
          size="small"
          family="primary"
          sx={{
            color: theme.vars.palette.grey[100],
            margin: ".5em 0 0",
            padding: "1em"
          }}
        >
          {hasSelectedAssets
            ? t("moveSelectedToNewFolder")
            : t("createNewFolder")}
        </Text>

        <div style={{ padding: "0 .5em" }}>
          {showAlert && (
            <AlertBanner
              className="asset-create-folder-error-alert"
              severity="error"
              onClose={handleClose}
            >
              {showAlert}
            </AlertBanner>
          )}
          <TextInput
            className="asset-create-folder-input"
            inputRef={inputRef}
            value={folderName}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                handleCreateFolder();
              }
            }}
            onChange={(e) => setFolderName(e.target.value)}
            fullWidth
            autoCorrect="off"
            spellCheck="false"
            sx={{
              padding: "8px",
              "& input": {
                fontFamily: theme.fontFamily1,
                padding: "8px 12px"
              }
            }}
          />
        </div>

        <FlexRow
          justify="flex-end"
          gap={1}
          sx={{
            padding: ".5em 1em"
          }}
        >
          <EditorButton
            className="asset-create-folder-cancel-button"
            onClick={handleClose}
            sx={{ color: theme.vars.palette.grey[100] }}
          >
            {t("cancel")}
          </EditorButton>
          <EditorButton
            className="asset-create-folder-confirm-button"
            onClick={handleCreateFolder}
            sx={{
              color: "var(--palette-primary-main)",
              fontWeight: 600
            }}
          >
            {hasSelectedAssets
              ? t("moveToNewFolderButton")
              : t("createFolderButton")}
          </EditorButton>
        </FlexRow>

        {hasSelectedAssets && (
          <div className="asset-create-folder-notice-container">
            <Text
              className="asset-create-folder-notice"
              size="small"
              family="primary"
              sx={{
                backgroundColor: theme.vars.palette.c_attention,
                color: theme.vars.palette.grey[1000],
                padding: ".5em 1em"
              }}
            >
              <span className="asset-create-folder-selected-count">
                {t("selectedAssetsCount", { count: selectedAssets.length })}
              </span>{" "}
              <br />
              {t("selectedAssetsMoveNotice")}
            </Text>
          </div>
        )}
      </Surface>
    </div>
  );
};

export default AssetCreateFolderConfirmation;
