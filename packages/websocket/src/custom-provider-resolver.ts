import Anthropic from "@anthropic-ai/sdk";
import { getSecret as getStoredSecret } from "@nodetool-ai/models";
import {
  AnthropicProvider,
  getProvider,
  OpenAIProvider,
  type BaseProvider,
  type LanguageModel
} from "@nodetool-ai/runtime";
import OpenAI from "openai";
import {
  customEndpointProviderId,
  customEndpointSecretKey,
  listCustomModelEndpoints
} from "./custom-model-endpoints.js";
import { isProviderVisibleForSurface } from "./model-surface.js";

function secretResolverFor(userId: string) {
  return (key: string) =>
    getStoredSecret(key, userId).then((value) => value ?? undefined);
}

function endpointLanguageModels(
  endpoint: Awaited<ReturnType<typeof listCustomModelEndpoints>>[number],
  providerId: string
): LanguageModel[] {
  return endpoint.models.map((model) => ({
    id: model.id,
    name: model.name || model.id,
    provider: providerId
  }));
}

function withEndpointModelDiscovery<T extends BaseProvider>(
  provider: T,
  endpoint: Awaited<ReturnType<typeof listCustomModelEndpoints>>[number],
  providerId: string
): T {
  provider.getAvailableLanguageModels = async () =>
    endpointLanguageModels(endpoint, providerId);
  return provider;
}

type AnthropicProviderOptionsWithProviderId = NonNullable<
  ConstructorParameters<typeof AnthropicProvider>[1]
> & {
  providerId: string;
};

export async function resolveNodeToolProvider(
  providerId: string,
  userId: string
): Promise<BaseProvider> {
  if (!providerId.startsWith("custom:")) {
    const normalizedProviderId = providerId.toLowerCase();
    if (!isProviderVisibleForSurface(normalizedProviderId)) {
      throw new Error(
        `Provider "${normalizedProviderId}" is disabled by the current model surface`
      );
    }
    return getProvider(normalizedProviderId, secretResolverFor(userId));
  }

  const endpointId = providerId.slice("custom:".length);
  const endpoint = (await listCustomModelEndpoints(userId)).find(
    (candidate) => candidate.id === endpointId && candidate.enabled
  );
  if (!endpoint) {
    throw new Error(
      `Enabled custom model endpoint "${endpointId}" was not found`
    );
  }

  const apiKey = await getStoredSecret(
    customEndpointSecretKey(endpointId),
    userId
  );
  if (!apiKey) {
    throw new Error(
      `API key is missing for custom model endpoint "${endpointId}"`
    );
  }

  const customProviderId = customEndpointProviderId(endpoint.id);
  if (endpoint.kind === "openai") {
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: apiKey },
      {
        providerId: customProviderId,
        clientFactory: (key) =>
          new OpenAI({ apiKey: key, baseURL: endpoint.baseUrl })
      }
    );
    return withEndpointModelDiscovery(provider, endpoint, customProviderId);
  }

  const options: AnthropicProviderOptionsWithProviderId = {
    providerId: customProviderId,
    clientFactory: (key) =>
      new Anthropic({ apiKey: key, baseURL: endpoint.baseUrl })
  };
  const provider = new AnthropicProvider({ ANTHROPIC_API_KEY: apiKey }, options);
  return withEndpointModelDiscovery(provider, endpoint, customProviderId);
}
