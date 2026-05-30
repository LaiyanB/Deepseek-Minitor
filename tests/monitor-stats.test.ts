import { describe, expect, it } from "vitest";
import { createMonitorStats } from "../src/main/core/monitor-stats";
import type { UsageEvent } from "../src/main/core/usage-store";

describe("createMonitorStats", () => {
  it("builds compact today stats for the floating monitor", () => {
    const events: UsageEvent[] = [
      {
        id: "old",
        timestamp: "2026-05-09T23:59:00.000Z",
        model: "deepseek-v4-flash",
        apiKeyFingerprint: "sk-old",
        statusCode: 200,
        durationMs: 100,
        usage: {
          promptTokens: 10,
          completionTokens: 5,
          totalTokens: 15,
          promptCacheHitTokens: 5,
          promptCacheMissTokens: 5
        },
        cost: { model: "deepseek-v4-flash", currency: "CNY", costCny: 9, costUsd: 0 }
      },
      {
        id: "today",
        timestamp: "2026-05-10T12:00:00.000Z",
        model: "deepseek-v4-pro",
        apiKeyFingerprint: "sk-new",
        statusCode: 200,
        durationMs: 180,
        usage: {
          promptTokens: 100,
          completionTokens: 20,
          totalTokens: 120,
          promptCacheHitTokens: 70,
          promptCacheMissTokens: 30
        },
        cost: { model: "deepseek-v4-pro", currency: "CNY", costCny: 0.12, costUsd: 0 }
      },
      {
        id: "error",
        timestamp: "2026-05-10T12:01:00.000Z",
        model: "deepseek-v4-pro",
        apiKeyFingerprint: "sk-new",
        statusCode: 429,
        durationMs: 50,
        usage: null,
        cost: null,
        errorType: "upstream_error"
      },
      {
        id: "probe",
        timestamp: "2026-05-10T12:02:00.000Z",
        model: "unknown",
        apiKeyFingerprint: "sk-new",
        statusCode: 200,
        durationMs: 20,
        usage: null,
        cost: null
      }
    ];

    const stats = createMonitorStats(events, new Date("2026-05-10T12:03:00.000Z"));

    expect(stats).toMatchObject({
      todayCostCny: 0.12,
      todayTokens: 120,
      todayRequests: 2,
      todayErrors: 1,
      lastModel: "deepseek-v4-pro",
      lastStatusCode: 429
    });
  });

  it("breaks down model usage, cache tokens, output tokens, hit rate, and cost", () => {
    const events: UsageEvent[] = [
      {
        id: "flash",
        timestamp: "2026-05-10T10:00:00.000Z",
        model: "deepseek-v4-flash",
        apiKeyFingerprint: "sk-a",
        statusCode: 200,
        durationMs: 100,
        usage: {
          promptTokens: 1000,
          completionTokens: 250,
          totalTokens: 1250,
          promptCacheHitTokens: 800,
          promptCacheMissTokens: 200
        },
        cost: { model: "deepseek-v4-flash", currency: "CNY", costCny: 0.002, costUsd: 0 }
      },
      {
        id: "pro",
        timestamp: "2026-05-10T10:01:00.000Z",
        model: "deepseek-v4-pro",
        apiKeyFingerprint: "sk-b",
        statusCode: 200,
        durationMs: 120,
        usage: {
          promptTokens: 600,
          completionTokens: 400,
          totalTokens: 1000,
          promptCacheHitTokens: 150,
          promptCacheMissTokens: 450
        },
        cost: { model: "deepseek-v4-pro", currency: "CNY", costCny: 0.004, costUsd: 0 }
      }
    ];

    const stats = createMonitorStats(events, new Date("2026-05-10T12:00:00.000Z"));

    expect(stats.cacheHitTokens).toBe(950);
    expect(stats.cacheMissTokens).toBe(650);
    expect(stats.outputTokens).toBe(650);
    expect(stats.cacheHitRate).toBe(0.59375);
    expect(stats.modelBreakdown).toEqual([
      {
        model: "deepseek-v4-flash",
        requests: 1,
        totalTokens: 1250,
        cacheHitTokens: 800,
        cacheMissTokens: 200,
        outputTokens: 250,
        cacheHitRate: 0.8,
        costCny: 0.002,
        costUsd: 0
      },
      {
        model: "deepseek-v4-pro",
        requests: 1,
        totalTokens: 1000,
        cacheHitTokens: 150,
        cacheMissTokens: 450,
        outputTokens: 400,
        cacheHitRate: 0.25,
        costCny: 0.004,
        costUsd: 0
      }
    ]);
  });
});
