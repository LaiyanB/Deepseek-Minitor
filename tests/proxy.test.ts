import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { createProxyServer } from "../src/main/proxy/proxy-server";
import { InMemoryUsageStore } from "../src/main/core/usage-store";
import { createDefaultPricing } from "../src/main/core/pricing";

async function listen(server: Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      resolve((server.address() as AddressInfo).port);
    });
  });
}

async function close(server?: Server): Promise<void> {
  if (!server?.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

describe("proxy server", () => {
  let upstream: Server | undefined;
  let proxy: Server | undefined;

  afterEach(async () => {
    await close(proxy);
    await close(upstream);
  });

  it("serves a local status page at the proxy root", async () => {
    const store = new InMemoryUsageStore();
    await store.record({
      id: "existing",
      timestamp: "2026-05-10T12:00:00.000Z",
      model: "deepseek-v4-flash",
      apiKeyFingerprint: "sk-test",
      statusCode: 200,
      durationMs: 50,
      usage: {
        promptTokens: 1,
        completionTokens: 1,
        totalTokens: 2,
        promptCacheHitTokens: 1,
        promptCacheMissTokens: 0
      },
      cost: { model: "deepseek-v4-flash", currency: "CNY", costCny: 0.000001, costUsd: 0 }
    });
    proxy = createProxyServer({
      deepseekBaseUrl: "http://127.0.0.1:65535",
      store,
      pricing: createDefaultPricing(),
      language: "zh-CN"
    });
    const proxyPort = await listen(proxy);

    const response = await fetch(`http://127.0.0.1:${proxyPort}/`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    expect(text).toContain("DeepSeek Usage Monitor");
    expect(text).toContain("代理正在运行");
    expect(text).toContain("已捕获请求数：1");
    expect(text).toContain("网页聊天和官方 App 不会被统计");
    expect(await store.list()).toHaveLength(1);
  });

  it("forwards non-streaming chat responses unchanged and records metadata usage", async () => {
    const upstreamBody = {
      id: "chatcmpl_test",
      model: "deepseek-v4-flash",
      choices: [{ message: { role: "assistant", content: "ok" } }],
      usage: {
        prompt_tokens: 1000,
        completion_tokens: 200,
        total_tokens: 1200,
        prompt_cache_hit_tokens: 400,
        prompt_cache_miss_tokens: 600
      }
    };
    let upstreamRequestBody = "";

    upstream = createServer((request, response) => {
      request.on("data", (chunk) => {
        upstreamRequestBody += chunk.toString("utf8");
      });
      request.on("end", () => {
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(upstreamBody));
      });
    });
    const upstreamPort = await listen(upstream);
    const store = new InMemoryUsageStore();
    proxy = createProxyServer({
      deepseekBaseUrl: `http://127.0.0.1:${upstreamPort}`,
      store,
      pricing: createDefaultPricing()
    });
    const proxyPort = await listen(proxy);

    const response = await fetch(`http://127.0.0.1:${proxyPort}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer secret-api-key"
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        messages: [{ role: "user", content: "公司的代码" }]
      })
    });

    const responseText = await response.text();
    const events = await store.list();

    expect(JSON.parse(responseText)).toEqual(upstreamBody);
    expect(JSON.parse(upstreamRequestBody).messages[0].content).toBe("公司的代码");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      model: "deepseek-v4-flash",
      apiKeyFingerprint: expect.stringMatching(/^sk-/),
      statusCode: 200,
      usage: {
        promptTokens: 1000,
        completionTokens: 200,
        totalTokens: 1200,
        promptCacheHitTokens: 400,
        promptCacheMissTokens: 600
      }
    });
    expect(JSON.stringify(events[0])).not.toContain("公司的代码");
    expect(JSON.stringify(events[0])).not.toContain("secret-api-key");
  });

  it("forwards streaming SSE unchanged and records usage from the final usage chunk", async () => {
    const sse = [
      'data: {"choices":[{"delta":{"content":"你"}}],"usage":null}',
      "",
      'data: {"choices":[],"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12,"prompt_cache_hit_tokens":6,"prompt_cache_miss_tokens":4}}',
      "",
      "data: [DONE]",
      ""
    ].join("\n");

    upstream = createServer((request, response) => {
      response.writeHead(200, { "content-type": "text/event-stream" });
      response.end(sse);
    });
    const upstreamPort = await listen(upstream);
    const store = new InMemoryUsageStore();
    proxy = createProxyServer({
      deepseekBaseUrl: `http://127.0.0.1:${upstreamPort}`,
      store,
      pricing: createDefaultPricing()
    });
    const proxyPort = await listen(proxy);

    const response = await fetch(`http://127.0.0.1:${proxyPort}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer sk-test123"
      },
      body: JSON.stringify({
        model: "deepseek-v4-flash",
        stream: true,
        stream_options: { include_usage: true },
        messages: [{ role: "user", content: "hello" }]
      })
    });

    const responseText = await response.text();
    const events = await store.list();

    expect(responseText).toBe(sse);
    expect(events).toHaveLength(1);
    expect(events[0].usage).toMatchObject({
      promptTokens: 10,
      completionTokens: 2,
      totalTokens: 12,
      promptCacheHitTokens: 6,
      promptCacheMissTokens: 4
    });
  });

  it("does not record successful probe responses that carry no usage", async () => {
    upstream = createServer((_request, response) => {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ object: "list", data: [] }));
    });
    const upstreamPort = await listen(upstream);
    const store = new InMemoryUsageStore();
    proxy = createProxyServer({
      deepseekBaseUrl: `http://127.0.0.1:${upstreamPort}`,
      store,
      pricing: createDefaultPricing()
    });
    const proxyPort = await listen(proxy);

    const response = await fetch(`http://127.0.0.1:${proxyPort}/v1/models`, {
      headers: { authorization: "Bearer sk-test123" }
    });

    expect(response.status).toBe(200);
    await expect(store.list()).resolves.toHaveLength(0);
  });
});
