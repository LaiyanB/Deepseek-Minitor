import { createHash, randomUUID } from "node:crypto";
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { request as httpsRequest } from "node:https";
import { URL } from "node:url";
import { calculateUsageCost, type PricingConfig, type UsageSnapshot } from "../core/pricing";
import type { AppLanguage } from "../core/config-store";
import type { UsageStoreLike } from "../core/usage-store";
import { logError } from "../core/log";

export interface ProxyServerOptions {
  deepseekBaseUrl: string;
  store: UsageStoreLike;
  pricing: PricingConfig;
  language?: AppLanguage;
}

interface RequestMetadata {
  model: string;
  apiKeyFingerprint: string;
}

interface UpstreamUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
}

export function createProxyServer(options: ProxyServerOptions): Server {
  return createServer(async (clientRequest, clientResponse) => {
    try {
      if (clientRequest.method === "GET" && (clientRequest.url === "/" || clientRequest.url === "/health")) {
        const capturedRequests = (await options.store.list()).length;
        const host = clientRequest.headers.host ?? "127.0.0.1:8716";
        clientResponse.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        clientResponse.end(createStatusPage(options.language ?? "zh-CN", capturedRequests, host));
        return;
      }

      if (clientRequest.method === "OPTIONS") {
        clientResponse.writeHead(200);
        clientResponse.end();
        return;
      }

      // Auto-prepend /v1 if client sends paths without it (e.g. base_url = "http://127.0.0.1:8716/v1")
      if (clientRequest.url && !clientRequest.url.startsWith("/v1")) {
        clientRequest.url = "/v1" + (clientRequest.url.startsWith("/") ? "" : "/") + clientRequest.url;
      }

      const startedAt = Date.now();
      const requestBody = await readRequestBody(clientRequest);
      const metadata = extractRequestMetadata(clientRequest, requestBody);

      try {
        await forwardRequest(options, clientRequest, clientResponse, requestBody, metadata, startedAt);
      } catch (error) {
        clientResponse.writeHead(502, { "content-type": "application/json" });
        clientResponse.end(JSON.stringify({ error: "DeepSeek upstream request failed." }));
        void recordUsage(options, metadata, 502, startedAt, null, "upstream_request_failed");
        logError("Upstream request failed", error);
      }
    } catch (error) {
      logError("Proxy request handler error", error);
      try {
        if (!clientResponse.headersSent) {
          clientResponse.writeHead(500, { "content-type": "application/json" });
          clientResponse.end(JSON.stringify({ error: "Internal proxy error." }));
        }
      } catch {
        // Response already closed or client disconnected — nothing to do
      }
    }
  });
}

function createStatusPage(language: AppLanguage, capturedRequests: number, host: string): string {
  const zh = language === "zh-CN";
  const title = "DeepSeek Usage Monitor";
  const running = zh ? "代理正在运行。" : "Proxy is running.";
  const captured = zh ? `已捕获请求数：${capturedRequests}` : `Captured requests: ${capturedRequests}`;
  const description = zh
    ? "将这个本地地址设置为 DeepSeek 兼容客户端的 API base URL。代理自动处理 /v1/* API 请求，并且只记录用量元数据。"
    : "Use this local address as your DeepSeek-compatible API base URL. The proxy automatically handles /v1/* API requests and records metadata-only usage.";
  const notCaptured = zh
    ? "网页聊天和官方 App 不会被统计；只有 API 客户端请求这个本地代理时才会记录用量。"
    : "Web chat and the official app are not counted; only API clients pointed at this local proxy are recorded.";
  const hint = zh
    ? "完整仪表盘和 Win+G 风格监视模式在桌面托盘 App 中打开。按 Ctrl+Alt+D 可切换悬浮监视窗。"
    : "The full dashboard and Win+G-style monitor mode open in the desktop tray app. Press Ctrl+Alt+D to toggle the floating monitor.";

  return `<!doctype html>
<html lang="${zh ? "zh-CN" : "en"}">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f6f7f4;
        color: #17211d;
        font-family: "Segoe UI", Arial, sans-serif;
      }
      main {
        width: min(560px, calc(100% - 32px));
        border: 1px solid #dfe5df;
        border-radius: 8px;
        background: #fff;
        padding: 28px;
        box-shadow: 0 10px 30px rgba(23, 33, 29, 0.08);
      }
      h1 {
        margin: 0 0 10px;
        font-size: 24px;
      }
      p {
        margin: 8px 0;
        color: #66736d;
        line-height: 1.5;
      }
      code {
        display: block;
        margin-top: 16px;
        border-radius: 6px;
        background: #eef5f1;
        padding: 12px;
        color: #195f46;
        font-size: 15px;
      }
      strong {
        color: #217a59;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${title}</h1>
      <p><strong>${running}</strong></p>
      <p><strong>${captured}</strong></p>
      <p>${description.replace("/v1/*", "<code>/v1/*</code>")}</p>
      <code>http://${host}</code>
      <p>${notCaptured}</p>
      <p>${hint.replace("Ctrl+Alt+D", "<strong>Ctrl+Alt+D</strong>")}</p>
    </main>
  </body>
</html>`;
}

async function forwardRequest(
  options: ProxyServerOptions,
  clientRequest: IncomingMessage,
  clientResponse: ServerResponse,
  requestBody: Buffer,
  metadata: RequestMetadata,
  startedAt: number
): Promise<void> {
  const baseUrl = new URL(options.deepseekBaseUrl);
  let basePath = baseUrl.pathname.replace(/\/+$/, "");
  let incomingPath = clientRequest.url ?? "/";
  // If base has a path (e.g. /zen/go/v1), strip any leading segment
  // from the incoming path that duplicates the last segment of base
  if (basePath) {
    const baseLast = basePath.split("/").pop();
    if (baseLast && incomingPath.startsWith("/" + baseLast + "/")) {
      incomingPath = incomingPath.slice(("/" + baseLast).length);
    }
  }
  const upstreamUrl = new URL(basePath + incomingPath, baseUrl.origin);
  const transport = upstreamUrl.protocol === "https:" ? httpsRequest : httpRequest;
  const headers = { ...clientRequest.headers };
  // Strip hop-by-hop headers that should not be forwarded
  delete headers.host;
  delete headers["transfer-encoding"];
  delete headers.connection;
  delete headers["keep-alive"];
  delete headers["proxy-connection"];
  headers["content-length"] = Buffer.byteLength(requestBody).toString();
  // Anthropic-compatible endpoints use x-api-key; ensure it's set from Authorization
  if (!headers["x-api-key"] && headers.authorization) {
    const token = String(headers.authorization).replace(/^Bearer\s+/i, "").trim();
    if (token) {
      headers["x-api-key"] = token;
    }
  }

  await new Promise<void>((resolve, reject) => {
    const upstreamRequest = transport(
      upstreamUrl,
      {
        method: clientRequest.method,
        headers
      },
      (upstreamResponse) => {
        const chunks: Buffer[] = [];
        const responseHeaders = { ...upstreamResponse.headers };
        delete responseHeaders["transfer-encoding"];
        clientResponse.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders);

        upstreamResponse.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
          clientResponse.write(chunk);
        });

        upstreamResponse.on("end", () => {
          const responseBody = Buffer.concat(chunks);
          clientResponse.end();
          const usage = extractUsage(upstreamResponse, responseBody);
          void recordUsage(
            options,
            metadata,
            upstreamResponse.statusCode ?? 502,
            startedAt,
            usage,
            upstreamResponse.statusCode && upstreamResponse.statusCode >= 400 ? "upstream_error" : undefined
          );
          resolve();
        });
      }
    );

    upstreamRequest.on("error", reject);
    upstreamRequest.end(requestBody);
  });
}

async function recordUsage(
  options: ProxyServerOptions,
  metadata: RequestMetadata,
  statusCode: number,
  startedAt: number,
  usage: UsageSnapshot | null,
  errorType?: string
): Promise<void> {
  if (!usage && !errorType && statusCode < 400) {
    return;
  }

  await options.store.record({
    id: randomUUID(),
    timestamp: new Date(startedAt).toISOString(),
    model: metadata.model,
    apiKeyFingerprint: metadata.apiKeyFingerprint,
    statusCode,
    durationMs: Date.now() - startedAt,
    usage,
    cost: usage ? calculateUsageCost(metadata.model, usage, options.pricing) : null,
    ...(errorType ? { errorType } : {})
  });
}

async function readRequestBody(request: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

function extractRequestMetadata(request: IncomingMessage, body: Buffer): RequestMetadata {
  let model = "unknown";

  try {
    const parsed = JSON.parse(body.toString("utf8")) as { model?: unknown };
    if (typeof parsed.model === "string" && parsed.model.trim()) {
      model = parsed.model;
    }
  } catch {
    model = "unknown";
  }

  return {
    model,
    apiKeyFingerprint: fingerprintApiKey(request.headers.authorization)
  };
}

function fingerprintApiKey(authorization: string | string[] | undefined): string {
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  const token = value?.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    return "missing";
  }

  const digest = createHash("sha256").update(token).digest("hex").slice(0, 10);
  return `sk-${digest}`;
}

function extractUsage(response: IncomingMessage, body: Buffer): UsageSnapshot | null {
  const contentType = String(response.headers["content-type"] ?? "");
  const text = body.toString("utf8");

  if (contentType.includes("text/event-stream")) {
    return extractSseUsage(text);
  }

  if (!contentType.includes("application/json")) {
    return null;
  }

  try {
    const parsed = JSON.parse(text) as { usage?: UpstreamUsage };
    return normalizeUsage(parsed.usage);
  } catch {
    return null;
  }
}

function extractSseUsage(text: string): UsageSnapshot | null {
  let usage: UsageSnapshot | null = null;

  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data: ")) {
      continue;
    }

    const data = line.slice("data: ".length).trim();
    if (!data || data === "[DONE]") {
      continue;
    }

    try {
      const parsed = JSON.parse(data) as { usage?: UpstreamUsage | null };
      usage = normalizeUsage(parsed.usage) ?? usage;
    } catch {
      continue;
    }
  }

  return usage;
}

function normalizeUsage(usage: UpstreamUsage | null | undefined): UsageSnapshot | null {
  if (!usage) {
    return null;
  }

  const promptTokens = numberOrZero(usage.prompt_tokens);
  const completionTokens = numberOrZero(usage.completion_tokens);
  const totalTokens = numberOrZero(usage.total_tokens) || promptTokens + completionTokens;
  const promptCacheHitTokens = numberOrZero(usage.prompt_cache_hit_tokens);
  const promptCacheMissTokens =
    numberOrZero(usage.prompt_cache_miss_tokens) || Math.max(promptTokens - promptCacheHitTokens, 0);

  return {
    promptTokens,
    completionTokens,
    totalTokens,
    promptCacheHitTokens,
    promptCacheMissTokens
  };
}

function numberOrZero(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
