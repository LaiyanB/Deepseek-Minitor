export interface UsageSnapshot {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  promptCacheHitTokens: number;
  promptCacheMissTokens: number;
}

export interface ModelPricing {
  displayName: string;
  inputCacheHitCnyPerMillion: number;
  inputCacheMissCnyPerMillion: number;
  outputCnyPerMillion: number;
  inputCacheHitUsdPerMillion: number;
  inputCacheMissUsdPerMillion: number;
  outputUsdPerMillion: number;
}

export interface PricingConfig {
  currency: "CNY";
  updatedAt: string;
  models: Record<string, ModelPricing>;
  aliases: Record<string, string>;
}

export interface UsageCost {
  model: string;
  currency: "CNY";
  costCny: number;
  costUsd: number;
}

const MILLION = 1_000_000;

export function createDefaultPricing(): PricingConfig {
  return {
    currency: "CNY",
    updatedAt: "2026-05-31",
    models: {
      "deepseek-v4-flash": {
        displayName: "DeepSeek V4 Flash",
        inputCacheHitCnyPerMillion: 0.02,
        inputCacheMissCnyPerMillion: 1,
        outputCnyPerMillion: 2,
        inputCacheHitUsdPerMillion: 0.0028,
        inputCacheMissUsdPerMillion: 0.14,
        outputUsdPerMillion: 0.28
      },
      "deepseek-v4-pro": {
        displayName: "DeepSeek V4 Pro",
        inputCacheHitCnyPerMillion: 0.026,
        inputCacheMissCnyPerMillion: 3.11,
        outputCnyPerMillion: 6.21,
        inputCacheHitUsdPerMillion: 0.003625,
        inputCacheMissUsdPerMillion: 0.435,
        outputUsdPerMillion: 0.87
      }
    },
    aliases: {
      "deepseek-chat": "deepseek-v4-flash",
      "deepseek-reasoner": "deepseek-v4-flash"
    }
  };
}

export function calculateUsageCost(
  model: string,
  usage: UsageSnapshot,
  pricing: PricingConfig
): UsageCost | null {
  const canonicalModel = pricing.aliases[model] ?? model;
  const modelPricing = pricing.models[canonicalModel];

  if (!modelPricing) {
    return null;
  }

  const cacheHitCny =
    (usage.promptCacheHitTokens / MILLION) * modelPricing.inputCacheHitCnyPerMillion;
  const cacheMissCny =
    (usage.promptCacheMissTokens / MILLION) * modelPricing.inputCacheMissCnyPerMillion;
  const outputCny = (usage.completionTokens / MILLION) * modelPricing.outputCnyPerMillion;
  const cacheHitUsd =
    (usage.promptCacheHitTokens / MILLION) * modelPricing.inputCacheHitUsdPerMillion;
  const cacheMissUsd =
    (usage.promptCacheMissTokens / MILLION) * modelPricing.inputCacheMissUsdPerMillion;
  const outputUsd = (usage.completionTokens / MILLION) * modelPricing.outputUsdPerMillion;

  return {
    model: canonicalModel,
    currency: pricing.currency,
    costCny: roundCurrency(cacheHitCny + cacheMissCny + outputCny),
    costUsd: roundCurrency(cacheHitUsd + cacheMissUsd + outputUsd)
  };
}

export function roundCurrency(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

