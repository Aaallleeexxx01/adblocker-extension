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

document.addEventListener("DOMContentLoaded", async () => {
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

  const state = await chrome.runtime.sendMessage({ action: "getState" });
  applyState(state);

setInterval(async () => {
  const state = await chrome.runtime.sendMessage({ action: "getState" });
  blockedCountEl.textContent = state.blockedCount?.toLocaleString() ?? "0";
  const today = new Date().toISOString().split("T")[0];
  todayCountEl.textContent = (state.dailyStats?.[today] ?? 0).toLocaleString();
}, 2000);
});



function applyState(state) {
  const { enabled, blockedCount, dailyStats, whitelist } = state;

  toggleEl.checked = enabled;
  updateStatusBanner(enabled);

  blockedCountEl.textContent = blockedCount?.toLocaleString() ?? "0";
  const today = new Date().toISOString().split("T")[0];
  todayCountEl.textContent = (dailyStats?.[today] ?? 0).toLocaleString();

  if (currentHostname) {
    isWhitelisted = (whitelist || []).includes(currentHostname);
    updateWhitelistButton();
  }
}

function updateStatusBanner(enabled) {
  if (enabled) {
    statusBanner.classList.remove("inactive");
    statusText.textContent = "Protection Active";
  } else {
    statusBanner.classList.add("inactive");
    statusText.textContent = "Protection Paused";
  }
}

function updateWhitelistButton() {
  whitelistBtn.textContent = isWhitelisted ? "Remove Whitelist" : "Whitelist Site";
  whitelistBtn.classList.toggle("whitelisted", isWhitelisted);
}

toggleEl.addEventListener("change", async () => {
  const { enabled } = await chrome.runtime.sendMessage({ action: "toggleEnabled" });
  updateStatusBanner(enabled);
});

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

dashboardBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: chrome.runtime.getURL("popup/dashboard.html") });
});