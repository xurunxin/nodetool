import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import {
  AnthropicProvider,
  OpenAIProvider,
  getProvider,
  type BaseProvider
} from "@nodetool-ai/runtime";
import { getSecret as getStoredSecret } from "@nodetool-ai/models";
import {
  customEndpointProviderId,
  customEndpointSecretKey,
  listCustomModelEndpoints
} from "./custom-model-endpoints.js";

function setProviderId<T extends BaseProvider>(
  provider: T,
  providerId: string
): T {
  (provider as { provider: string }).provider = providerId;
  return provider;
}

export async function resolveNodeToolProvider(
  providerId: string,
  userId: string
): Promise<BaseProvider> {
  const trimmedProviderId = providerId.trim();
  const lowerProviderId = trimmedProviderId.toLowerCase();

  if (!lowerProviderId.startsWith("custom:")) {
    return getProvider(lowerProviderId, (key) =>
      getStoredSecret(key, userId).then((value) => value ?? undefined)
    );
  }

  const separatorIndex = trimmedProviderId.indexOf(":");
  const endpointId = trimmedProviderId.slice(separatorIndex + 1);
  const endpoint = (await listCustomModelEndpoints(userId)).find(
    (candidate) => candidate.id === endpointId && candidate.enabled
  );
  if (!endpoint) {
    throw new Error(`Custom model endpoint "${endpointId}" is not configured`);
  }

  const apiKey = await getStoredSecret(
    customEndpointSecretKey(endpoint.id),
    userId
  );
  if (!apiKey) {
    throw new Error(
      `API key for custom model endpoint "${endpointId}" is missing`
    );
  }

  const customProviderId = customEndpointProviderId(endpoint.id);
  if (endpoint.kind === "openai") {
    return new OpenAIProvider(
      { OPENAI_API_KEY: apiKey },
      {
        providerId: customProviderId,
        clientFactory: (key) =>
          new OpenAI({ apiKey: key, baseURL: endpoint.baseUrl })
      }
    );
  }

  return setProviderId(
    new AnthropicProvider(
      { ANTHROPIC_API_KEY: apiKey },
      {
        clientFactory: (key) =>
          new Anthropic({ apiKey: key, baseURL: endpoint.baseUrl })
      }
    ),
    customProviderId
  );
}
