import { describe, expect, it, vi } from "vitest";
import { applyMonitorClickThroughLock } from "../src/main/core/monitor-window-lock";

describe("applyMonitorClickThroughLock", () => {
  it("enables click-through forwarding when the monitor is locked", () => {
    const monitorWindow = {
      setIgnoreMouseEvents: vi.fn()
    };

    applyMonitorClickThroughLock(monitorWindow, true);

    expect(monitorWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true });
  });

  it("restores normal mouse handling when the monitor is unlocked", () => {
    const monitorWindow = {
      setIgnoreMouseEvents: vi.fn()
    };

    applyMonitorClickThroughLock(monitorWindow, false);

    expect(monitorWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(false);
  });

  it("restores normal mouse handling when locked controls need temporary interaction", () => {
    const monitorWindow = {
      setIgnoreMouseEvents: vi.fn()
    };

    applyMonitorClickThroughLock(monitorWindow, true, true);

    expect(monitorWindow.setIgnoreMouseEvents).toHaveBeenCalledWith(false);
  });
});
