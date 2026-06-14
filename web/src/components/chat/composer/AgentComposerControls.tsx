/** @jsxImportSource @emotion/react */
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import { useShallow } from "zustand/react/shallow";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import MediaControlChip from "./MediaControlChip";
import MediaOptionMenu, { type MediaOption } from "./MediaOptionMenu";
import { trpcClient } from "../../../trpc/client";
import type { WorkspaceResponse } from "../../../stores/ApiTypes";

export const agentModeAvailable = true;

const fetchWorkspaces = async (): Promise<WorkspaceResponse[]> => {
  const { workspaces } = await trpcClient.workspace.list.query({ limit: 100 });
  return workspaces as WorkspaceResponse[];
};

const AgentComposerControls: React.FC<{ disabled?: boolean }> = ({
  disabled
}) => {
  const { t } = useTranslation("chat");
  const {
    agentProvider,
    agentModel,
    agentModels,
    agentModelsLoading,
    agentWorkspaceId,
    agentWorkspacePath,
    setAgentModel,
    setAgentWorkspace,
    loadAgentModels
  } = useGlobalChatStore(
    useShallow((s) => ({
      agentProvider: s.agentProvider,
      agentModel: s.agentModel,
      agentModels: s.agentModels,
      agentModelsLoading: s.agentModelsLoading,
      agentWorkspaceId: s.agentWorkspaceId,
      agentWorkspacePath: s.agentWorkspacePath,
      setAgentModel: s.setAgentModel,
      setAgentWorkspace: s.setAgentWorkspace,
      loadAgentModels: s.loadAgentModels
    }))
  );

  const isPiProvider = agentProvider === "pi";
  const { data: workspaces } = useQuery({
    queryKey: ["workspaces"],
    queryFn: fetchWorkspaces,
    enabled: isPiProvider
  });

  const [modelAnchor, setModelAnchor] = useState<HTMLButtonElement | null>(null);
  const [workspaceAnchor, setWorkspaceAnchor] =
    useState<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!isPiProvider || !workspaces || agentWorkspaceId) {
      return;
    }
    const def = workspaces.find((w) => w.is_default) ?? workspaces[0];
    if (def) {
      setAgentWorkspace(def.id, def.path);
    }
  }, [isPiProvider, workspaces, agentWorkspaceId, setAgentWorkspace]);

  useEffect(() => {
    void loadAgentModels();
  }, [agentProvider, agentWorkspacePath, loadAgentModels]);

  const modelOptions = useMemo<MediaOption<string>[]>(
    () =>
      agentModels.map((m) => ({
        id: m.id,
        label: m.label,
        icon: <SmartToyOutlinedIcon fontSize="small" />
      })),
    [agentModels]
  );

  const workspaceOptions = useMemo<MediaOption<string>[]>(
    () =>
      (workspaces ?? []).map((w) => ({
        id: w.id,
        label: w.path,
        icon: <FolderOutlinedIcon fontSize="small" />
      })),
    [workspaces]
  );

  const workspaceLabel =
    workspaces?.find((w) => w.id === agentWorkspaceId)?.path?.split("/").pop() ||
    t("workspace");
  const modelLabel =
    agentModels.find((m) => m.id === agentModel)?.label ||
    (agentModelsLoading ? t("loadingEllipsis") : agentModel || t("selectModel"));

  return (
    <>
      {isPiProvider && (
        <>
          <MediaControlChip
            icon={<FolderOutlinedIcon fontSize="small" />}
            label={workspaceLabel}
            active={!!workspaceAnchor}
            onClick={(e) => setWorkspaceAnchor(e.currentTarget)}
            showChevron={false}
            truncate
            disabled={disabled}
          />
          <MediaOptionMenu
            anchorEl={workspaceAnchor}
            open={!!workspaceAnchor}
            onClose={() => setWorkspaceAnchor(null)}
            header={t("workspace")}
            value={agentWorkspaceId ?? ""}
            options={workspaceOptions}
            onChange={(id) => {
              const workspace = workspaces?.find((w) => w.id === id);
              setAgentWorkspace(workspace?.id ?? null, workspace?.path ?? null);
            }}
          />
        </>
      )}

      <MediaControlChip
        icon={<SmartToyOutlinedIcon fontSize="small" />}
        label={modelLabel}
        active={!!modelAnchor}
        onClick={(e) => setModelAnchor(e.currentTarget)}
        showChevron={false}
        truncate
        disabled={disabled}
      />
      <MediaOptionMenu
        anchorEl={modelAnchor}
        open={!!modelAnchor}
        onClose={() => setModelAnchor(null)}
        header={t("agentModel")}
        value={agentModel}
        options={modelOptions}
        onChange={(id) => setAgentModel(id)}
      />
    </>
  );
};

export default AgentComposerControls;
