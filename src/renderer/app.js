let snapshot = null;

const messages = {
  "zh-CN": {
    appTitle: "DeepSeek 用量监视器",
    copyUrl: "复制 URL",
    today: "今日",
    thisMonth: "本月",
    todayTokens: "今日 Tokens",
    errors: "错误",
    errorHint: "失败或异常请求",
    realtimeRequests: "实时请求",
    time: "时间",
    model: "模型",
    key: "Key",
    tokens: "Tokens",
    cache: "缓存",
    cost: "费用",
    status: "状态",
    modelSpend: "模型花费",
    mostExpensive: "最贵请求",
    proxySettings: "代理设置",
    baseUrl: "Base URL",
    localPort: "本地端口",
    dailyBudget: "每日预算",
    language: "语言",
    dashboardTheme: "主界面模式",
    monitorTheme: "监视器模式",
    middayMode: "午间模式",
    nightMode: "黑夜模式",
    notifications: "通知",
    autoStart: "自动启动代理",
    pricing: "价格表",
    running: "运行中",
    stopped: "已停止",
    startProxy: "启动代理",
    pauseProxy: "暂停代理",
    monitorMode: "监视模式",
    requests: "次请求",
    thisMonthPrefix: "本月",
    recent: "最近",
    noRequests: "暂无请求",
    noSpend: "暂无花费",
    noPriced: "暂无已计价请求",
    saved: "✓ 已保存",
    clearHistory: "清除历史",
    clearHistoryConfirm: "确定要清除所有历史记录吗？此操作不可撤销。"
  },
  "en-US": {
    appTitle: "DeepSeek Usage Monitor",
    copyUrl: "Copy URL",
    today: "Today",
    thisMonth: "This Month",
    todayTokens: "Today Tokens",
    errors: "Errors",
    errorHint: "failed or abnormal requests",
    realtimeRequests: "Realtime Requests",
    time: "Time",
    model: "Model",
    key: "Key",
    tokens: "Tokens",
    cache: "Cache",
    cost: "Cost",
    status: "Status",
    modelSpend: "Model Spend",
    mostExpensive: "Most Expensive",
    proxySettings: "Proxy Settings",
    baseUrl: "Base URL",
    localPort: "Local Port",
    dailyBudget: "Daily Budget",
    language: "Language",
    dashboardTheme: "Dashboard mode",
    monitorTheme: "Monitor mode",
    middayMode: "Midday mode",
    nightMode: "Night mode",
    notifications: "Notifications",
    autoStart: "Auto-start proxy",
    pricing: "Pricing",
    running: "Running",
    stopped: "Stopped",
    startProxy: "Start Proxy",
    pauseProxy: "Pause Proxy",
    monitorMode: "Monitor Mode",
    requests: "requests",
    thisMonthPrefix: "this month",
    recent: "recent",
    noRequests: "No requests yet",
    noSpend: "No spend yet",
    noPriced: "No priced requests yet",
    saved: "✓ Saved",
    clearHistory: "Clear History",
    clearHistoryConfirm: "Are you sure you want to clear all history? This cannot be undone."
  }
};

const el = {
  proxyUrl: document.querySelector("#proxy-url"),
  proxyCopy: document.querySelector("#proxy-copy"),
  proxyPill: document.querySelector("#proxy-pill"),
  proxyToggle: document.querySelector("#proxy-toggle"),
  monitorToggle: document.querySelector("#monitor-toggle"),
  dashboardThemeToggle: document.querySelector("#dashboard-theme-toggle"),
  todayCost: document.querySelector("#today-cost"),
  monthCost: document.querySelector("#month-cost"),
  todayRequests: document.querySelector("#today-requests"),
  monthRequests: document.querySelector("#month-requests"),
  todayTokens: document.querySelector("#today-tokens"),
  monthTokens: document.querySelector("#month-tokens"),
  errorCount: document.querySelector("#error-count"),
  eventCount: document.querySelector("#event-count"),
  eventsBody: document.querySelector("#events-body"),
  modelBars: document.querySelector("#model-bars"),
  expensiveList: document.querySelector("#expensive-list"),
  baseUrlProvider: document.querySelector("#base-url-provider"),
  baseUrlCustom: document.querySelector("#base-url-custom"),
  proxyPort: document.querySelector("#proxy-port"),
  dailyBudget: document.querySelector("#daily-budget"),
  language: document.querySelector("#language"),
  settingsDashboardThemeToggle: document.querySelector("#settings-dashboard-theme-toggle"),
  settingsMonitorThemeToggle: document.querySelector("#settings-monitor-theme-toggle"),
  notificationsEnabled: document.querySelector("#notifications-enabled"),
  autoStart: document.querySelector("#auto-start"),
  settingsSave: document.querySelector("#settings-save"),
  clearHistory: document.querySelector("#clear-history")
};

window.deepseekMonitor.onSnapshotUpdated((nextSnapshot) => {
  snapshot = nextSnapshot;
  render();
});

el.proxyToggle.addEventListener("click", async () => {
  if (snapshot?.proxy.running) {
    await window.deepseekMonitor.stopProxy();
  } else {
    await window.deepseekMonitor.startProxy();
  }
  snapshot = await window.deepseekMonitor.getSnapshot();
  render();
});

el.monitorToggle.addEventListener("click", async () => {
  try {
    snapshot = await window.deepseekMonitor.toggleMonitor();
    render();
  } catch (error) {
    console.error("Failed to toggle monitor mode", error);
  }
});

el.dashboardThemeToggle.addEventListener("click", () => {
  void toggleDashboardTheme();
});

el.settingsDashboardThemeToggle.addEventListener("click", () => {
  void toggleDashboardTheme();
});

el.settingsMonitorThemeToggle.addEventListener("click", () => {
  void toggleMonitorTheme();
});

el.baseUrlProvider.addEventListener("change", () => {
  const showCustom = el.baseUrlProvider.value === "__custom__";
  el.baseUrlCustom.style.display = showCustom ? "block" : "none";
  if (showCustom) el.baseUrlCustom.focus();
});

el.settingsSave.addEventListener("click", async () => {
  const baseUrl = el.baseUrlProvider.value === "__custom__"
    ? el.baseUrlCustom.value.trim()
    : el.baseUrlProvider.value;
  snapshot = await window.deepseekMonitor.saveSettings({
    ...snapshot.settings,
    deepseekBaseUrl: baseUrl,
    proxyPort: Number(el.proxyPort.value),
    dailyBudgetCny: Number(el.dailyBudget.value),
    language: el.language.value,
    notificationsEnabled: el.notificationsEnabled.checked,
    autoStartProxy: el.autoStart.checked
  });
  render();

  showToast(t("saved"));
});

el.clearHistory.addEventListener("click", async () => {
  if (!confirm(t("clearHistoryConfirm"))) {
    return;
  }

  snapshot = await window.deepseekMonitor.clearHistory();
  render();
});

el.proxyCopy.addEventListener("click", async () => {
  if (!snapshot) {
    return;
  }

  await navigator.clipboard.writeText(snapshot.proxy.url);
  el.proxyCopy.textContent = t("copyUrl");
});

void (async function boot() {
  snapshot = await window.deepseekMonitor.getSnapshot();
  render();
})();

function render() {
  if (!snapshot) {
    return;
  }

  renderProxy();
  renderTheme();
  renderLanguage();
  renderSummary();
  renderEvents();
  renderModelBars();
  renderExpensiveRequests();
  renderSettings();
}

function renderTheme() {
  document.documentElement.dataset.theme = isDashboardDark() ? "dark" : "light";
  renderThemeSwitch(el.dashboardThemeToggle, isDashboardDark());
}

function renderProxy() {
  el.proxyUrl.textContent = snapshot.proxy.url;
  el.proxyCopy.textContent = t("copyUrl");
  el.proxyPill.textContent = snapshot.proxy.running ? t("running") : t("stopped");
  el.proxyPill.classList.toggle("running", snapshot.proxy.running);
  el.proxyToggle.textContent = snapshot.proxy.running ? t("pauseProxy") : t("startProxy");
  el.monitorToggle.textContent = t("monitorMode");
}

function renderLanguage() {
  document.documentElement.lang = language();
  document.title = t("appTitle");
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    const key = node.getAttribute("data-i18n");
    if (key) {
      node.textContent = t(key);
    }
  });
}

function renderSummary() {
  el.todayCost.textContent = money(snapshot.summary.todayCostCny);
  el.monthCost.textContent = money(snapshot.summary.monthCostCny);
  el.todayRequests.textContent = `${snapshot.summary.todayRequests} ${t("requests")}`;
  el.monthRequests.textContent = `${snapshot.summary.monthRequests} ${t("requests")}`;
  el.todayTokens.textContent = integer(snapshot.summary.todayTokens);
  el.monthTokens.textContent =
    language() === "zh-CN"
      ? `${t("thisMonthPrefix")} ${integer(snapshot.summary.monthTokens)}`
      : `${integer(snapshot.summary.monthTokens)} ${t("thisMonthPrefix")}`;
  el.errorCount.textContent = integer(snapshot.summary.errorRequests);
  el.eventCount.textContent = `${snapshot.events.length} ${t("recent")}`;
}

function renderEvents() {
  if (!snapshot.events.length) {
    el.eventsBody.innerHTML = `<tr><td class="empty-state" colspan="7">${t("noRequests")}</td></tr>`;
    return;
  }

  el.eventsBody.innerHTML = snapshot.events
    .map((event) => {
      const usage = event.usage;
      const cacheText = usage ? `${integer(usage.promptCacheHitTokens)} / ${integer(usage.promptCacheMissTokens)}` : "n/a";
      const statusClass = event.statusCode >= 400 ? "fail" : event.cost ? "ok" : "warn";
      return `
        <tr>
          <td>${time(event.timestamp)}</td>
          <td>${escapeHtml(event.model)}</td>
          <td>${escapeHtml(event.apiKeyFingerprint)}</td>
          <td>${usage ? integer(usage.totalTokens) : "n/a"}</td>
          <td>${cacheText}</td>
          <td>${event.cost ? money(event.cost.costCny) : "n/a"}</td>
          <td class="${statusClass}">${event.statusCode}</td>
        </tr>
      `;
    })
    .join("");
}

function renderModelBars() {
  const totals = new Map();
  for (const event of snapshot.events) {
    totals.set(event.model, (totals.get(event.model) ?? 0) + (event.cost?.costCny ?? 0));
  }

  const rows = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const max = Math.max(...rows.map(([, value]) => value), 0.000001);

  el.modelBars.innerHTML = rows.length
    ? rows
        .map(([model, value]) => {
          const width = Math.max((value / max) * 100, 2);
          return `
            <div class="bar-row">
              <span>${escapeHtml(model)}</span>
              <div class="bar-track"><div class="bar-fill" style="width: ${width}%"></div></div>
              <strong>${money(value)}</strong>
            </div>
          `;
        })
        .join("")
    : `<div class="empty-state">${t("noSpend")}</div>`;
}

function renderExpensiveRequests() {
  const rows = [...snapshot.events]
    .filter((event) => event.cost)
    .sort((a, b) => b.cost.costCny - a.cost.costCny)
    .slice(0, 5);

  el.expensiveList.innerHTML = rows.length
    ? rows
        .map(
          (event) => `
            <li>
              <strong>${money(event.cost.costCny)}</strong>
              <span>${escapeHtml(event.model)} · ${time(event.timestamp)} · ${integer(event.usage?.totalTokens ?? 0)} tokens</span>
            </li>
          `
        )
        .join("")
    : `<li class="empty-state">${t("noPriced")}</li>`;
}

function renderSettings() {
  const url = snapshot.settings.deepseekBaseUrl;
  const option = el.baseUrlProvider?.options ? Array.from(el.baseUrlProvider.options).find((o) => o.value === url) : null;
  if (option) {
    el.baseUrlProvider.value = url;
    el.baseUrlCustom.style.display = "none";
  } else {
    el.baseUrlProvider.value = "__custom__";
    el.baseUrlCustom.value = url;
    el.baseUrlCustom.style.display = "block";
  }
  el.proxyPort.value = String(snapshot.settings.proxyPort);
  el.dailyBudget.value = String(snapshot.settings.dailyBudgetCny);
  el.language.value = snapshot.settings.language ?? "zh-CN";
  renderThemeSwitch(el.settingsDashboardThemeToggle, isDashboardDark());
  renderThemeSwitch(el.settingsMonitorThemeToggle, isMonitorDark());
  el.notificationsEnabled.checked = snapshot.settings.notificationsEnabled;
  el.autoStart.checked = snapshot.settings.autoStartProxy;
}

async function toggleDashboardTheme() {
  await saveSettingsPatch({ dashboardDarkMode: !isDashboardDark() });
}

async function toggleMonitorTheme() {
  await saveSettingsPatch({ monitorDarkMode: !isMonitorDark() });
}

async function saveSettingsPatch(patch) {
  if (!snapshot) {
    return;
  }

  snapshot = await window.deepseekMonitor.saveSettings({
    ...snapshot.settings,
    ...patch
  });
  render();
}

function isDashboardDark() {
  return Boolean(snapshot?.settings?.dashboardDarkMode);
}

function isMonitorDark() {
  return snapshot?.settings?.monitorDarkMode !== false;
}

function renderThemeSwitch(button, isDark) {
  if (!button) {
    return;
  }

  button.textContent = isDark ? t("nightMode") : t("middayMode");
  button.setAttribute("aria-checked", String(isDark));
}

function money(value) {
  return `¥${Number(value ?? 0).toFixed(4)}`;
}

function language() {
  return snapshot?.settings?.language === "en-US" ? "en-US" : "zh-CN";
}

function t(key) {
  return messages[language()][key] ?? key;
}

function integer(value) {
  return Number(value ?? 0).toLocaleString();
}

function time(timestamp) {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function showToast(message) {
  let toast = document.querySelector("#toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    toast.className = "toast";
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toast._hideTimer);
  toast._hideTimer = setTimeout(() => toast.classList.remove("show"), 2000);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
