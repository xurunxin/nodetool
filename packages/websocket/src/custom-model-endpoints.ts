import {
  customModelEndpointSchema,
  type CustomModelEndpoint,
  type CustomModelEndpointUpsertInput
} from "@nodetool-ai/protocol/api-schemas/custom-model-endpoints.js";
import { Setting, Secret, clearSecretCache } from "@nodetool-ai/models";

export const CUSTOM_MODEL_ENDPOINTS_SETTING = "custom_model_endpoints";

const CUSTOM_MODEL_ENDPOINTS_DESCRIPTION =
  "Custom OpenAI/Anthropic-compatible model endpoints";

export function customEndpointProviderId(endpointId: string): string {
  return `custom:${endpointId}`;
}

export function customEndpointSecretKey(endpointId: string): string {
  const safeId = endpointId.toUpperCase().replace(/-/g, "_");
  return `CUSTOM_MODEL_ENDPOINT_${safeId}_API_KEY`;
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
