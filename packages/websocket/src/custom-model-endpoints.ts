import {
  customModelEndpointSchema,
  customModelEndpointUpsertInputSchema,
  type CustomModelEndpoint,
  type CustomModelEndpointUpsertInput
} from "@nodetool-ai/protocol/api-schemas/custom-model-endpoints.js";
import { Secret, Setting, clearSecretCache } from "@nodetool-ai/models";
import { clearProviderCache } from "@nodetool-ai/runtime";

export const CUSTOM_MODEL_ENDPOINTS_SETTING = "custom_model_endpoints";
const CUSTOM_ENDPOINTS_DESCRIPTION =
  "Custom OpenAI/Anthropic-compatible model endpoints";

export function customEndpointProviderId(endpointId: string): string {
  return `custom:${endpointId}`;
}

export function customEndpointSecretKey(endpointId: string): string {
  return `CUSTOM_MODEL_ENDPOINT_${endpointId.toUpperCase()}_API_KEY`;
}

function isSecretPlaceholder(value: string | undefined): boolean {
  return Boolean(value && value.split("").every((char) => char === "*"));
}

async function writeCustomModelEndpoints(
  userId: string,
  endpoints: CustomModelEndpoint[]
): Promise<void> {
  await Setting.upsert({
    userId,
    key: CUSTOM_MODEL_ENDPOINTS_SETTING,
    value: JSON.stringify(endpoints),
    description: CUSTOM_ENDPOINTS_DESCRIPTION
  });
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
  const parsedInput = customModelEndpointUpsertInputSchema.parse(input);
  const now = new Date().toISOString();
  const endpoints = await listCustomModelEndpoints(userId);
  const existing = endpoints.find(
    (endpoint) => endpoint.id === parsedInput.id
  );
  const endpoint = customModelEndpointSchema.parse({
    id: parsedInput.id,
    name: parsedInput.name,
    kind: parsedInput.kind,
    baseUrl: parsedInput.baseUrl,
    enabled: parsedInput.enabled,
    models: parsedInput.models,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  });

  const next = [
    ...endpoints.filter((candidate) => candidate.id !== endpoint.id),
    endpoint
  ].sort((a, b) => a.name.localeCompare(b.name));

  await writeCustomModelEndpoints(userId, next);

  if (parsedInput.apiKey && !isSecretPlaceholder(parsedInput.apiKey)) {
    const key = customEndpointSecretKey(parsedInput.id);
    await Secret.upsert({
      userId,
      key,
      value: parsedInput.apiKey,
      description: `API key for custom model endpoint ${parsedInput.name}`
    });
    clearSecretCache(userId, key);
  }

  clearProviderCache();
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

  await writeCustomModelEndpoints(userId, next);
  const key = customEndpointSecretKey(endpointId);
  await Secret.deleteSecret(userId, key);
  clearSecretCache(userId, key);
  clearProviderCache();
  return true;
}
