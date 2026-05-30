import { app, BrowserWindow, Menu, Notification, Tray, globalShortcut, ipcMain, nativeImage } from "electron";
import type { Server } from "node:http";
import { join } from "node:path";
import { networkInterfaces } from "node:os";
import { ConfigStore, type AppSettings } from "./core/config-store";
import { createMonitorStats } from "./core/monitor-stats";
import { applyMonitorClickThroughLock } from "./core/monitor-window-lock";
import { createDefaultPricing, type PricingConfig } from "./core/pricing";
import { tryAutoStartProxy } from "./core/startup";
import { isTrackedUsageEvent, summarizeUsage, UsageStore, type UsageEvent, type UsageStoreLike } from "./core/usage-store";
import { createProxyServer } from "./proxy/proxy-server";

interface ProxyState {
  running: boolean;
  port: number;
  url: string;
}

let mainWindow: BrowserWindow | null = null;
let monitorWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let proxyServer: Server | null = null;
let settings: AppSettings;
let pricing: PricingConfig;
let configStore: ConfigStore;
let usageStore: UsageStore;
let notifyingStore: UsageStoreLike;
let budgetNotificationSent = false;
let isQuitting = false;
let monitorTemporarilyInteractive = false;
const isSmokeTest = process.argv.includes("--smoke-test");
const hasSingleInstanceLock = isSmokeTest || app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    showWindow();
  });

  void app.whenReady().then(async () => {
    const userData = app.getPath("userData");
    configStore = new ConfigStore({
      pricingPath: join(userData, "pricing.json"),
      settingsPath: join(userData, "settings.json")
    });
    usageStore = new UsageStore(join(userData, "usage.json"));
    notifyingStore = createNotifyingStore(usageStore);
    settings = await configStore.loadSettings();
    pricing = await configStore.loadPricing();

    if (isSmokeTest) {
      settings = { ...settings, proxyPort: 0, notificationsEnabled: false, autoStartProxy: true };
    }

    registerIpc();

    await tryAutoStartProxy(settings.autoStartProxy, () => startProxy(), (error) => {
      console.error("Failed to auto-start proxy", error);
    });

    if (isSmokeTest) {
      await stopProxy();
      app.exit(0);
      return;
    }

    createTray();
    createWindow();
    registerShortcuts();
  });
}

app.on("window-all-closed", () => {});

app.on("before-quit", async () => {
  globalShortcut.unregisterAll();
  await stopProxy();
});

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 920,
    minHeight: 620,
    title: "DeepSeek Usage Monitor",
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  void mainWindow.loadFile(join(__dirname, "..", "renderer", "index.html"));
  mainWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createMonitorWindow(): void {
  monitorWindow = new BrowserWindow({
    width: 560,
    height: 620,
    minWidth: 430,
    minHeight: 420,
    maxWidth: 760,
    maxHeight: 820,
    title: "DeepSeek Monitor",
    frame: false,
    transparent: true,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  monitorWindow.setAlwaysOnTop(true, "screen-saver");
  applyMonitorInteractionState();
  monitorWindow.loadFile(join(__dirname, "..", "renderer", "monitor.html")).catch(() => {
    // load failure handled silently — window still shows
  });
  monitorWindow.on("closed", () => {
    monitorWindow = null;
    monitorTemporarilyInteractive = false;
    updateTrayMenu();
  });
}

function createTray(): void {
  tray = new Tray(createTrayImage());
  tray.setToolTip("DeepSeek Usage Monitor");
  updateTrayMenu();
}

function updateTrayMenu(): void {
  const proxy = getProxyState();
  const template = [
    {
    label: proxy.running ? `Proxy running: ${proxy.url}` : "Proxy stopped",
      enabled: false
    },
    {
      label: settings.language === "zh-CN" ? "打开仪表盘" : "Open dashboard",
      click: () => showWindow()
    },
    {
      label: monitorWindow
        ? settings.language === "zh-CN"
          ? "隐藏监视模式"
          : "Hide monitor mode"
        : settings.language === "zh-CN"
          ? "显示监视模式"
          : "Show monitor mode",
      click: () => toggleMonitorWindow()
    },
    {
      label: settings.monitorClickThroughLocked
        ? settings.language === "zh-CN"
          ? "\u89e3\u9501\u76d1\u89c6\u5668\u70b9\u51fb"
          : "Unlock monitor clicks"
        : settings.language === "zh-CN"
          ? "\u9501\u5b9a\u76d1\u89c6\u5668\u70b9\u51fb"
          : "Lock monitor clicks",
      enabled: Boolean(monitorWindow),
      click: () => {
        void setMonitorClickThroughLocked(!settings.monitorClickThroughLocked);
      }
    },
    {
      label: proxy.running
        ? settings.language === "zh-CN"
          ? "暂停代理"
          : "Pause proxy"
        : settings.language === "zh-CN"
          ? "启动代理"
          : "Start proxy",
      click: () => {
        void (proxy.running ? stopProxy() : startProxy());
      }
    },
    { type: "separator" as const },
    {
      label: settings.language === "zh-CN" ? "退出" : "Quit",
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ];

  tray?.setContextMenu(Menu.buildFromTemplate(template));
}

function registerShortcuts(): void {
  globalShortcut.register("CommandOrControl+Alt+D", () => {
    toggleMonitorWindow();
  });
  globalShortcut.register("CommandOrControl+Alt+L", () => {
    if (!monitorWindow) {
      return;
    }

    void setMonitorClickThroughLocked(!settings.monitorClickThroughLocked);
  });
}

function showWindow(): void {
  if (!mainWindow) {
    createWindow();
  }

  mainWindow?.show();
  mainWindow?.focus();
}

function toggleMonitorWindow(): void {
  if (monitorWindow) {
    monitorWindow.close();
    return;
  }

  createMonitorWindow();
  updateTrayMenu();
}

function registerIpc(): void {
  ipcMain.handle("snapshot:get", async () => createSnapshot());
  ipcMain.handle("proxy:start", async () => startProxy());
  ipcMain.handle("proxy:stop", async () => stopProxy());
  ipcMain.handle("monitor:toggle", async () => {
    toggleMonitorWindow();
    return createSnapshot();
  });
  ipcMain.handle("monitor:hide", async () => {
    monitorWindow?.close();
    return createSnapshot();
  });
  ipcMain.handle("monitor:set-click-through-lock", async (_event, locked: boolean) => {
    return setMonitorClickThroughLocked(Boolean(locked));
  });
  ipcMain.handle("monitor:set-temporary-interaction", async (_event, interactive: boolean) => {
    monitorTemporarilyInteractive = Boolean(interactive) && settings.monitorClickThroughLocked;
    applyMonitorInteractionState();
  });
  ipcMain.handle("settings:save", async (_event, nextSettings: AppSettings) => {
    settings = nextSettings;
    await configStore.saveSettings(settings);
    applyMonitorInteractionState();
    if (proxyServer) {
      await stopProxy();
      await startProxy();
    }
    broadcastSnapshot();
    return createSnapshot();
  });
  ipcMain.handle("pricing:save", async (_event, nextPricing: PricingConfig) => {
    pricing = nextPricing;
    await configStore.savePricing(pricing);
    return createSnapshot();
  });
  ipcMain.handle("usage:clear-history", async () => {
    await usageStore.clear();
    budgetNotificationSent = false;
    broadcastSnapshot();
    return createSnapshot();
  });
}

async function createSnapshot() {
  const events = await usageStore.list();
  const recentEvents = events.filter(isTrackedUsageEvent).reverse().slice(0, 200);

  return {
    proxy: getProxyState(),
    settings,
    pricing,
    summary: summarizeUsage(events),
    monitor: createMonitorStats(events),
    events: recentEvents
  };
}

async function startProxy(): Promise<ProxyState> {
  if (proxyServer) {
    return getProxyState();
  }

  proxyServer = createProxyServer({
    deepseekBaseUrl: settings.deepseekBaseUrl,
    store: notifyingStore,
    pricing,
    language: settings.language
  });

  await new Promise<void>((resolve, reject) => {
    proxyServer?.once("error", reject);
    proxyServer?.listen(settings.proxyPort, "0.0.0.0", () => resolve());
  });

  updateTrayMenu();
  broadcastSnapshot();
  return getProxyState();
}

async function stopProxy(): Promise<ProxyState> {
  const server = proxyServer;
  proxyServer = null;

  if (server?.listening) {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  updateTrayMenu();
  broadcastSnapshot();
  return getProxyState();
}

function getLanIp(): string {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] ?? []) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "127.0.0.1";
}

function getProxyState(): ProxyState {
  const address = proxyServer?.address();
  const port = typeof address === "object" && address ? address.port : settings?.proxyPort ?? 8716;

  return {
    running: Boolean(proxyServer?.listening),
    port,
    url: `http://${getLanIp()}:${port}`
  };
}

function createNotifyingStore(store: UsageStore): UsageStoreLike {
  return {
    async record(event: UsageEvent): Promise<void> {
      await store.record(event);
      await maybeNotify(event);
      updateTrayMenu();
      broadcastSnapshot();
    },
    list: () => store.list(),
    clear: () => store.clear()
  };
}

async function setMonitorClickThroughLocked(locked: boolean) {
  settings = {
    ...settings,
    monitorClickThroughLocked: locked
  };
  monitorTemporarilyInteractive = false;
  await configStore.saveSettings(settings);
  applyMonitorInteractionState();
  updateTrayMenu();
  broadcastSnapshot();
  return createSnapshot();
}

function applyMonitorInteractionState(): void {
  applyMonitorClickThroughLock(monitorWindow, settings.monitorClickThroughLocked, monitorTemporarilyInteractive);
}

async function maybeNotify(event: UsageEvent): Promise<void> {
  if (!settings.notificationsEnabled || !Notification.isSupported()) {
    return;
  }

  if (event.statusCode >= 400 || event.errorType) {
    new Notification({
      title: settings.language === "zh-CN" ? "DeepSeek 请求失败" : "DeepSeek request failed",
      body:
        settings.language === "zh-CN"
          ? `${event.model} 返回 ${event.statusCode}`
          : `${event.model} returned ${event.statusCode}`
    }).show();
    return;
  }

  if ((event.cost?.costCny ?? 0) >= Math.max(settings.dailyBudgetCny * 0.25, 1)) {
    new Notification({
      title: settings.language === "zh-CN" ? "DeepSeek 单次请求偏贵" : "High-cost DeepSeek request",
      body:
        settings.language === "zh-CN"
          ? `${event.model} 消耗 ¥${event.cost?.costCny.toFixed(4)}`
          : `${event.model} used ¥${event.cost?.costCny.toFixed(4)}`
    }).show();
  }

  const summary = summarizeUsage(await usageStore.list());
  if (!budgetNotificationSent && summary.todayCostCny >= settings.dailyBudgetCny * 0.8) {
    budgetNotificationSent = true;
    new Notification({
      title: settings.language === "zh-CN" ? "DeepSeek 预算提醒" : "DeepSeek budget threshold",
      body:
        settings.language === "zh-CN"
          ? `今日：¥${summary.todayCostCny.toFixed(2)} / ¥${settings.dailyBudgetCny.toFixed(2)}`
          : `Today: ¥${summary.todayCostCny.toFixed(2)} / ¥${settings.dailyBudgetCny.toFixed(2)}`
    }).show();
  }
}

function broadcastSnapshot(): void {
  void createSnapshot().then((snapshot) => {
    if (mainWindow?.webContents) {
      mainWindow?.webContents.send("snapshot:updated", snapshot);
    }

    if (monitorWindow?.webContents) {
      monitorWindow?.webContents.send("snapshot:updated", snapshot);
    }
  });
}

function createTrayImage() {
  const svg = encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <rect width="32" height="32" rx="7" fill="#11231f"/>
      <path d="M8 22h4V10H8v12Zm6 0h4V7h-4v15Zm6 0h4V14h-4v8Z" fill="#7dd3a8"/>
    </svg>
  `);
  return nativeImage.createFromDataURL(`data:image/svg+xml;charset=utf-8,${svg}`);
}
