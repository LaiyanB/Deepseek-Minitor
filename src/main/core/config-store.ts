import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createDefaultPricing, type PricingConfig } from "./pricing";
import { logError } from "./log";

export interface AppSettings {
  deepseekBaseUrl: string;
  proxyPort: number;
  dailyBudgetCny: number;
  notificationsEnabled: boolean;
  autoStartProxy: boolean;
  language: AppLanguage;
  currency: "CNY" | "USD";
  dashboardDarkMode: boolean;
  monitorDarkMode: boolean;
  monitorOpacity: number;
  monitorClickThroughLocked: boolean;
}

export type AppLanguage = "zh-CN" | "en-US";

export interface ConfigStorePaths {
  pricingPath: string;
  settingsPath: string;
}

export class ConfigStore {
  constructor(private readonly paths: ConfigStorePaths) {}

  async loadPricing(): Promise<PricingConfig> {
    return this.readJson(this.paths.pricingPath, createDefaultPricing());
  }

  async savePricing(pricing: PricingConfig): Promise<void> {
    await this.writeJson(this.paths.pricingPath, pricing);
  }

  async loadSettings(): Promise<AppSettings> {
    return normalizeSettings(await this.readJson(this.paths.settingsPath, createDefaultSettings()));
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    await this.writeJson(this.paths.settingsPath, normalizeSettings(settings));
  }

  private async readJson<T>(filePath: string, fallback: T): Promise<T> {
    try {
      const raw = await readFile(filePath, "utf8");
      return JSON.parse(raw.replace(/^\uFEFF/, "")) as T;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        // File doesn't exist yet — create with defaults
        await this.writeJson(filePath, fallback);
        return fallback;
      }

      // Corrupted file (e.g. partial write from a crash)
      // Use defaults in memory but DON'T overwrite the file on disk,
      // so the user's original settings aren't silently lost.
      logError(`Config file corrupted, using defaults: ${filePath}`, error);
      return fallback;
    }
  }

  private async writeJson(filePath: string, value: unknown): Promise<void> {
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }
}

export function createDefaultSettings(): AppSettings {
  return {
    deepseekBaseUrl: "https://api.deepseek.com",
    proxyPort: 8716,
    dailyBudgetCny: 5,
    notificationsEnabled: true,
    autoStartProxy: true,
    language: "zh-CN",
    currency: "CNY",
    dashboardDarkMode: false,
    monitorDarkMode: true,
    monitorOpacity: 0.93,
    monitorClickThroughLocked: false
  };
}

function normalizeSettings(settings: Partial<AppSettings>): AppSettings {
  return {
    deepseekBaseUrl: settings.deepseekBaseUrl || "https://api.deepseek.com",
    proxyPort: typeof settings.proxyPort === "number" && Number.isInteger(settings.proxyPort) ? settings.proxyPort : 8716,
    dailyBudgetCny:
      typeof settings.dailyBudgetCny === "number" && Number.isFinite(settings.dailyBudgetCny)
        ? settings.dailyBudgetCny
        : 5,
    notificationsEnabled: Boolean(settings.notificationsEnabled),
    autoStartProxy: Boolean(settings.autoStartProxy),
    language: settings.language === "en-US" ? "en-US" : "zh-CN",
    currency: settings.currency === "USD" ? "USD" : "CNY",
    dashboardDarkMode: Boolean(settings.dashboardDarkMode),
    monitorDarkMode: settings.monitorDarkMode === undefined ? true : Boolean(settings.monitorDarkMode),
    monitorOpacity: normalizeMonitorOpacity(settings.monitorOpacity),
    monitorClickThroughLocked: Boolean(settings.monitorClickThroughLocked)
  };
}

function normalizeMonitorOpacity(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 0.93;
  }

  return Math.min(1, Math.max(0.65, value));
}
