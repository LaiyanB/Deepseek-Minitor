import { mkdtemp, readFile, rm, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigStore } from "../src/main/core/config-store";

describe("ConfigStore", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ds-config-store-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(join(tempDir, "pricing.json"), { force: true });
      await rm(join(tempDir, "settings.json"), { force: true });
      await rmdir(tempDir);
    }
  });

  it("creates editable default pricing when no pricing file exists", async () => {
    const store = new ConfigStore({
      pricingPath: join(tempDir, "pricing.json"),
      settingsPath: join(tempDir, "settings.json")
    });

    const pricing = await store.loadPricing();
    pricing.models["deepseek-v4-flash"].outputCnyPerMillion = 9;
    await store.savePricing(pricing);

    const rawFile = await readFile(join(tempDir, "pricing.json"), "utf8");
    const reloaded = await store.loadPricing();

    expect(rawFile).toContain("deepseek-v4-flash");
    expect(reloaded.models["deepseek-v4-flash"].outputCnyPerMillion).toBe(9);
  });

  it("persists local proxy settings", async () => {
    const store = new ConfigStore({
      pricingPath: join(tempDir, "pricing.json"),
      settingsPath: join(tempDir, "settings.json")
    });

    const defaults = await store.loadSettings();
    await store.saveSettings({
      ...defaults,
      proxyPort: 9901,
      dailyBudgetCny: 12,
      notificationsEnabled: false
    });

    await expect(store.loadSettings()).resolves.toMatchObject({
      proxyPort: 9901,
      dailyBudgetCny: 12,
      notificationsEnabled: false,
      language: "zh-CN"
    });
  });

  it("keeps dashboard and monitor dark mode settings separate", async () => {
    const store = new ConfigStore({
      pricingPath: join(tempDir, "pricing.json"),
      settingsPath: join(tempDir, "settings.json")
    });

    await expect(store.loadSettings()).resolves.toMatchObject({
      dashboardDarkMode: false,
      monitorDarkMode: true,
      monitorOpacity: 0.93
    });

    const defaults = await store.loadSettings();
    await store.saveSettings({
      ...defaults,
      dashboardDarkMode: true,
      monitorDarkMode: false,
      monitorOpacity: 0.82
    } as any);

    await expect(store.loadSettings()).resolves.toMatchObject({
      dashboardDarkMode: true,
      monitorDarkMode: false,
      monitorOpacity: 0.82
    });
  });

  it("persists monitor click-through lock separately", async () => {
    const store = new ConfigStore({
      pricingPath: join(tempDir, "pricing.json"),
      settingsPath: join(tempDir, "settings.json")
    });

    await expect(store.loadSettings()).resolves.toMatchObject({
      monitorClickThroughLocked: false
    });

    const defaults = await store.loadSettings();
    await store.saveSettings({
      ...defaults,
      monitorClickThroughLocked: true
    } as any);

    await expect(store.loadSettings()).resolves.toMatchObject({
      dashboardDarkMode: false,
      monitorDarkMode: true,
      monitorOpacity: 0.93,
      monitorClickThroughLocked: true
    });
  });

  it("normalizes legacy settings to Chinese by default", async () => {
    const store = new ConfigStore({
      pricingPath: join(tempDir, "pricing.json"),
      settingsPath: join(tempDir, "settings.json")
    });

    await store.saveSettings({
      deepseekBaseUrl: "https://api.deepseek.com",
      proxyPort: 8716,
      dailyBudgetCny: 5,
      notificationsEnabled: true,
      autoStartProxy: true,
      language: "en-US"
    } as any);

    const rawFile = await readFile(join(tempDir, "settings.json"), "utf8");
    await rm(join(tempDir, "settings.json"), { force: true });
    await expect(store.loadSettings()).resolves.toMatchObject({ language: "zh-CN" });
    expect(rawFile).toContain("en-US");
  });
});
