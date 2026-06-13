import React, { useState, useCallback, useMemo, useRef } from "react";
import isEqual from "fast-deep-equal";
import { useTranslation } from "react-i18next";
import LanguageModelMenuDialog from "../model_menu/LanguageModelMenuDialog";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import type {
  LanguageModel,
  LanguageModelValue,
  ModelPack,
  UnifiedModel
} from "../../stores/ApiTypes";
import { useLanguageModelsByProvider } from "../../hooks/useModelsByProvider";
import ModelSelectButton from "./shared/ModelSelectButton";

interface LanguageModelSelectProps {
  onChange: (value: LanguageModelValue) => void;
  value: string;
  allowedProviders?: string[];
  recommendedModels?: UnifiedModel[];
  modelPacks?: ModelPack[];
}

const LanguageModelSelect: React.FC<LanguageModelSelectProps> = ({
  onChange,
  value,
  allowedProviders,
  recommendedModels,
  modelPacks
}) => {
  const { t } = useTranslation("models");
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const addRecent = useModelPreferencesStore((s) => s.addRecent);

  // Use the same hook as the dialog to fetch models
  const { models: fetchedModels } = useLanguageModelsByProvider({
    allowedProviders
  });

  const currentSelectedModelDetails = useMemo(() => {
    if (!fetchedModels || !value) { return null; }
    return fetchedModels.find((m) => m.id === value);
  }, [fetchedModels, value]);

  const handleClick = useCallback((event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  const handleDialogModelSelect = useCallback(
    (model: LanguageModel) => {
      const modelToPass = {
        type: "language_model" as const,
        id: model.id,
        provider: model.provider,
        name: model.name || ""
      };
      onChange(modelToPass);
      addRecent({
        provider: model.provider || "",
        id: model.id || "",
        name: model.name || ""
      });
      setAnchorEl(null);
    },
    [onChange, addRecent]
  );

  return (
    <>
      <ModelSelectButton
        ref={buttonRef}
        active={!!value}
        label={currentSelectedModelDetails?.name || value || t("selectModel")}
        secondaryLabel={currentSelectedModelDetails?.provider}
        subLabel={t("selectLanguageModel")}
        onClick={handleClick}
      />
      <LanguageModelMenuDialog
        open={!!anchorEl}
        anchorEl={anchorEl}
        onClose={handleClose}
        onModelChange={handleDialogModelSelect}
        allowedProviders={allowedProviders}
        recommendedModels={recommendedModels}
        modelPacks={modelPacks}
      />
    </>
  );
};

export default React.memo(LanguageModelSelect, isEqual);
