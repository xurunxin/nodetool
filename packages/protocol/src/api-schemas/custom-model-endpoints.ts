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

function parseIpv4MappedIpv6(host: string): number[] | null {
  const dotted = host.match(
    /^((::ffff)|(0:0:0:0:0:ffff)):(\d+\.\d+\.\d+\.\d+)$/,
  );
  if (dotted) {
    return parseIpv4(dotted[4]);
  }

  const parts = host.split(":");
  if (parts.length < 4) {
    return null;
  }

  const prefix = parts.slice(0, -2).join(":");
  if (prefix !== "::ffff" && prefix !== "0:0:0:0:0:ffff") {
    return null;
  }

  const [highPart, lowPart] = parts.slice(-2);
  if (
    !/^[0-9a-f]{1,4}$/.test(highPart) ||
    !/^[0-9a-f]{1,4}$/.test(lowPart)
  ) {
    return null;
  }

  const high = Number.parseInt(highPart, 16);
  const low = Number.parseInt(lowPart, 16);
  return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

function isIpv6LinkLocal(host: string): boolean {
  const firstSegment = host.split(":")[0];
  if (!/^[0-9a-f]{1,4}$/.test(firstSegment)) {
    return false;
  }
  const value = Number.parseInt(firstSegment, 16);
  return value >= 0xfe80 && value <= 0xfebf;
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

  const ipv4Mapped = parseIpv4MappedIpv6(host);
  if (ipv4Mapped) {
    return isPrivateIpv4(ipv4Mapped);
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
      isIpv6LinkLocal(host))
  ) {
    return true;
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
