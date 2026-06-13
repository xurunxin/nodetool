import {
  customModelEndpointDeleteInputSchema,
  customModelEndpointUpsertInputSchema
} from "@nodetool-ai/protocol/api-schemas/custom-model-endpoints.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import {
  deleteCustomModelEndpoint,
  listCustomModelEndpoints,
  upsertCustomModelEndpoint
} from "../../custom-model-endpoints.js";

export const customModelEndpointsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => ({
    endpoints: await listCustomModelEndpoints(ctx.userId)
  })),

  upsert: protectedProcedure
    .input(customModelEndpointUpsertInputSchema)
    .mutation(async ({ ctx, input }) => ({
      endpoint: await upsertCustomModelEndpoint(ctx.userId, input)
    })),

  delete: protectedProcedure
    .input(customModelEndpointDeleteInputSchema)
    .mutation(async ({ ctx, input }) => ({
      deleted: await deleteCustomModelEndpoint(ctx.userId, input.id)
    }))
});
