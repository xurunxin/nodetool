/** @jsxImportSource @emotion/react */
import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import { useShallow } from "zustand/react/shallow";
import useGlobalChatStore from "../../../stores/GlobalChatStore";
import type { AgentProvider } from "../../../lib/agent/agentTypes";
import { isProduction } from "../../../lib/env";
import { trpcClient } from "../../../trpc/client";
import { getIsElectronDetails } from "../../../utils/browser";
import type { WorkspaceResponse } from "../../../stores/ApiTypes";
import MediaControlChip from "./MediaControlChip";
import MediaOptionMenu, { type MediaOption } from "./MediaOptionMenu";

export const agentModeAvailable = true;

const piWorkspaceAvailable =
  getIsElectronDetails().isElectron || !isProduction;

const fetchWorkspaces = async (): Promise<WorkspaceResponse[]> => {
  const { workspaces } = await trpcClient.workspace.list.query({ limit: 100 });
  return workspaces as WorkspaceResponse[];
};

function lastPathSegment(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

const AgentComposerControls: React.FC<{ disabled?: boolean }> = ({
  disabled
}) => {
  const { t } = useTranslation("chat");
  const {
    agentModel,
    agentModels,
    agentModelsLoading,
    agentProvider,
    agentWorkspaceId,
    agentWorkspacePath,
    setAgentModel,
    setAgentProvider,
    setAgentWorkspace,
    loadAgentModels
  } = useGlobalChatStore(
    useShallow((s) => ({
      agentModel: s.agentModel,
      agentModels: s.agentModels,
      agentModelsLoading: s.agentModelsLoading,
      agentProvider: s.agentProvider,
      agentWorkspaceId: s.agentWorkspaceId,
      agentWorkspacePath: s.agentWorkspacePath,
      setAgentModel: s.setAgentModel,
      setAgentProvider: s.setAgentProvider,
      setAgentWorkspace: s.setAgentWorkspace,
      loadAgentModels: s.loadAgentModels
    }))
  );

  const { data: workspaces } = useQuery({
    queryKey: ["workspaces"],
    queryFn: fetchWorkspaces,
    enabled: agentProvider === "pi" && piWorkspaceAvailable
  });

  const [providerAnchor, setProviderAnchor] =
    useState<HTMLButtonElement | null>(null);
  const [modelAnchor, setModelAnchor] = useState<HTMLButtonElement | null>(null);
  const [workspaceAnchor, setWorkspaceAnchor] =
    useState<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (agentProvider !== "pi" || !workspaces || agentWorkspaceId) {
      return;
    }
    const def = workspaces.find((w) => w.is_default) ?? workspaces[0];
    if (def) {
      setAgentWorkspace(def.id, def.path);
    }
  }, [agentProvider, workspaces, agentWorkspaceId, setAgentWorkspace]);

  useEffect(() => {
    void loadAgentModels();
  }, [agentProvider, agentWorkspacePath, loadAgentModels]);

  const providerLabels = useMemo<Record<AgentProvider, string>>(
    () => ({
      morpheus: "Morpheus",
      llm: "LLM",
      pi: "Pi"
    }),
    []
  );

  const providerOptions = useMemo<MediaOption<AgentProvider>[]>(
    () =>
      (["morpheus", "llm", "pi"] as AgentProvider[]).map((provider) => ({
        id: provider,
        label: providerLabels[provider],
        icon: <SmartToyOutlinedIcon fontSize="small" />
      })),
    [providerLabels]
  );

  const modelOptions = useMemo<MediaOption<string>[]>(
    () =>
      agentModels.map((model) => ({
        id: model.id,
        label: model.label,
        icon: <SmartToyOutlinedIcon fontSize="small" />
      })),
    [agentModels]
  );

  const workspaceOptions = useMemo<MediaOption<string>[]>(
    () =>
      (workspaces ?? []).map((workspace) => ({
        id: workspace.id,
        label: workspace.path,
        icon: <FolderOutlinedIcon fontSize="small" />
      })),
    [workspaces]
  );

  const workspaceLabel =
    workspaces?.find((workspace) => workspace.id === agentWorkspaceId)?.path ??
    agentWorkspacePath ??
    t("agentWorkspace");
  const modelLabel =
    agentModels.find((model) => model.id === agentModel)?.label ||
    (agentModelsLoading ? t("loadingEllipsis") : agentModel || t("selectModel"));

  return (
    <>
      <MediaControlChip
        icon={<SmartToyOutlinedIcon fontSize="small" />}
        label={providerLabels[agentProvider]}
        active={!!providerAnchor}
        onClick={(event) => setProviderAnchor(event.currentTarget)}
        showChevron={false}
        truncate
        disabled={disabled}
      />
      <MediaOptionMenu
        anchorEl={providerAnchor}
        open={!!providerAnchor}
        onClose={() => setProviderAnchor(null)}
        header={t("agentProvider")}
        value={agentProvider}
        options={providerOptions}
        onChange={(provider) => setAgentProvider(provider)}
      />

      {agentProvider === "pi" && (
        <>
          <MediaControlChip
            icon={<FolderOutlinedIcon fontSize="small" />}
            label={lastPathSegment(workspaceLabel)}
            active={!!workspaceAnchor}
            onClick={(event) => setWorkspaceAnchor(event.currentTarget)}
            showChevron={false}
            truncate
            disabled={disabled || !piWorkspaceAvailable}
          />
          <MediaOptionMenu
            anchorEl={workspaceAnchor}
            open={!!workspaceAnchor}
            onClose={() => setWorkspaceAnchor(null)}
            header={t("agentWorkspace")}
            value={agentWorkspaceId ?? ""}
            options={workspaceOptions}
            onChange={(id) => {
              const workspace = workspaces?.find((item) => item.id === id);
              setAgentWorkspace(workspace?.id ?? null, workspace?.path ?? null);
            }}
          />
        </>
      )}

      <MediaControlChip
        icon={<SmartToyOutlinedIcon fontSize="small" />}
        label={modelLabel}
        active={!!modelAnchor}
        onClick={(event) => setModelAnchor(event.currentTarget)}
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
