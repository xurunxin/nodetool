export const MODEL_SURFACE_MODES = ["api_first", "local_first"] as const;
export type ModelSurfaceMode = (typeof MODEL_SURFACE_MODES)[number];

const LOCAL_ONLY_PROVIDER_IDS = new Set([
  "ollama",
  "lmstudio",
  "llama_cpp",
  "vllm",
  "transformers_js"
]);

export function getModelSurfaceMode(
  env: NodeJS.ProcessEnv = process.env
): ModelSurfaceMode {
  return env["NODETOOL_MODEL_SURFACE"] === "local_first"
    ? "local_first"
    : "api_first";
}

export function isLocalModelManagementEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return getModelSurfaceMode(env) === "local_first";
}

export function isProviderVisibleForSurface(
  providerId: string,
  mode: ModelSurfaceMode = getModelSurfaceMode()
): boolean {
  if (mode === "local_first") {
    return true;
  }
  return !LOCAL_ONLY_PROVIDER_IDS.has(providerId.toLowerCase());
}

export function filterProviderIdsForSurface(
  providerIds: string[],
  mode: ModelSurfaceMode = getModelSurfaceMode()
): string[] {
  return providerIds.filter((providerId) =>
    isProviderVisibleForSurface(providerId, mode)
  );
}

export function filterModelsForSurface<
  T extends { provider?: string | null; model_type?: string | null }
>(models: T[], mode: ModelSurfaceMode = getModelSurfaceMode()): T[] {
  return models.filter((model) => {
    const providerId = model.provider ?? model.model_type ?? "";
    return isProviderVisibleForSurface(providerId, mode);
  });
}
