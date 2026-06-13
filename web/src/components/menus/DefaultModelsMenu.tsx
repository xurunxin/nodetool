import React, { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Text, FlexRow, EditorButton } from "../ui_primitives";
import useModelPreferencesStore from "../../stores/ModelPreferencesStore";
import LanguageModelSelect from "../properties/LanguageModelSelect";
import ImageModelSelect from "../properties/ImageModelSelect";
import EmbeddingModelSelect from "../properties/EmbeddingModelSelect";
import TTSModelSelect from "../properties/TTSModelSelect";
import ASRModelSelect from "../properties/ASRModelSelect";
import VideoModelSelect from "../properties/VideoModelSelect";

const MODEL_TYPE_CONFIG = [
  {
    type: "language_model",
    labelKey: "languageModel",
    Select: LanguageModelSelect
  },
  { type: "image_model", labelKey: "imageModel", Select: ImageModelSelect },
  {
    type: "embedding_model",
    labelKey: "embeddingModel",
    Select: EmbeddingModelSelect
  },
  {
    type: "tts_model",
    labelKey: "textToSpeechModel",
    Select: TTSModelSelect
  },
  {
    type: "asr_model",
    labelKey: "speechRecognitionModel",
    Select: ASRModelSelect
  },
  { type: "video_model", labelKey: "videoModel", Select: VideoModelSelect }
] as const;

function DefaultModelsMenu() {
  const { t } = useTranslation(["settings", "models", "common"]);
  const defaults = useModelPreferencesStore((s) => s.defaults);
  const setDefault = useModelPreferencesStore((s) => s.setDefault);
  const clearDefault = useModelPreferencesStore((s) => s.clearDefault);

  return (
    <div>
      <Text size="big" id="default-models" className="settings-heading">
        {t("settings:defaultModels")}
      </Text>
      <Text className="description" sx={{ mb: 2 }}>
        {t("settings:defaultModelsDescription")}
      </Text>

      <div className="default-models-list">
        {MODEL_TYPE_CONFIG.map(({ type, labelKey, Select }) => (
          <DefaultModelRow
            key={type}
            modelType={type}
            label={t(`models:${labelKey}`)}
            Select={Select}
            current={defaults[type]}
            onSelect={setDefault}
            onClear={clearDefault}
            clearLabel={t("common:clear")}
          />
        ))}
      </div>
    </div>
  );
}

interface DefaultModelRowProps {
  modelType: string;
  label: string;
  Select: React.ComponentType<{
    onChange: (value: unknown) => void;
    value: string;
  }>;
  current?: { provider: string; id: string; name: string };
  clearLabel: string;
  onSelect: (
    modelType: string,
    model: { provider: string; id: string; name: string }
  ) => void;
  onClear: (modelType: string) => void;
}

function DefaultModelRow({
  modelType,
  label,
  Select,
  current,
  clearLabel,
  onSelect,
  onClear
}: DefaultModelRowProps) {
  const handleChange = useCallback(
    (value: unknown) => {
      const v = value as { provider?: string; id?: string; name?: string };
      if (v?.id) {
        onSelect(modelType, {
          provider: v.provider || "",
          id: v.id,
          name: v.name || ""
        });
      }
    },
    [modelType, onSelect]
  );

  const handleClear = useCallback(() => {
    onClear(modelType);
  }, [modelType, onClear]);

  return (
    <div className="default-model-row" id={`default-model-${modelType}`}>
      <Text weight={600}>{label}</Text>
      <FlexRow align="center" gap={1}>
        <Select onChange={handleChange} value={current?.id || ""} />
        {current && (
          <EditorButton size="small" onClick={handleClear}>
            {clearLabel}
          </EditorButton>
        )}
      </FlexRow>
    </div>
  );
}

export default React.memo(DefaultModelsMenu);
