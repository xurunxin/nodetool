//mui
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { MenuItem } from "@mui/material";
import { Text, Divider, ContextMenu } from "../ui_primitives";
import ContextMenuItem from "./ContextMenuItem";
//icons
import CreateNewFolderIcon from "@mui/icons-material/CreateNewFolder";
import SortByAlphaIcon from "@mui/icons-material/SortByAlpha";
import AccessTimeIcon from "@mui/icons-material/AccessTime";
import StorageIcon from "@mui/icons-material/Storage";
//store
import useContextMenuStore from "../../stores/ContextMenuStore";
import { useAssetGridStore } from "../../stores/AssetGridStore";
import { useSettingsStore } from "../../stores/SettingsStore";

const AssetGridContextMenu = () => {
  const { t } = useTranslation("assets");
  const currentFolder = useAssetGridStore((state) => state.currentFolder);
  const menuPosition = useContextMenuStore((state) => state.menuPosition);
  const closeContextMenu = useContextMenuStore(
    (state) => state.closeContextMenu
  );
  const setCreateFolderDialogOpen = useAssetGridStore(
    (state) => state.setCreateFolderDialogOpen
  );
  const assetsOrder = useSettingsStore((state) => state.settings.assetsOrder);
  const setAssetsOrder = useSettingsStore((state) => state.setAssetsOrder);

  const withMenuClose =
    (action: () => void) =>
    (event?: MouseEvent<HTMLElement>) => {
      event?.stopPropagation();
      action();
      closeContextMenu();
    };

  const handleCreateFolder = withMenuClose(() => setCreateFolderDialogOpen(true));
  const handleSortByName = withMenuClose(() => setAssetsOrder("name"));
  const handleSortByDate = withMenuClose(() => setAssetsOrder("date"));
  const handleSortBySize = withMenuClose(() => setAssetsOrder("size"));

  if (!menuPosition) {return null;}

  const folderName = currentFolder?.name || t("rootFolder");

  return (
    <ContextMenu
      className="context-menu asset-grid-context-menu"
      open={menuPosition !== null}
      onContextMenu={(event) => event.preventDefault()}
      onClose={closeContextMenu}
      style={{ padding: "1em" }}
      position={menuPosition}
    >
      <MenuItem disabled>
        <Text className="title">
          {t("folderTitle", { name: folderName })}
        </Text>
      </MenuItem>
      <Divider />
      <ContextMenuItem
        onClick={handleCreateFolder}
        label={t("createNewFolder")}
        IconComponent={<CreateNewFolderIcon />}
        tooltip={t("createNewFolderIn", { name: folderName })}
      />
      <Divider />
      <ContextMenuItem
        onClick={handleSortByName}
        label={`${t("sortByNameAction")} ${assetsOrder === "name" ? "✓" : ""}`}
        IconComponent={<SortByAlphaIcon />}
        tooltip={t("sortAssetsByName")}
      />
      <ContextMenuItem
        onClick={handleSortByDate}
        label={`${t("sortByDateAction")} ${assetsOrder === "date" ? "✓" : ""}`}
        IconComponent={<AccessTimeIcon />}
        tooltip={t("sortAssetsByDate")}
      />
      <ContextMenuItem
        onClick={handleSortBySize}
        label={`${t("sortBySizeAction")} ${assetsOrder === "size" ? "✓" : ""}`}
        IconComponent={<StorageIcon />}
        tooltip={t("sortAssetsByFileSize")}
      />
    </ContextMenu>
  );
};

export default AssetGridContextMenu;
