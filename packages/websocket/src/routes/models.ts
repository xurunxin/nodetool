import type {
  FastifyPluginAsync,
  FastifyReply,
  FastifyRequest
} from "fastify";
import { bridge } from "../lib/bridge.js";
import { handleModelsApiRequest } from "../models-api.js";

const modelsRoutes: FastifyPluginAsync = async (app) => {
  const forwardModelsRequest = async (
    req: FastifyRequest,
    reply: FastifyReply
  ) => {
    await bridge(req, reply, async (request) => {
      return (
        (await handleModelsApiRequest(request)) ??
        new Response(JSON.stringify({ detail: "Not found" }), {
          status: 404,
          headers: { "content-type": "application/json" }
        })
      );
    });
  };

  app.all("/api/models", forwardModelsRequest);
  app.all("/api/models/*", forwardModelsRequest);
};

export default modelsRoutes;
