import Anthropic from "@anthropic-ai/sdk";
import type { Fetch as AnthropicFetch } from "@anthropic-ai/sdk/core.js";
import { lookup } from "node:dns/promises";
import { getSecret as getStoredSecret } from "@nodetool-ai/models";
import { isDisallowedEndpointHost } from "@nodetool-ai/protocol/api-schemas/custom-model-endpoints.js";
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

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type CustomEndpointFetch = (
  input: unknown,
  init?: RequestInit
) => Promise<Response>;

function secretResolverFor(userId: string) {
  return (key: string) =>
    getStoredSecret(key, userId).then((value) => value ?? undefined);
}

function urlFromFetchInput(input: unknown): URL {
  if (typeof input === "string" || input instanceof URL) {
    return new URL(input);
  }
  if (input instanceof Request) {
    return new URL(input.url);
  }

  const url = (input as { url?: unknown }).url;
  if (typeof url === "string" || url instanceof URL) {
    return new URL(url);
  }

  throw new Error("Custom model endpoint request URL is invalid");
}

async function assertPublicEndpointDestination(url: URL): Promise<void> {
  if (url.protocol !== "https:" || isDisallowedEndpointHost(url.hostname)) {
    throw new Error("Custom model endpoint request target is not allowed");
  }

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error("Custom model endpoint host did not resolve");
  }

  for (const address of addresses) {
    if (isDisallowedEndpointHost(address.address)) {
      throw new Error(
        "Custom model endpoint resolved to a private or link-local address"
      );
    }
  }
}

export function createProtectedCustomEndpointFetch(): CustomEndpointFetch {
  return async (input, init) => {
    const requestUrl = urlFromFetchInput(input);
    await assertPublicEndpointDestination(requestUrl);

    const response = await fetch(input as Parameters<typeof fetch>[0], {
      ...init,
      redirect: "manual"
    });
    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get("location");
      if (!location) {
        return response;
      }

      const redirectUrl = new URL(location, requestUrl);
      await assertPublicEndpointDestination(redirectUrl);
      if (redirectUrl.origin !== requestUrl.origin) {
        throw new Error("Custom model endpoint cross-host redirects are blocked");
      }
    }

    return response;
  };
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
  const protectedFetch = createProtectedCustomEndpointFetch();
  if (endpoint.kind === "openai") {
    const provider = new OpenAIProvider(
      { OPENAI_API_KEY: apiKey },
      {
        providerId: customProviderId,
        clientFactory: (key) =>
          new OpenAI({
            apiKey: key,
            baseURL: endpoint.baseUrl,
            fetch: protectedFetch
          })
      }
    );
    return withEndpointModelDiscovery(provider, endpoint, customProviderId);
  }

  const options: AnthropicProviderOptionsWithProviderId = {
    providerId: customProviderId,
    clientFactory: (key) =>
      new Anthropic({
        apiKey: key,
        baseURL: endpoint.baseUrl,
        fetch: protectedFetch as unknown as AnthropicFetch
      })
  };
  const provider = new AnthropicProvider({ ANTHROPIC_API_KEY: apiKey }, options);
  return withEndpointModelDiscovery(provider, endpoint, customProviderId);
}
