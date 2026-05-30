export interface MonitorWindowLockTarget {
  setIgnoreMouseEvents(ignore: boolean, options?: { forward: boolean }): void;
}

export function applyMonitorClickThroughLock(
  monitorWindow: MonitorWindowLockTarget | null,
  locked: boolean,
  temporarilyInteractive = false
): void {
  if (!monitorWindow) {
    return;
  }

  if (locked && !temporarilyInteractive) {
    monitorWindow.setIgnoreMouseEvents(true, { forward: true });
    return;
  }

  monitorWindow.setIgnoreMouseEvents(false);
}
