import { z } from "zod";

export const customModelEndpointKindSchema = z.enum(["openai", "anthropic"]);

export const customModelEndpointModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  contextWindow: z.number().int().positive().optional(),
});

export const customModelEndpointSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  name: z.string().min(1),
  kind: customModelEndpointKindSchema,
  baseUrl: z.string().url(),
  enabled: z.boolean().default(true),
  models: z.array(customModelEndpointModelSchema).min(1),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export const customModelEndpointUpsertInputSchema = customModelEndpointSchema
  .omit({ createdAt: true, updatedAt: true })
  .extend({ apiKey: z.string().min(1).optional() });

export const customModelEndpointDeleteInputSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]+$/),
});

export type CustomModelEndpoint = z.infer<typeof customModelEndpointSchema>;
export type CustomModelEndpointUpsertInput = z.infer<
  typeof customModelEndpointUpsertInputSchema
>;
