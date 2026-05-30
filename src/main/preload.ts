import { contextBridge, ipcRenderer } from "electron";
import type { AppSettings } from "./core/config-store";
import type { PricingConfig } from "./core/pricing";

contextBridge.exposeInMainWorld("deepseekMonitor", {
  getSnapshot: () => ipcRenderer.invoke("snapshot:get"),
  startProxy: () => ipcRenderer.invoke("proxy:start"),
  stopProxy: () => ipcRenderer.invoke("proxy:stop"),
  toggleMonitor: () => ipcRenderer.invoke("monitor:toggle"),
  hideMonitor: () => ipcRenderer.invoke("monitor:hide"),
  setMonitorClickThroughLocked: (locked: boolean) => ipcRenderer.invoke("monitor:set-click-through-lock", locked),
  setMonitorTemporaryInteraction: (interactive: boolean) =>
    ipcRenderer.invoke("monitor:set-temporary-interaction", interactive),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke("settings:save", settings),
  savePricing: (pricing: PricingConfig) => ipcRenderer.invoke("pricing:save", pricing),
  clearHistory: () => ipcRenderer.invoke("usage:clear-history"),
  onSnapshotUpdated: (callback: (snapshot: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, snapshot: unknown) => callback(snapshot);
    ipcRenderer.on("snapshot:updated", listener);
    return () => ipcRenderer.removeListener("snapshot:updated", listener);
  }
});
