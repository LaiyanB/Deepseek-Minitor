import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { UsageCost, UsageSnapshot } from "./pricing";

export interface UsageEvent {
  id: string;
  timestamp: string;
  model: string;
  apiKeyFingerprint: string;
  statusCode: number;
  durationMs: number;
  usage: UsageSnapshot | null;
  cost: UsageCost | null;
  errorType?: string;
}

export interface UsageSummary {
  todayCostCny: number;
  monthCostCny: number;
  todayRequests: number;
  monthRequests: number;
  todayTokens: number;
  monthTokens: number;
  errorRequests: number;
}

export interface UsageStoreLike {
  record(event: UsageEvent): Promise<void>;
  list(): Promise<UsageEvent[]>;
  clear(): Promise<void>;
}

interface UsageFile {
  events: UsageEvent[];
}

export class UsageStore implements UsageStoreLike {
  constructor(private readonly filePath: string) {}

  async record(event: UsageEvent): Promise<void> {
    const file = await this.readFile();
    file.events.push(sanitizeUsageEvent(event));
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(file, null, 2)}\n`, "utf8");
  }

  async list(): Promise<UsageEvent[]> {
    return (await this.readFile()).events;
  }

  async clear(): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify({ events: [] }, null, 2)}\n`, "utf8");
  }

  private async readFile(): Promise<UsageFile> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as UsageFile;
      return { events: Array.isArray(parsed.events) ? parsed.events : [] };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { events: [] };
      }
      throw error;
    }
  }
}

export class InMemoryUsageStore implements UsageStoreLike {
  private readonly events: UsageEvent[] = [];

  async record(event: UsageEvent): Promise<void> {
    this.events.push(sanitizeUsageEvent(event));
  }

  async list(): Promise<UsageEvent[]> {
    return [...this.events];
  }

  async clear(): Promise<void> {
    this.events.length = 0;
  }
}

export function summarizeUsage(events: UsageEvent[], now = new Date()): UsageSummary {
  const dayPrefix = now.toISOString().slice(0, 10);
  const monthPrefix = now.toISOString().slice(0, 7);
  const trackedEvents = events.filter(isTrackedUsageEvent);
  const today = trackedEvents.filter((event) => event.timestamp.startsWith(dayPrefix));
  const month = trackedEvents.filter((event) => event.timestamp.startsWith(monthPrefix));

  return {
    todayCostCny: sumCost(today),
    monthCostCny: sumCost(month),
    todayRequests: today.length,
    monthRequests: month.length,
    todayTokens: sumTokens(today),
    monthTokens: sumTokens(month),
    errorRequests: trackedEvents.filter((event) => event.statusCode >= 400 || event.errorType).length
  };
}

export function isTrackedUsageEvent(event: UsageEvent): boolean {
  return Boolean(event.usage || event.cost || event.statusCode >= 400 || event.errorType);
}

function sanitizeUsageEvent(event: UsageEvent): UsageEvent {
  return {
    id: event.id,
    timestamp: event.timestamp,
    model: event.model,
    apiKeyFingerprint: event.apiKeyFingerprint,
    statusCode: event.statusCode,
    durationMs: event.durationMs,
    usage: event.usage
      ? {
          promptTokens: event.usage.promptTokens,
          completionTokens: event.usage.completionTokens,
          totalTokens: event.usage.totalTokens,
          promptCacheHitTokens: event.usage.promptCacheHitTokens,
          promptCacheMissTokens: event.usage.promptCacheMissTokens
        }
      : null,
    cost: event.cost
      ? {
          model: event.cost.model,
          currency: event.cost.currency,
          costCny: event.cost.costCny
        }
      : null,
    ...(event.errorType ? { errorType: event.errorType } : {})
  };
}

function sumCost(events: UsageEvent[]): number {
  return Math.round(events.reduce((sum, event) => sum + (event.cost?.costCny ?? 0), 0) * 1_000_000) / 1_000_000;
}

function sumTokens(events: UsageEvent[]): number {
  return events.reduce((sum, event) => sum + (event.usage?.totalTokens ?? 0), 0);
}
