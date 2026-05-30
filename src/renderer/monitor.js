let monitorSnapshot = null;
let monitorTemporaryInteraction = false;

const monitorMessages = {
  "zh-CN": {
    title: "DeepSeek \u76d1\u89c6\u5668",
    closeLabel: "\u5173\u95ed\u76d1\u89c6\u5668",
    lockLabel: "\u9501\u5b9a",
    lockedLabel: "\u5df2\u9501\u5b9a",
    lockAriaLabel: "\u9501\u5b9a\u76d1\u89c6\u5668\u70b9\u51fb",
    lockedAriaLabel: "\u76d1\u89c6\u5668\u70b9\u51fb\u5df2\u9501\u5b9a",
    running: "\u4ee3\u7406\u8fd0\u884c\u4e2d",
    stopped: "\u4ee3\u7406\u5df2\u505c\u6b62",
    todayCost: "\u4eca\u65e5\u8d39\u7528",
    hitRate: "\u7f13\u5b58\u547d\u4e2d\u7387",
    totalTokens: "\u603b Tokens",
    requests: "\u8bf7\u6c42",
    errors: "\u9519\u8bef",
    cacheHit: "\u7f13\u5b58\u547d\u4e2d",
    cacheMiss: "\u7f13\u5b58\u672a\u547d\u4e2d",
    outputTokens: "\u8f93\u51fa Tokens",
    modelUsage: "\u6a21\u578b\u7528\u91cf",
    todayScope: "\u6309\u4eca\u65e5\u7edf\u8ba1",
    cost: "\u8d39\u7528",
    middayModeShort: "\u767d\u5929",
    nightModeShort: "\u9ed1\u591c",
    opacity: "\u900f\u660e\u5ea6",
    noModelUsage: "\u6682\u65e0\u6a21\u578b\u7528\u91cf",
    idle: "\u7a7a\u95f2",
    noRequests: "\u6682\u65e0\u8bf7\u6c42"
  },
  "en-US": {
    title: "DeepSeek Monitor",
    closeLabel: "Close monitor",
    lockLabel: "Lock",
    lockedLabel: "Locked",
    lockAriaLabel: "Lock monitor clicks",
    lockedAriaLabel: "Monitor clicks are locked",
    running: "Proxy running",
    stopped: "Proxy stopped",
    todayCost: "Today Cost",
    hitRate: "Cache Hit Rate",
    totalTokens: "Total Tokens",
    requests: "Requests",
    errors: "Errors",
    cacheHit: "Cache Hit",
    cacheMiss: "Cache Miss",
    outputTokens: "Output Tokens",
    modelUsage: "Model Usage",
    todayScope: "Today only",
    cost: "Cost",
    middayModeShort: "Midday",
    nightModeShort: "Night",
    opacity: "Opacity",
    noModelUsage: "No model usage yet",
    idle: "idle",
    noRequests: "No requests"
  }
};

const monitorEl = {
  shell: document.querySelector(".monitor-shell"),
  status: document.querySelector("#monitor-status"),
  themeToggle: document.querySelector("#monitor-theme-toggle"),
  lockToggle: document.querySelector("#monitor-lock-toggle"),
  opacityLabel: document.querySelector("#monitor-opacity-label"),
  opacityControl: document.querySelector("#monitor-opacity-control"),
  opacityValue: document.querySelector("#monitor-opacity-value"),
  close: document.querySelector("#monitor-close"),
  todayLabel: document.querySelector("#monitor-today-label"),
  hitRateLabel: document.querySelector("#monitor-hit-rate-label"),
  tokensLabel: document.querySelector("#monitor-tokens-label"),
  requestsLabel: document.querySelector("#monitor-requests-label"),
  errorsLabel: document.querySelector("#monitor-errors-label"),
  cacheHitLabel: document.querySelector("#monitor-cache-hit-label"),
  cacheMissLabel: document.querySelector("#monitor-cache-miss-label"),
  outputLabel: document.querySelector("#monitor-output-label"),
  modelTitle: document.querySelector("#monitor-model-title"),
  modelSubtitle: document.querySelector("#monitor-model-subtitle"),
  cost: document.querySelector("#monitor-cost"),
  hitRate: document.querySelector("#monitor-hit-rate"),
  tokens: document.querySelector("#monitor-tokens"),
  requests: document.querySelector("#monitor-requests"),
  errors: document.querySelector("#monitor-errors"),
  cacheHit: document.querySelector("#monitor-cache-hit"),
  cacheMiss: document.querySelector("#monitor-cache-miss"),
  output: document.querySelector("#monitor-output"),
  modelBreakdown: document.querySelector("#monitor-model-breakdown"),
  lastModel: document.querySelector("#monitor-last-model"),
  lastStatus: document.querySelector("#monitor-last-status")
};

window.deepseekMonitor.onSnapshotUpdated((nextSnapshot) => {
  monitorSnapshot = nextSnapshot;
  renderMonitor();
});

monitorEl.close.addEventListener("click", () => {
  void window.deepseekMonitor.hideMonitor();
});

monitorEl.themeToggle.addEventListener("click", () => {
  void toggleMonitorTheme();
});

monitorEl.lockToggle.addEventListener("click", () => {
  void toggleMonitorClickThroughLock();
});

monitorEl.opacityControl.addEventListener("input", () => {
  renderOpacity(readOpacityControl());
});

monitorEl.opacityControl.addEventListener("change", () => {
  void saveMonitorOpacity();
});

document.addEventListener("mousemove", (event) => {
  void updateTemporaryInteraction(event);
});

let mouseleaveTimer = null;
document.addEventListener("mouseleave", () => {
  mouseleaveTimer = setTimeout(() => {
    void setTemporaryInteraction(false);
  }, 80);
});
document.addEventListener("mouseenter", () => {
  if (mouseleaveTimer !== null) {
    clearTimeout(mouseleaveTimer);
    mouseleaveTimer = null;
  }
});

void (async function bootMonitor() {
  monitorSnapshot = await window.deepseekMonitor.getSnapshot();
  renderMonitor();
})();

function renderMonitor() {
  if (!monitorSnapshot) {
    return;
  }

  const stats = monitorSnapshot.monitor;
  renderTheme();
  renderOpacity();
  renderLanguage();
  renderLockState();
  monitorEl.status.textContent = monitorSnapshot.proxy.running ? mt("running") : mt("stopped");
  monitorEl.cost.textContent = money(stats.todayCostCny);
  monitorEl.hitRate.textContent = percent(stats.cacheHitRate);
  monitorEl.tokens.textContent = integer(stats.todayTokens);
  monitorEl.requests.textContent = integer(stats.todayRequests);
  monitorEl.errors.textContent = integer(stats.todayErrors);
  monitorEl.errors.classList.toggle("has-errors", stats.todayErrors > 0);
  monitorEl.cacheHit.textContent = integer(stats.cacheHitTokens);
  monitorEl.cacheMiss.textContent = integer(stats.cacheMissTokens);
  monitorEl.output.textContent = integer(stats.outputTokens);
  monitorEl.lastModel.textContent = stats.lastModel === "idle" ? mt("idle") : stats.lastModel;
  monitorEl.lastStatus.textContent = stats.lastStatusCode ? `HTTP ${stats.lastStatusCode}` : mt("noRequests");
  renderModelBreakdown(stats.modelBreakdown);
}

function renderTheme() {
  const isDark = isMonitorDark();
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
  monitorEl.themeToggle.textContent = isDark ? mt("nightModeShort") : mt("middayModeShort");
  monitorEl.themeToggle.setAttribute("aria-checked", String(isDark));
}

function renderOpacity(opacity = monitorOpacity()) {
  const normalizedOpacity = clampOpacity(opacity);
  const transparency = Math.round((1 - normalizedOpacity) * 100);
  monitorEl.shell.style.opacity = String(normalizedOpacity);
  monitorEl.opacityControl.value = String(transparency);
  monitorEl.opacityValue.textContent = `${transparency}%`;
}

function renderLockState() {
  const locked = isMonitorClickThroughLocked();
  monitorEl.lockToggle.textContent = locked ? mt("lockedLabel") : mt("lockLabel");
  monitorEl.lockToggle.setAttribute("aria-label", locked ? mt("lockedAriaLabel") : mt("lockAriaLabel"));
  monitorEl.lockToggle.setAttribute("aria-pressed", String(locked));
  monitorEl.lockToggle.classList.toggle("is-locked", locked);
  monitorEl.shell.classList.toggle("is-click-through-locked", locked);
}

async function toggleMonitorTheme() {
  if (!monitorSnapshot) {
    return;
  }

  monitorSnapshot = await window.deepseekMonitor.saveSettings({
    ...monitorSnapshot.settings,
    monitorDarkMode: !isMonitorDark()
  });
  renderMonitor();
}

function isMonitorDark() {
  return monitorSnapshot?.settings?.monitorDarkMode !== false;
}

async function toggleMonitorClickThroughLock() {
  if (!monitorSnapshot) {
    return;
  }

  const previousSnapshot = monitorSnapshot;
  const nextLocked = !isMonitorClickThroughLocked();
  monitorSnapshot = {
    ...monitorSnapshot,
    settings: {
      ...monitorSnapshot.settings,
      monitorClickThroughLocked: nextLocked
    }
  };
  renderLockState();

  try {
    monitorSnapshot = await window.deepseekMonitor.setMonitorClickThroughLocked(nextLocked);
    renderMonitor();
  } catch (error) {
    monitorSnapshot = previousSnapshot;
    renderLockState();
    console.error("Failed to update monitor click-through lock", error);
  }
}

function isMonitorClickThroughLocked() {
  return Boolean(monitorSnapshot?.settings?.monitorClickThroughLocked);
}

async function updateTemporaryInteraction(event) {
  if (!isMonitorClickThroughLocked()) {
    await setTemporaryInteraction(false);
    return;
  }

  const inControlZone = isInControlZone(event.clientX, event.clientY);
  await setTemporaryInteraction(inControlZone);
}

function isInControlZone(clientX, clientY) {
  const actions = document.querySelector(".monitor-actions");
  if (actions && typeof actions.getBoundingClientRect === "function") {
    const rect = actions.getBoundingClientRect();
    return (
      clientX >= rect.left - 12 &&
      clientX <= rect.right + 12 &&
      clientY >= rect.top - 12 &&
      clientY <= rect.bottom + 12
    );
  }

  const width = Number(window.innerWidth || 560);
  return clientY <= 58 && clientX >= width - 230;
}

async function setTemporaryInteraction(interactive) {
  if (monitorTemporaryInteraction === interactive) {
    return;
  }

  monitorTemporaryInteraction = interactive;
  try {
    await window.deepseekMonitor.setMonitorTemporaryInteraction(interactive);
  } catch {
    monitorTemporaryInteraction = !interactive;
  }
}

async function saveMonitorOpacity() {
  if (!monitorSnapshot) {
    return;
  }

  monitorSnapshot = await window.deepseekMonitor.saveSettings({
    ...monitorSnapshot.settings,
    monitorOpacity: readOpacityControl()
  });
  renderMonitor();
}

function readOpacityControl() {
  const transparency = Number(monitorEl.opacityControl.value) / 100;
  return clampOpacity(Number((1 - transparency).toFixed(2)));
}

function monitorOpacity() {
  return clampOpacity(monitorSnapshot?.settings?.monitorOpacity);
}

function clampOpacity(value) {
  if (!Number.isFinite(value)) {
    return 0.93;
  }

  return Math.min(1, Math.max(0.65, value));
}

function renderModelBreakdown(rows) {
  if (!rows.length) {
    monitorEl.modelBreakdown.innerHTML = `<div class="empty-state">${mt("noModelUsage")}</div>`;
    return;
  }

  monitorEl.modelBreakdown.innerHTML = rows
    .map(
      (row) => `
        <article class="model-card">
          <div class="model-head">
            <strong>${escapeHtml(shortModel(row.model))}</strong>
            <span>${money(row.costCny)}</span>
          </div>
          <div class="model-meter" aria-hidden="true">
            <div style="width: ${Math.max(row.cacheHitRate * 100, row.cacheHitTokens ? 4 : 0)}%"></div>
          </div>
          <div class="model-stats">
            <span>${integer(row.totalTokens)} tokens</span>
            <span>${integer(row.requests)} req</span>
            <span>${mt("cacheHit")} ${integer(row.cacheHitTokens)}</span>
            <span>${mt("cacheMiss")} ${integer(row.cacheMissTokens)}</span>
            <span>${mt("outputTokens")} ${integer(row.outputTokens)}</span>
            <span>${percent(row.cacheHitRate)}</span>
          </div>
        </article>
      `
    )
    .join("");
}

function money(value) {
  return `\u00A5${Number(value ?? 0).toFixed(4)}`;
}

function integer(value) {
  return Number(value ?? 0).toLocaleString();
}

function percent(value) {
  return `${(Number(value ?? 0) * 100).toFixed(1)}%`;
}

function shortModel(model) {
  return String(model).replace("deepseek-", "");
}

function monitorLanguage() {
  return monitorSnapshot?.settings?.language === "en-US" ? "en-US" : "zh-CN";
}

function mt(key) {
  return monitorMessages[monitorLanguage()][key] ?? key;
}

function renderLanguage() {
  document.documentElement.lang = monitorLanguage();
  document.title = mt("title");
  monitorEl.close.setAttribute("aria-label", mt("closeLabel"));
  monitorEl.opacityLabel.textContent = mt("opacity");
  monitorEl.todayLabel.textContent = mt("todayCost");
  monitorEl.hitRateLabel.textContent = mt("hitRate");
  monitorEl.tokensLabel.textContent = mt("totalTokens");
  monitorEl.requestsLabel.textContent = mt("requests");
  monitorEl.errorsLabel.textContent = mt("errors");
  monitorEl.cacheHitLabel.textContent = mt("cacheHit");
  monitorEl.cacheMissLabel.textContent = mt("cacheMiss");
  monitorEl.outputLabel.textContent = mt("outputTokens");
  monitorEl.modelTitle.textContent = mt("modelUsage");
  monitorEl.modelSubtitle.textContent = mt("todayScope");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
