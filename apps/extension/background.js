const DEFAULT_API_BASE = "https://switch-path.onrender.com";
const DEFAULT_DASHBOARD_URL = "https://switch-path-mocha.vercel.app";

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "open-switchpath") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await openPanel(tab);
});

chrome.action.onClicked.addListener(openPanel);

chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete" || !tab.active || !isRecordablePage(tab.url)) return;
  void reportBrowserContext(tab);
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  const tab = await chrome.tabs.get(tabId).catch(() => undefined);
  if (tab && isRecordablePage(tab.url)) void reportBrowserContext(tab);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "switchpath:configure-session") {
    configureSession(message, sender)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: errorMessage(error) }));
    return true;
  }
  if (message?.type === "switchpath:open-dashboard") {
    getExtensionConfig()
      .then(({ dashboardUrl }) => chrome.tabs.create({ url: dashboardUrl }))
      .then(() => sendResponse({ ok: true }))
      .catch((error) => sendResponse({ ok: false, error: errorMessage(error) }));
    return true;
  }
  if (message?.type !== "switchpath:api") return false;
  apiRequest(message.request)
    .then((data) => sendResponse({ ok: true, data }))
    .catch((error) => sendResponse({ ok: false, error: errorMessage(error) }));
  return true;
});

async function openPanel(tab) {
  if (!tab?.id || !isWebPage(tab.url)) return;
  const selectedText = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => globalThis.getSelection?.()?.toString().trim().slice(0, 4000) || "",
  }).then((results) => results?.[0]?.result || "").catch(() => "");
  const payload = {
    type: "switchpath:toggle",
    page: {
      url: tab.url,
      title: tab.title || new URL(tab.url).hostname,
      selectedText,
    },
  };
  await reportBrowserContext(tab);
  try {
    await chrome.tabs.sendMessage(tab.id, payload);
  } catch {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
    await chrome.tabs.sendMessage(tab.id, payload);
  }
}

async function reportBrowserContext(tab) {
  if (!tab?.url || !isWebPage(tab.url)) return;
  await apiRequest({
    method: "POST",
    path: "/browser-context",
    body: {
      url: tab.url,
      title: tab.title || new URL(tab.url).hostname,
    },
  }).catch(() => undefined);
}

async function apiRequest(request) {
  const { apiBase, apiToken } = await getExtensionConfig();
  const method = request?.method === "POST" ? "POST" : "GET";
  const path = String(request?.path ?? "");
  if (!isAllowedPath(path)) throw new Error("Blocked extension API path");
  const headers = {};
  if (method === "POST") headers["Content-Type"] = "application/json";
  if (apiToken) headers.Authorization = `Bearer ${apiToken}`;
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers,
    body: method === "POST" ? JSON.stringify(request.body ?? {}) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Switchpath API returned ${response.status}`);
  return data;
}

async function configureSession(message, sender) {
  const apiBase = normalizeHttpOrigin(message.apiBase, "API URL");
  const dashboardUrl = normalizeHttpOrigin(message.dashboardUrl, "dashboard URL");
  const rawOrigin = sender?.origin || sender?.url || sender?.tab?.url || "";
  const senderOrigin = rawOrigin ? new URL(rawOrigin).origin : "";
  if (!senderOrigin || senderOrigin !== dashboardUrl) {
    throw new Error("The extension can only be connected from the open Switchpath dashboard");
  }
  const apiToken = typeof message.apiToken === "string" ? message.apiToken.trim() : "";
  await chrome.storage.local.set({ switchpathApiBase: apiBase, switchpathApiToken: apiToken, switchpathDashboardUrl: dashboardUrl });
}

async function getExtensionConfig() {
  const stored = await chrome.storage.local.get([
    "switchpathApiBase",
    "switchpathApiToken",
    "switchpathDashboardUrl",
  ]);
  return {
    apiBase: stored.switchpathApiBase || DEFAULT_API_BASE,
    apiToken: stored.switchpathApiToken || "",
    dashboardUrl: stored.switchpathDashboardUrl || DEFAULT_DASHBOARD_URL,
  };
}

function normalizeHttpOrigin(value, label) {
  const url = new URL(String(value || ""));
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`Invalid ${label}`);
  return url.origin;
}

function isAllowedPath(path) {
  return path === "/active-run"
    || path === "/browser-context"
    || path === "/teaching-session"
    || /^\/runs\/[0-9a-f-]+$/i.test(path)
    || /^\/runs\/[0-9a-f-]+\/(commands|intervention|events)$/i.test(path);
}

function isRecordablePage(urlValue) {
  if (!isWebPage(urlValue)) return false;
  const hostname = new URL(urlValue).hostname;
  return hostname !== "localhost" && hostname !== "127.0.0.1";
}

function isWebPage(urlValue) {
  try {
    return ["http:", "https:"].includes(new URL(urlValue).protocol);
  } catch {
    return false;
  }
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}
