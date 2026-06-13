import React, { useState, useCallback, useMemo, useRef, memo } from "react";
import isEqual from "fast-deep-equal";
import { useTranslation } from "react-i18next";
import {
  ListItemText,
  ListItemIcon
} from "@mui/material";
import { Text, Caption, LoadingSpinner, FlexRow } from "../ui_primitives";
import CheckIcon from "@mui/icons-material/Check";
import { useOllamaModels } from "../../hooks/useOllamaModels";
import { isElectron } from "../../lib/env";
import type { LlamaModelValue } from "../../stores/ApiTypes";
import ModelSelectButton from "./shared/ModelSelectButton";
import { EditorMenu, EditorMenuItem } from "../editor_ui";
// no providers here; always Ollama

interface LlamaModelSelectProps {
  onChange: (value: LlamaModelValue) => void;
  value: string;
}

const LlamaModelSelect = ({ onChange, value }: LlamaModelSelectProps) => {
  const { t } = useTranslation("models");
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const open = Boolean(anchorEl);

  const { ollamaModels, ollamaLoading, ollamaIsFetching, ollamaError } =
    useOllamaModels();

  const sortedModels = useMemo(() => {
    if (!ollamaModels || ollamaLoading || ollamaIsFetching || ollamaError)
      {return [] as Array<{ name: string; repo_id: string }>;}

    return ollamaModels
      .map((m) => ({
        name: m.name,
        repo_id: m.repo_id ?? m.name
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [ollamaModels, ollamaLoading, ollamaIsFetching, ollamaError]);

  const currentSelectedModelDetails = useMemo(() => {
    if (!ollamaModels || !value) {return null;}
    return ollamaModels.find((m) => m.repo_id === value) ?? null;
  }, [ollamaModels, value]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleModelSelect = useCallback(
    (repoId: string) => {
      onChange({
        type: "llama_model",
        repo_id: repoId
      });
      handleClose();
    },
    [onChange, handleClose]
  );

  const handleMenuItemClick = useCallback(
    (repoId: string) => () => {
      handleModelSelect(repoId);
    },
    [handleModelSelect]
  );

  // no providers menu; just one list of models

  return (
    <>
      <ModelSelectButton
        ref={buttonRef}
        active={!!value}
        label={currentSelectedModelDetails?.name || value || t("selectModel")}
        subLabel={t("selectModel")}
        onClick={handleClick}
      />
      <EditorMenu
        anchorEl={anchorEl}
        open={open}
        onClose={handleClose}
        paperSx={{
          minWidth: 280,
          maxHeight: 400
        }}
        anchorOrigin={{
          vertical: "top",
          horizontal: "left"
        }}
        transformOrigin={{
          vertical: "bottom",
          horizontal: "left"
        }}
      >
        {ollamaLoading ? (
          <FlexRow
            justify="center"
            sx={{ padding: 2 }}
          >
            <LoadingSpinner size="medium" />
          </FlexRow>
        ) : ollamaError ? (
          <div style={{ padding: 8, maxWidth: 300 }}>
            <Text size="small" color="error" sx={{ mb: 1 }}>
              {t("couldNotLoadOllamaModels")}
            </Text>
            <Caption
              color="secondary"
              sx={{ display: "block", mb: 1 }}
            >
              {typeof (ollamaError as { detail?: unknown })?.detail === "string"
                ? (ollamaError as { detail?: string }).detail
                : t("checkOllamaRunning")}
            </Caption>
            {isElectron ? (
              <Caption
                color="warning"
                sx={{ display: "block", mt: 1 }}
              >
                {t("restartApplication")}
              </Caption>
            ) : (
              <Caption
                component="a"
                href="https://ollama.com/download"
                target="_blank"
                rel="noopener noreferrer"
                sx={{ color: "primary.main", textDecoration: "underline" }}
              >
                {t("downloadOllama")}
              </Caption>
            )}
          </div>
        ) : sortedModels.length === 0 ? (
          <EditorMenuItem disabled>
            <ListItemText primary={t("noModelsAvailable")} />
          </EditorMenuItem>
        ) : (
          sortedModels.map((model) => (
            <EditorMenuItem
              key={model.repo_id}
              onClick={handleMenuItemClick(model.repo_id)}
              selected={value === model.repo_id}
            >
              {value === model.repo_id && (
                <ListItemIcon>
                  <CheckIcon fontSize="small" />
                </ListItemIcon>
              )}
              <ListItemText
                inset={value !== model.repo_id}
                primary={model.name}
              />
            </EditorMenuItem>
          ))
        )}
      </EditorMenu>
    </>
  );
};

export default memo(LlamaModelSelect, isEqual);
