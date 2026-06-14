import {
  customModelEndpointDeleteInputSchema,
  customModelEndpointSchema,
  customModelEndpointUpsertInputSchema
} from "@nodetool-ai/protocol/api-schemas/custom-model-endpoints.js";
import { z } from "zod";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import {
  deleteCustomModelEndpoint,
  listCustomModelEndpoints,
  upsertCustomModelEndpoint
} from "../../custom-model-endpoints.js";

export const customModelEndpointsRouter = router({
  list: protectedProcedure
    .output(z.object({ endpoints: z.array(customModelEndpointSchema) }))
    .query(async ({ ctx }) => ({
      endpoints: await listCustomModelEndpoints(ctx.userId)
    })),

  upsert: protectedProcedure
    .input(customModelEndpointUpsertInputSchema)
    .output(z.object({ endpoint: customModelEndpointSchema }))
    .mutation(async ({ ctx, input }) => ({
      endpoint: await upsertCustomModelEndpoint(ctx.userId, input)
    })),

  delete: protectedProcedure
    .input(customModelEndpointDeleteInputSchema)
    .output(z.object({ deleted: z.boolean() }))
    .mutation(async ({ ctx, input }) => ({
      deleted: await deleteCustomModelEndpoint(ctx.userId, input.id)
    }))
});
