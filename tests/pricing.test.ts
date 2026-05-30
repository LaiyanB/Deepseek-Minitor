import { describe, expect, it } from "vitest";
import {
  calculateUsageCost,
  createDefaultPricing,
  type UsageSnapshot
} from "../src/main/core/pricing";

describe("calculateUsageCost", () => {
  it("calculates cache-aware CNY cost for DeepSeek V4 Flash", () => {
    const usage: UsageSnapshot = {
      promptTokens: 750_000,
      completionTokens: 100_000,
      totalTokens: 850_000,
      promptCacheHitTokens: 500_000,
      promptCacheMissTokens: 250_000
    };

    const result = calculateUsageCost("deepseek-v4-flash", usage, createDefaultPricing());

    expect(result).toMatchObject({
      model: "deepseek-v4-flash",
      currency: "CNY",
      costCny: 0.46
    });
  });

  it("uses compatibility aliases for old DeepSeek model names", () => {
    const usage: UsageSnapshot = {
      promptTokens: 1_000_000,
      completionTokens: 1_000_000,
      totalTokens: 2_000_000,
      promptCacheHitTokens: 0,
      promptCacheMissTokens: 1_000_000
    };

    const result = calculateUsageCost("deepseek-chat", usage, createDefaultPricing());

    expect(result?.model).toBe("deepseek-v4-flash");
    expect(result?.costCny).toBe(3);
  });

  it("returns null instead of blocking the proxy when pricing is unknown", () => {
    const usage: UsageSnapshot = {
      promptTokens: 10,
      completionTokens: 5,
      totalTokens: 15,
      promptCacheHitTokens: 0,
      promptCacheMissTokens: 10
    };

    expect(calculateUsageCost("unknown-model", usage, createDefaultPricing())).toBeNull();
  });
});
