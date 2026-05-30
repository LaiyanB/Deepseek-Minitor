import { isTrackedUsageEvent, type UsageEvent } from "./usage-store";

export interface MonitorStats {
  todayCostCny: number;
  todayTokens: number;
  todayRequests: number;
  todayErrors: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  outputTokens: number;
  cacheHitRate: number;
  modelBreakdown: MonitorModelStats[];
  lastModel: string;
  lastStatusCode: number | null;
}

export interface MonitorModelStats {
  model: string;
  requests: number;
  totalTokens: number;
  cacheHitTokens: number;
  cacheMissTokens: number;
  outputTokens: number;
  cacheHitRate: number;
  costCny: number;
}

export function createMonitorStats(events: UsageEvent[], now = new Date()): MonitorStats {
  const dayPrefix = now.toISOString().slice(0, 10);
  const trackedEvents = events.filter(isTrackedUsageEvent);
  const todayEvents = trackedEvents.filter((event) => event.timestamp.startsWith(dayPrefix));
  const latestEvent = [...trackedEvents].sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
  const cacheHitTokens = sumUsage(todayEvents, "promptCacheHitTokens");
  const cacheMissTokens = sumUsage(todayEvents, "promptCacheMissTokens");
  const outputTokens = sumUsage(todayEvents, "completionTokens");

  return {
    todayCostCny: round(todayEvents.reduce((sum, event) => sum + (event.cost?.costCny ?? 0), 0)),
    todayTokens: todayEvents.reduce((sum, event) => sum + (event.usage?.totalTokens ?? 0), 0),
    todayRequests: todayEvents.length,
    todayErrors: todayEvents.filter((event) => event.statusCode >= 400 || event.errorType).length,
    cacheHitTokens,
    cacheMissTokens,
    outputTokens,
    cacheHitRate: hitRate(cacheHitTokens, cacheMissTokens),
    modelBreakdown: createModelBreakdown(todayEvents),
    lastModel: latestEvent?.model ?? "idle",
    lastStatusCode: latestEvent?.statusCode ?? null
  };
}

function createModelBreakdown(events: UsageEvent[]): MonitorModelStats[] {
  const models = new Map<string, MonitorModelStats>();

  for (const event of events) {
    const model = event.cost?.model ?? event.model;
    const current =
      models.get(model) ??
      {
        model,
        requests: 0,
        totalTokens: 0,
        cacheHitTokens: 0,
        cacheMissTokens: 0,
        outputTokens: 0,
        cacheHitRate: 0,
        costCny: 0
      };

    current.requests += 1;
    current.totalTokens += event.usage?.totalTokens ?? 0;
    current.cacheHitTokens += event.usage?.promptCacheHitTokens ?? 0;
    current.cacheMissTokens += event.usage?.promptCacheMissTokens ?? 0;
    current.outputTokens += event.usage?.completionTokens ?? 0;
    current.costCny = round(current.costCny + (event.cost?.costCny ?? 0));
    current.cacheHitRate = hitRate(current.cacheHitTokens, current.cacheMissTokens);
    models.set(model, current);
  }

  return [...models.values()].sort((a, b) => {
    if (a.model === "deepseek-v4-flash") {
      return -1;
    }

    if (b.model === "deepseek-v4-flash") {
      return 1;
    }

    if (a.model === "deepseek-v4-pro") {
      return -1;
    }

    if (b.model === "deepseek-v4-pro") {
      return 1;
    }

    return a.model.localeCompare(b.model);
  });
}

function sumUsage(events: UsageEvent[], field: "promptCacheHitTokens" | "promptCacheMissTokens" | "completionTokens"): number {
  return events.reduce((sum, event) => sum + (event.usage?.[field] ?? 0), 0);
}

function hitRate(hitTokens: number, missTokens: number): number {
  const inputTokens = hitTokens + missTokens;
  return inputTokens ? hitTokens / inputTokens : 0;
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
