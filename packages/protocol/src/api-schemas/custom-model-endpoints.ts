import { z } from "zod";

export const customModelEndpointKindSchema = z.enum(["openai", "anthropic"]);

function parseIpv4(hostname: string): number[] | null {
  const parts = hostname.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const octets = parts.map((part) => {
    if (!/^\d+$/.test(part)) {
      return Number.NaN;
    }
    return Number(part);
  });
  return octets.every((octet) => Number.isInteger(octet) && octet >= 0 && octet <= 255)
    ? octets
    : null;
}

function isPrivateIpv4(octets: number[]): boolean {
  const [a, b] = octets;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isDisallowedEndpointHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (
    host === "localhost" ||
    host === "metadata.google.internal" ||
    host === "host.docker.internal" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  ) {
    return true;
  }

  const ipv4 = parseIpv4(host);
  if (ipv4) {
    return isPrivateIpv4(ipv4);
  }

  const isIpv6Literal = host.includes(":");
  if (
    isIpv6Literal &&
    (host === "::1" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      host.startsWith("fe80:"))
  ) {
    return true;
  }

  const ipv4Mapped = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (ipv4Mapped) {
    const mapped = parseIpv4(ipv4Mapped[1]);
    return mapped ? isPrivateIpv4(mapped) : true;
  }

  return false;
}

export function isAllowedCustomModelEndpointUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:" && !isDisallowedEndpointHost(url.hostname);
}

export const customModelEndpointBaseUrlSchema = z
  .string()
  .url()
  .refine(isAllowedCustomModelEndpointUrl, {
    message:
      "Custom model endpoint URL must be a public HTTPS URL; localhost, private, and link-local hosts are not allowed",
  });

export const customModelEndpointModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  contextWindow: z.number().int().positive().optional(),
});

export const customModelEndpointSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/),
  name: z.string().min(1),
  kind: customModelEndpointKindSchema,
  baseUrl: customModelEndpointBaseUrlSchema,
  enabled: z.boolean().default(true),
  models: z.array(customModelEndpointModelSchema).min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const customModelEndpointUpsertInputSchema = customModelEndpointSchema
  .omit({ createdAt: true, updatedAt: true })
  .extend({ apiKey: z.string().min(1).optional() });

export const customModelEndpointDeleteInputSchema = z.object({
  id: z.string().regex(/^[a-z0-9_-]+$/),
});

export type CustomModelEndpoint = z.infer<typeof customModelEndpointSchema>;
export type CustomModelEndpointUpsertInput = z.infer<
  typeof customModelEndpointUpsertInputSchema
>;
