import { describe, expect, it } from "vitest";

import {
  MorpheusClient,
  type MorpheusStreamEvent,
  parseMorpheusSseFrame,
} from "../src/agent/morpheus-client.js";

const jsonResponse = (body: unknown, init?: ResponseInit) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });

const streamResponse = (chunks: string[], init?: ResponseInit) => {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { "content-type": "text/event-stream" },
      ...init,
    },
  );
};

const trackedStreamResponse = (chunks: string[], close: boolean) => {
  const encoder = new TextEncoder();
  let cancelCount = 0;

  const response = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        if (close) {
          controller.close();
        }
      },
      cancel() {
        cancelCount += 1;
      },
    }),
    {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    },
  );

  return {
    response,
    getCancelCount: () => cancelCount,
  };
};

const makeFetchMock = (responses: Response[]) => {
  const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
  const fetchFn: typeof fetch = async (input, init) => {
    calls.push({ input, init });
    const response = responses.shift();
    if (response === undefined) {
      throw new Error("Unexpected fetch call");
    }
    return response;
  };

  return { fetchFn, calls };
};

const collectStream = async (stream: AsyncIterable<MorpheusStreamEvent>) => {
  const events: MorpheusStreamEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
};

describe("parseMorpheusSseFrame", () => {
  it("maps text and thinking deltas", () => {
    expect(
      parseMorpheusSseFrame('data: {"type":"text_delta","delta":"hello"}'),
    ).toEqual({ type: "text_delta", text: "hello" });
    expect(
      parseMorpheusSseFrame(
        'data: {"type":"thinking_delta","text":"working"}',
      ),
    ).toEqual({ type: "thinking_delta", text: "working" });
  });

  it("joins multiple data lines before parsing", () => {
    expect(
      parseMorpheusSseFrame(
        'event: message\r\ndata: {"type":"text_delta",\r\ndata: "delta":"hello"}',
      ),
    ).toEqual({ type: "text_delta", text: "hello" });
  });

  it("maps tool_call and toolcall_end payloads", () => {
    expect(
      parseMorpheusSseFrame(
        'data: {"type":"tool_call","id":"tool-1","name":"search","arguments":{"query":"x"}}',
      ),
    ).toEqual({
      type: "tool_call",
      id: "tool-1",
      name: "search",
      arguments: { query: "x" },
    });
    expect(
      parseMorpheusSseFrame(
        'data: {"type":"toolcall_end","id":"tool-2","name":"calc","args":{"n":2}}',
      ),
    ).toEqual({
      type: "tool_call",
      id: "tool-2",
      name: "calc",
      arguments: { n: 2 },
    });
  });

  it("maps done and error payloads", () => {
    expect(parseMorpheusSseFrame('data: {"type":"done"}')).toEqual({
      type: "done",
    });
    expect(
      parseMorpheusSseFrame('data: {"type":"error","error":"boom"}'),
    ).toEqual({ type: "error", message: "boom" });
    expect(parseMorpheusSseFrame('data: {"type":"error"}')).toEqual({
      type: "error",
      message: "Morpheus stream error",
    });
  });

  it("returns null for unknown payloads and frames without data", () => {
    expect(parseMorpheusSseFrame("event: ping")).toBeNull();
    expect(parseMorpheusSseFrame('data: {"type":"something_else"}')).toBeNull();
  });
});

describe("MorpheusClient.createSession", () => {
  it("trims the base URL and sends JSON headers and body", async () => {
    const { fetchFn, calls } = makeFetchMock([jsonResponse({ id: "s-1" })]);
    const client = new MorpheusClient({
      baseUrl: "https://morpheus.example/",
      apiKey: "secret",
      fetchFn,
    });

    await expect(client.createSession("agent-1", "user-1")).resolves.toEqual({
      id: "s-1",
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe("https://morpheus.example/api/v1/sessions");
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.headers).toEqual({
      "content-type": "application/json",
      authorization: "Bearer secret",
    });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      agentId: "agent-1",
      userId: "user-1",
    });
  });

  it("accepts sessionId responses and omits authorization without an API key", async () => {
    const { fetchFn, calls } = makeFetchMock([
      jsonResponse({ sessionId: "s-2" }),
    ]);
    const client = new MorpheusClient({
      baseUrl: "https://morpheus.example",
      fetchFn,
    });

    await expect(client.createSession("agent-1", "user-1")).resolves.toEqual({
      id: "s-2",
    });
    expect(calls[0].init?.headers).toEqual({
      "content-type": "application/json",
    });
  });

  it("throws on failed status or missing id", async () => {
    const failed = new MorpheusClient({
      baseUrl: "https://morpheus.example",
      fetchFn: makeFetchMock([
        jsonResponse({ message: "nope" }, { status: 500 }),
      ]).fetchFn,
    });
    await expect(failed.createSession("agent-1", "user-1")).rejects.toThrow(
      /create Morpheus session failed/i,
    );

    const missingId = new MorpheusClient({
      baseUrl: "https://morpheus.example",
      fetchFn: makeFetchMock([jsonResponse({})]).fetchFn,
    });
    await expect(missingId.createSession("agent-1", "user-1")).rejects.toThrow(
      /missing session id/i,
    );
  });
});

describe("MorpheusClient.streamPrompt", () => {
  it("streams split chunks and multiple frames per chunk", async () => {
    const { fetchFn } = makeFetchMock([
      streamResponse([
        'data: {"type":"text_delta","delta":"hel',
        'lo"}\n\n' +
          'data: {"type":"thinking_delta","delta":"hmm"}\n\n' +
          'data: {"type":"done"}',
      ]),
    ]);
    const client = new MorpheusClient({
      baseUrl: "https://morpheus.example",
      fetchFn,
    });

    await expect(
      collectStream(
        client.streamPrompt({ sessionId: "s-1", prompt: "hello" }),
      ),
    ).resolves.toEqual([
      { type: "text_delta", text: "hello" },
      { type: "thinking_delta", text: "hmm" },
      { type: "done" },
    ]);
  });

  it("sends authorization, body, tools, and signal", async () => {
    const controller = new AbortController();
    const { fetchFn, calls } = makeFetchMock([
      streamResponse(['data: {"type":"done"}\n\n']),
    ]);
    const client = new MorpheusClient({
      baseUrl: "https://morpheus.example/",
      apiKey: "secret",
      fetchFn,
    });

    await collectStream(
      client.streamPrompt({
        sessionId: "s-1",
        prompt: "hello",
        tools: [{ name: "search" }],
        signal: controller.signal,
      }),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0].input).toBe(
      "https://morpheus.example/api/v1/prompt/stream",
    );
    expect(calls[0].init?.method).toBe("POST");
    expect(calls[0].init?.headers).toEqual({
      "content-type": "application/json",
      authorization: "Bearer secret",
    });
    expect(calls[0].init?.signal).toBe(controller.signal);
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      sessionId: "s-1",
      prompt: "hello",
      tools: [{ name: "search" }],
    });
  });

  it("cancels the response body when the consumer exits early", async () => {
    const tracked = trackedStreamResponse(
      ['data: {"type":"text_delta","delta":"hello"}\n\n'],
      false,
    );
    const { fetchFn } = makeFetchMock([tracked.response]);
    const client = new MorpheusClient({
      baseUrl: "https://morpheus.example",
      fetchFn,
    });

    const events: MorpheusStreamEvent[] = [];
    for await (const event of client.streamPrompt({
      sessionId: "s-1",
      prompt: "hello",
    })) {
      events.push(event);
      break;
    }

    expect(events).toEqual([{ type: "text_delta", text: "hello" }]);
    expect(tracked.getCancelCount()).toBe(1);
  });

  it("does not cancel the response body after natural EOF", async () => {
    const tracked = trackedStreamResponse(['data: {"type":"done"}\n\n'], true);
    const { fetchFn } = makeFetchMock([tracked.response]);
    const client = new MorpheusClient({
      baseUrl: "https://morpheus.example",
      fetchFn,
    });

    await expect(
      collectStream(client.streamPrompt({ sessionId: "s-1", prompt: "hi" })),
    ).resolves.toEqual([{ type: "done" }]);
    expect(tracked.getCancelCount()).toBe(0);
  });

  it("throws on failed status or missing body", async () => {
    const failed = new MorpheusClient({
      baseUrl: "https://morpheus.example",
      fetchFn: makeFetchMock([streamResponse([], { status: 503 })]).fetchFn,
    });
    await expect(
      collectStream(failed.streamPrompt({ sessionId: "s-1", prompt: "hi" })),
    ).rejects.toThrow(/stream Morpheus prompt failed/i);

    const missingBody = new MorpheusClient({
      baseUrl: "https://morpheus.example",
      fetchFn: makeFetchMock([
        new Response(null, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      ]).fetchFn,
    });
    await expect(
      collectStream(
        missingBody.streamPrompt({ sessionId: "s-1", prompt: "hi" }),
      ),
    ).rejects.toThrow(/missing response body/i);
  });
});
