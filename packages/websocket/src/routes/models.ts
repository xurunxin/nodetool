import type { FastifyPluginAsync } from "fastify";
import { bridge } from "../lib/bridge.js";
import { handleModelsApiRequest } from "../models-api.js";

function notFoundResponse(): Response {
  return new Response(JSON.stringify({ error: "Not found" }), {
    status: 404,
    headers: { "content-type": "application/json" }
  });
}

const modelsRoutes: FastifyPluginAsync = async (app) => {
  const handle = async (
    req: Parameters<typeof bridge>[0],
    reply: Parameters<typeof bridge>[1]
  ) => {
    await bridge(req, reply, async (request) => {
      return (await handleModelsApiRequest(request)) ?? notFoundResponse();
    });
  };

  app.all("/api/models", handle);
  app.all("/api/models/*", handle);
};

export default modelsRoutes;
