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
}

const MILLION = 1_000_000;

export function createDefaultPricing(): PricingConfig {
  return {
    currency: "CNY",
    updatedAt: "2026-05-10",
    models: {
      "deepseek-v4-flash": {
        displayName: "DeepSeek V4 Flash",
        inputCacheHitCnyPerMillion: 0.02,
        inputCacheMissCnyPerMillion: 1,
        outputCnyPerMillion: 2
      },
      "deepseek-v4-pro": {
        displayName: "DeepSeek V4 Pro",
        inputCacheHitCnyPerMillion: 0.02,
        inputCacheMissCnyPerMillion: 1,
        outputCnyPerMillion: 2
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

  const cacheHitCost =
    (usage.promptCacheHitTokens / MILLION) * modelPricing.inputCacheHitCnyPerMillion;
  const cacheMissCost =
    (usage.promptCacheMissTokens / MILLION) * modelPricing.inputCacheMissCnyPerMillion;
  const outputCost = (usage.completionTokens / MILLION) * modelPricing.outputCnyPerMillion;

  return {
    model: canonicalModel,
    currency: pricing.currency,
    costCny: roundCurrency(cacheHitCost + cacheMissCost + outputCost)
  };
}

export function roundCurrency(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

