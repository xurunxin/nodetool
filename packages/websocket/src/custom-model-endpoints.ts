import {
  customModelEndpointSchema,
  type CustomModelEndpoint,
  type CustomModelEndpointUpsertInput
} from "@nodetool-ai/protocol/api-schemas/custom-model-endpoints.js";
import type { UnifiedModel } from "@nodetool-ai/protocol";
import {
  Setting,
  Secret,
  clearSecretCache,
  getSecret as getStoredSecret
} from "@nodetool-ai/models";
import { Buffer } from "node:buffer";

export const CUSTOM_MODEL_ENDPOINTS_SETTING = "custom_model_endpoints";

const CUSTOM_MODEL_ENDPOINTS_DESCRIPTION =
  "Custom OpenAI/Anthropic-compatible model endpoints";

export const CUSTOM_MODEL_ENDPOINT_LANGUAGE_CAPABILITIES = [
  "generate_message",
  "generate_messages"
] as const;

export function customEndpointProviderId(endpointId: string): string {
  return `custom:${endpointId}`;
}

export function customEndpointSecretKey(endpointId: string): string {
  const encodedId = Buffer.from(endpointId, "utf8")
    .toString("hex")
    .toUpperCase();
  return `CUSTOM_MODEL_ENDPOINT_HEX_${encodedId}_API_KEY`;
}

export async function listCustomModelEndpoints(
  userId: string
): Promise<CustomModelEndpoint[]> {
  const setting = await Setting.find(userId, CUSTOM_MODEL_ENDPOINTS_SETTING);
  if (!setting) {
    return [];
  }

  const raw = JSON.parse(setting.getValue()) as unknown;
  return customModelEndpointSchema.array().parse(raw);
}

export function enabledCustomModelEndpoints(
  endpoints: CustomModelEndpoint[]
): CustomModelEndpoint[] {
  return endpoints.filter((endpoint) => endpoint.enabled);
}

export async function listEnabledCustomModelEndpoints(
  userId: string
): Promise<CustomModelEndpoint[]> {
  const endpoints = enabledCustomModelEndpoints(
    await listCustomModelEndpoints(userId)
  );
  const endpointsWithSecrets = await Promise.all(
    endpoints.map(async (endpoint) => {
      const secret = await getStoredSecret(
        customEndpointSecretKey(endpoint.id),
        userId
      );
      return typeof secret === "string" && secret.trim().length > 0
        ? endpoint
        : null;
    })
  );
  return endpointsWithSecrets.filter(
    (endpoint): endpoint is CustomModelEndpoint => endpoint !== null
  );
}

export function customEndpointModelsToUnified(
  endpoint: CustomModelEndpoint
): UnifiedModel[] {
  const provider = customEndpointProviderId(endpoint.id);
  return endpoint.models.map((model) => ({
    id: model.id,
    type: "language_model",
    name: model.name,
    provider,
    repo_id: null,
    path: null,
    downloaded: false,
    tags: [provider],
    supports_tools: null
  }));
}

export async function getCustomEndpointLanguageModels(
  userId: string
): Promise<UnifiedModel[]> {
  const endpoints = await listEnabledCustomModelEndpoints(userId);
  return endpoints.flatMap(customEndpointModelsToUnified);
}

export async function getCustomEndpointLanguageModelsByProvider(
  userId: string,
  provider: string
): Promise<UnifiedModel[]> {
  if (!provider.startsWith("custom:")) {
    return [];
  }
  const endpointId = provider.slice("custom:".length);
  const endpoints = await listEnabledCustomModelEndpoints(userId);
  const endpoint = endpoints.find((candidate) => candidate.id === endpointId);
  return endpoint ? customEndpointModelsToUnified(endpoint) : [];
}

export async function getCustomEndpointProviderInfos(
  userId: string
): Promise<Array<{ provider: string; capabilities: string[] }>> {
  const endpoints = await listEnabledCustomModelEndpoints(userId);
  return endpoints.map((endpoint) => ({
    provider: customEndpointProviderId(endpoint.id),
    capabilities: [...CUSTOM_MODEL_ENDPOINT_LANGUAGE_CAPABILITIES]
  }));
}

export async function upsertCustomModelEndpoint(
  userId: string,
  input: CustomModelEndpointUpsertInput
): Promise<CustomModelEndpoint> {
  const now = new Date().toISOString();
  const endpoints = await listCustomModelEndpoints(userId);
  const existing = endpoints.find((endpoint) => endpoint.id === input.id);
  const endpoint = customModelEndpointSchema.parse({
    id: input.id,
    name: input.name,
    kind: input.kind,
    baseUrl: input.baseUrl,
    enabled: input.enabled,
    models: input.models,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  });
  const next = [
    ...endpoints.filter((candidate) => candidate.id !== input.id),
    endpoint
  ].sort((a, b) => a.name.localeCompare(b.name));

  await Setting.upsert({
    userId,
    key: CUSTOM_MODEL_ENDPOINTS_SETTING,
    value: JSON.stringify(next),
    description: CUSTOM_MODEL_ENDPOINTS_DESCRIPTION
  });

  if (input.apiKey && input.apiKey !== "****") {
    const key = customEndpointSecretKey(input.id);
    await Secret.upsert({
      userId,
      key,
      value: input.apiKey,
      description: `API key for custom model endpoint ${input.name}`
    });
    clearSecretCache(userId, key);
  }

  return endpoint;
}

export async function deleteCustomModelEndpoint(
  userId: string,
  endpointId: string
): Promise<boolean> {
  const endpoints = await listCustomModelEndpoints(userId);
  const next = endpoints.filter((endpoint) => endpoint.id !== endpointId);
  if (next.length === endpoints.length) {
    return false;
  }

  await Setting.upsert({
    userId,
    key: CUSTOM_MODEL_ENDPOINTS_SETTING,
    value: JSON.stringify(next),
    description: CUSTOM_MODEL_ENDPOINTS_DESCRIPTION
  });

  const key = customEndpointSecretKey(endpointId);
  await Secret.deleteSecret(userId, key);
  clearSecretCache(userId, key);
  return true;
}
