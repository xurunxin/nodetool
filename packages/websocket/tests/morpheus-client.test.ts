import { describe, expect, it } from "vitest";
import {
  MorpheusClient,
  parseMorpheusSseFrame,
  type MorpheusStreamEvent,
} from "../src/agent/morpheus-client.js";

type FetchCall = {
  input: string | URL;
  init?: RequestInit;
};

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      ...Object.fromEntries(new Headers(init.headers).entries()),
    },
  });
}

function sseResponse(chunks: string[]): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
      },
    },
  );
}

function queuedFetch(responses: Response[]): {
  fetchFn: FetchLike;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  return {
    calls,
    fetchFn: async (input, init) => {
      calls.push({ input, init });
      const response = responses.shift();
      if (!response) {
        throw new Error("No queued response");
      }
      return response;
    },
  };
}

function readJsonBody(init: RequestInit | undefined): Record<string, unknown> {
  expect(typeof init?.body).toBe("string");
  return JSON.parse(String(init?.body)) as Record<string, unknown>;
}

describe("MorpheusClient", () => {
  it("creates sessions with Morpheus public API headers and agentName", async () => {
    const { fetchFn, calls } = queuedFetch([
      jsonResponse({
        id: "sess_abc123",
        agentName: "nodetool-canvas",
        createdAt: "2026-06-14T00:00:00Z",
        updatedAt: "2026-06-14T00:00:00Z",
      }),
    ]);
    const client = new MorpheusClient({
      baseUrl: "http://localhost:3000/",
      apiKey: "sk-test",
      fetchFn,
    });

    const session = await client.createSession({
      agentName: "nodetool-canvas",
    });

    expect(session.id).toBe("sess_abc123");
    expect(calls).toHaveLength(1);
    expect(String(calls[0].input)).toBe(
      "http://localhost:3000/api/v1/sessions",
    );
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.headers).toMatchObject({
      "Content-Type": "application/json",
      "X-API-Key": "sk-test",
    });
    expect(readJsonBody(calls[0].init)).toEqual({
      agentName: "nodetool-canvas",
    });
  });

  it("streams prompt SSE events across arbitrary chunk boundaries", async () => {
    const { fetchFn, calls } = queuedFetch([
      sseResponse([
        'event: session\ndata: {"sessionId":"sess_abc123"}\n\n',
        'event: text_delta\ndata: {"contentIndex":0,"delta":"Hel',
        'lo"}\n\n',
        'event: thinking_delta\ndata: {"contentIndex":1,"delta":"思考"}\n\n',
        'event: tool_start\ndata: {"toolCallId":"call_1","toolName":"ui_graph","arguments":{"action":"inspect"},"workDescription":"Inspecting canvas"}\n\n',
        'event: tool_end\ndata: {"toolCallId":"call_1","toolName":"ui_graph","result":"ok","isError":false,"details":null}\n\n',
        "event: done\ndata:\n\n",
      ]),
    ]);
    const client = new MorpheusClient({
      baseUrl: "http://localhost:3000",
      apiKey: "sk-test",
      fetchFn,
    });

    const events: MorpheusStreamEvent[] = [];
    for await (const event of client.streamPrompt({
      query: "build a workflow",
      sessionId: "sess_abc123",
      agentName: "nodetool-canvas",
      thinkingLevel: "low",
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "session", sessionId: "sess_abc123" },
      { type: "text_delta", text: "Hello" },
      { type: "thinking_delta", text: "思考" },
      {
        type: "tool_call",
        id: "call_1",
        name: "ui_graph",
        arguments: { action: "inspect" },
        workDescription: "Inspecting canvas",
      },
      {
        type: "tool_result",
        id: "call_1",
        name: "ui_graph",
        result: "ok",
        isError: false,
        details: null,
      },
      { type: "done" },
    ]);
    expect(String(calls[0].input)).toBe(
      "http://localhost:3000/api/v1/prompt/stream",
    );
    expect(calls[0].init?.headers).toMatchObject({
      Accept: "text/event-stream",
      "Content-Type": "application/json",
      "X-API-Key": "sk-test",
    });
    expect(readJsonBody(calls[0].init)).toEqual({
      query: "build a workflow",
      sessionId: "sess_abc123",
      agentName: "nodetool-canvas",
      thinkingLevel: "low",
    });
  });

  it("maps completed toolcall events as a fallback when tool_start is absent", () => {
    const event = parseMorpheusSseFrame(
      [
        "event: toolcall_end",
        'data: {"toolCall":{"id":"call_2","type":"function","function":{"name":"search","arguments":"{\\"query\\":\\"morpheus\\"}"}}}',
        "",
      ].join("\n"),
    );

    expect(event).toEqual({
      type: "tool_call",
      id: "call_2",
      name: "search",
      arguments: { query: "morpheus" },
    });
  });

  it("maps Morpheus error events", () => {
    const event = parseMorpheusSseFrame(
      [
        "event: error",
        'data: {"error":{"code":"AGENT_ERROR","message":"boom"}}',
        "",
      ].join("\n"),
    );

    expect(event).toEqual({
      type: "error",
      code: "AGENT_ERROR",
      message: "boom",
    });
  });

  it("throws readable errors for failed HTTP responses", async () => {
    const { fetchFn } = queuedFetch([
      jsonResponse(
        {
          error: {
            code: "UNAUTHORIZED",
            message: "Invalid API key",
          },
        },
        { status: 401 },
      ),
    ]);
    const client = new MorpheusClient({
      baseUrl: "http://localhost:3000",
      apiKey: "bad-key",
      fetchFn,
    });

    await expect(client.createSession()).rejects.toThrow(
      "Morpheus request failed (401): Invalid API key",
    );
  });
});
