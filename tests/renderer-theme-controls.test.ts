import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Script, createContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

interface FakeElement {
  textContent: string;
  value: string;
  checked: boolean;
  innerHTML: string;
  style: {
    opacity: string;
    setProperty: ReturnType<typeof vi.fn>;
  };
  classList: {
    toggle: ReturnType<typeof vi.fn>;
  };
  addEventListener: (type: string, listener: (event?: unknown) => unknown) => void;
  click: () => Promise<void>;
  dispatch: (type: string, event?: unknown) => Promise<void>;
  setAttribute: (name: string, value: string) => void;
  getAttribute: (name: string) => string | null;
}

function createSnapshot(settings: {
  dashboardDarkMode: boolean;
  monitorDarkMode: boolean;
  monitorOpacity?: number;
  monitorClickThroughLocked?: boolean;
}) {
  return {
    proxy: { running: false, url: "http://127.0.0.1:8716" },
    settings: {
      deepseekBaseUrl: "https://api.deepseek.com",
      proxyPort: 8716,
      dailyBudgetCny: 5,
      language: "zh-CN",
      notificationsEnabled: true,
      autoStartProxy: true,
      monitorOpacity: 0.93,
      monitorClickThroughLocked: false,
      currency: "CNY",
      ...settings
    },
    pricing: { models: {} },
    summary: {
      todayCostCny: 0,
      todayCostUsd: 0,
      monthCostCny: 0,
      monthCostUsd: 0,
      todayRequests: 0,
      monthRequests: 0,
      todayTokens: 0,
      monthTokens: 0,
      errorRequests: 0
    },
    monitor: {
      todayCostCny: 0,
      todayCostUsd: 0,
      cacheHitRate: 0,
      todayTokens: 0,
      todayRequests: 0,
      todayErrors: 0,
      cacheHitTokens: 0,
      cacheMissTokens: 0,
      outputTokens: 0,
      modelBreakdown: [],
      lastModel: "idle",
      lastStatusCode: null
    },
    events: []
  };
}

async function loadRendererScript(
  fileName: "app.js" | "monitor.js",
  initialSnapshot: ReturnType<typeof createSnapshot>,
  apiOverrides: Record<string, unknown> = {}
) {
  let snapshot = initialSnapshot;
  const elements = new Map<string, FakeElement>();
  const documentElement = {
    dataset: {} as Record<string, string>,
    lang: "",
    style: { setProperty: vi.fn() }
  };
  const api = {
    getSnapshot: vi.fn(async () => snapshot),
    saveSettings: vi.fn(async (nextSettings) => {
      snapshot = { ...snapshot, settings: nextSettings };
      return snapshot;
    }),
    setMonitorClickThroughLocked: vi.fn(async (locked: boolean) => {
      snapshot = {
        ...snapshot,
        settings: {
          ...snapshot.settings,
          monitorClickThroughLocked: locked
        }
      };
      return snapshot;
    }),
    setMonitorTemporaryInteraction: vi.fn(async () => undefined),
    onSnapshotUpdated: vi.fn(),
    startProxy: vi.fn(),
    stopProxy: vi.fn(),
    toggleMonitor: vi.fn(),
    hideMonitor: vi.fn(),
    savePricing: vi.fn()
  };
  Object.assign(api, apiOverrides);

  const documentListeners = new Map<string, (event?: unknown) => unknown>();
  const document = {
    documentElement,
    activeElement: null,
    title: "",
    querySelector(selector: string) {
      return getElement(elements, selector);
    },
    querySelectorAll() {
      return [];
    },
    addEventListener(type: string, listener: (event?: unknown) => unknown) {
      documentListeners.set(type, listener);
    },
    async dispatch(type: string, event?: unknown) {
      await documentListeners.get(type)?.(event);
    }
  };

  const context = createContext({
    window: { innerWidth: 560, deepseekMonitor: api },
    document,
    alert: vi.fn(),
    console,
    Date,
    Number,
    JSON,
    Map,
    Math,
    String
  });

  const source = await readFile(join(process.cwd(), "src", "renderer", fileName), "utf8");
  new Script(source, { filename: fileName }).runInContext(context);
  await Promise.resolve();
  await Promise.resolve();

  return { api, elements, document, documentElement };
}

function getElement(elements: Map<string, FakeElement>, selector: string): FakeElement {
  let element = elements.get(selector);
  if (!element) {
    const listeners = new Map<string, (event?: unknown) => unknown>();
    const attributes = new Map<string, string>();
    element = {
      textContent: "",
      value: "",
      checked: false,
      innerHTML: "",
      style: { opacity: "", setProperty: vi.fn() },
      classList: { toggle: vi.fn() },
      addEventListener: (type, listener) => listeners.set(type, listener),
      click: async () => {
        await listeners.get("click")?.();
      },
      dispatch: async (type, event) => {
        await listeners.get(type)?.(event);
      },
      setAttribute: (name, value) => attributes.set(name, value),
      getAttribute: (name) => attributes.get(name) ?? null
    };
    elements.set(selector, element);
  }
  return element;
}

describe("renderer theme controls", () => {
  it("dashboard switch changes only the dashboard theme setting", async () => {
    const { api, elements } = await loadRendererScript(
      "app.js",
      createSnapshot({ dashboardDarkMode: false, monitorDarkMode: true })
    );

    await elements.get("#dashboard-theme-toggle")?.click();

    expect(api.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        dashboardDarkMode: true,
        monitorDarkMode: true
      })
    );
  });

  it("floating monitor switch changes only the monitor theme setting", async () => {
    const { api, elements } = await loadRendererScript(
      "monitor.js",
      createSnapshot({ dashboardDarkMode: false, monitorDarkMode: true })
    );

    await elements.get("#monitor-theme-toggle")?.click();

    expect(api.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        dashboardDarkMode: false,
        monitorDarkMode: false,
        monitorOpacity: 0.93
      })
    );
  });

  it("floating monitor opacity control treats the slider as transparency", async () => {
    const { api, elements } = await loadRendererScript(
      "monitor.js",
      createSnapshot({ dashboardDarkMode: false, monitorDarkMode: true, monitorOpacity: 0.93 })
    );

    const opacityControl = elements.get("#monitor-opacity-control");
    opacityControl!.value = "18";
    await opacityControl?.dispatch("change");

    expect(api.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        dashboardDarkMode: false,
        monitorDarkMode: true,
        monitorOpacity: 0.82
      })
    );
  });

  it("floating monitor opacity is applied to the whole monitor shell", async () => {
    const { elements } = await loadRendererScript(
      "monitor.js",
      createSnapshot({ dashboardDarkMode: false, monitorDarkMode: true, monitorOpacity: 0.82 })
    );

    expect(elements.get(".monitor-shell")?.style.opacity).toBe("0.82");
    expect(elements.get("#monitor-opacity-control")?.value).toBe("18");
    expect(elements.get("#monitor-opacity-value")?.textContent).toBe("18%");
  });

  it("floating monitor lock button saves the click-through setting", async () => {
    const { api, elements } = await loadRendererScript(
      "monitor.js",
      createSnapshot({
        dashboardDarkMode: false,
        monitorDarkMode: true,
        monitorClickThroughLocked: false
      })
    );

    await elements.get("#monitor-lock-toggle")?.click();

    expect(api.setMonitorClickThroughLocked).toHaveBeenCalledWith(true);
  });

  it("floating monitor lock button shows locked feedback before the click-through IPC returns", async () => {
    let resolveLock: (value: ReturnType<typeof createSnapshot>) => void = () => {};
    const pendingLock = new Promise<ReturnType<typeof createSnapshot>>((resolve) => {
      resolveLock = resolve;
    });
    const initialSnapshot = createSnapshot({
      dashboardDarkMode: false,
      monitorDarkMode: true,
      monitorClickThroughLocked: false
    });
    const setMonitorClickThroughLocked = vi.fn(() => pendingLock);
    const { elements } = await loadRendererScript("monitor.js", initialSnapshot, { setMonitorClickThroughLocked });

    await elements.get("#monitor-lock-toggle")?.click();

    expect(elements.get("#monitor-lock-toggle")?.textContent).toBe("已锁定");

    resolveLock({
      ...initialSnapshot,
      settings: {
        ...initialSnapshot.settings,
        monitorClickThroughLocked: true
      }
    });
  });

  it("locked monitor makes the top-right controls temporarily interactive on hover", async () => {
    const { api, document } = await loadRendererScript(
      "monitor.js",
      createSnapshot({
        dashboardDarkMode: false,
        monitorDarkMode: true,
        monitorClickThroughLocked: true
      })
    );

    await document.dispatch("mousemove", { clientX: 530, clientY: 24 });
    await document.dispatch("mousemove", { clientX: 80, clientY: 220 });

    expect(api.setMonitorTemporaryInteraction).toHaveBeenNthCalledWith(1, true);
    expect(api.setMonitorTemporaryInteraction).toHaveBeenNthCalledWith(2, false);
  });
});
