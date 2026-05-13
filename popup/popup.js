// =============================================================
// Popup Script — handles UI interactions and communicates
// with the service worker via chrome.runtime.sendMessage
// =============================================================

const toggleEl      = document.getElementById("toggleEnabled");
const statusBanner  = document.getElementById("statusBanner");
const statusText    = document.getElementById("statusText");
const blockedCountEl = document.getElementById("blockedCount");
const todayCountEl  = document.getElementById("todayCount");
const currentSiteEl = document.getElementById("currentSite");
const whitelistBtn  = document.getElementById("whitelistBtn");
const dashboardBtn  = document.getElementById("openDashboard");

let currentHostname = null;
let isWhitelisted   = false;

// ── On popup open: fetch current state ──
document.addEventListener("DOMContentLoaded", async () => {
  // 1. Get the active tab's URL
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.url) {
    try {
      const url = new URL(tab.url);
      currentHostname = url.hostname;
      currentSiteEl.textContent = currentHostname;
    } catch {
      currentSiteEl.textContent = "Not a webpage";
    }
  }

  // 2. Load state from the service worker
  const state = await chrome.runtime.sendMessage({ action: "getState" });
  applyState(state);

  // Poll for updated count every 2 seconds while popup is open
setInterval(async () => {
  const state = await chrome.runtime.sendMessage({ action: "getState" });
  blockedCountEl.textContent = state.blockedCount?.toLocaleString() ?? "0";
  const today = new Date().toISOString().split("T")[0];
  todayCountEl.textContent = (state.dailyStats?.[today] ?? 0).toLocaleString();
}, 2000);
});



// ── Apply state to UI ──
function applyState(state) {
  const { enabled, blockedCount, dailyStats, whitelist } = state;

  // Toggle
  toggleEl.checked = enabled;
  updateStatusBanner(enabled);

  // Stats
  blockedCountEl.textContent = blockedCount?.toLocaleString() ?? "0";
  const today = new Date().toISOString().split("T")[0];
  todayCountEl.textContent = (dailyStats?.[today] ?? 0).toLocaleString();

  // Whitelist button
  if (currentHostname) {
    isWhitelisted = (whitelist || []).includes(currentHostname);
    updateWhitelistButton();
  }
}

// ── Status banner helper ──
function updateStatusBanner(enabled) {
  if (enabled) {
    statusBanner.classList.remove("inactive");
    statusText.textContent = "Protection Active";
  } else {
    statusBanner.classList.add("inactive");
    statusText.textContent = "Protection Paused";
  }
}

// ── Whitelist button helper ──
function updateWhitelistButton() {
  whitelistBtn.textContent = isWhitelisted ? "Remove Whitelist" : "Whitelist Site";
  whitelistBtn.classList.toggle("whitelisted", isWhitelisted);
}

// ── Toggle event ──
toggleEl.addEventListener("change", async () => {
  const { enabled } = await chrome.runtime.sendMessage({ action: "toggleEnabled" });
  updateStatusBanner(enabled);
});

// ── Whitelist button event ──
whitelistBtn.addEventListener("click", async () => {
  if (!currentHostname) return;

  if (isWhitelisted) {
    await chrome.runtime.sendMessage({ action: "removeFromWhitelist", hostname: currentHostname });
    isWhitelisted = false;
  } else {
    await chrome.runtime.sendMessage({ action: "addToWhitelist", hostname: currentHostname });
    isWhitelisted = true;
  }
  updateWhitelistButton();
});

// ── Dashboard button ──
dashboardBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("popup/dashboard.html") });
});