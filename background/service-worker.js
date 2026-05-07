// =============================================================
// AdBlocker Service Worker — MV3 Background Script
// =============================================================

// --------------- State Management ---------------

// Default state stored in chrome.storage.local
const DEFAULT_STATE = {
  enabled: true,
  blockedCount: 0,
  whitelist: [],        // array of hostnames, e.g. ["example.com"]
  dailyStats: {}        // { "2025-04-22": 42, ... }
};

// Initialize storage with defaults on first install
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    await chrome.storage.local.set(DEFAULT_STATE);
    console.log("[AdBlocker] Installed. Storage initialized.");
  }
});

// --------------- Blocked Ads Counter ---------------
// declarativeNetRequestFeedback lets us listen to which rules fired.
// We use this to increment our counter whenever a request is blocked.

chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(
  async (info) => {
    // Only count static ruleset matches (all blocks) not dynamic (whitelist allow rules)
    if (info.rule.rulesetId !== "main_rules") return;
    if (info.request.type === "main_frame") return;

    const { enabled, blockedCount, dailyStats } = await chrome.storage.local.get([
      "enabled", "blockedCount", "dailyStats"]);
    if (!enabled) return;

    const today = new Date().toISOString().split("T")[0];
    await chrome.storage.local.set({
      blockedCount: (blockedCount || 0) + 1,
      dailyStats: { ...dailyStats, [today]: (dailyStats[today] || 0) + 1 }
    });
  }
);

// --------------- Message Handler ---------------
// The popup communicates with this service worker via chrome.runtime.sendMessage.

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true; // Required: tells Chrome we'll respond asynchronously
});

async function handleMessage(message) {
  switch (message.action) {

    case "getState": {
      const state = await chrome.storage.local.get(null); // get everything
      return state;
    }

    case "toggleEnabled": {
      const { enabled } = await chrome.storage.local.get("enabled");
      const newEnabled = !enabled;
      await chrome.storage.local.set({ enabled: newEnabled });

      // Enable or disable the static ruleset based on the toggle
      if (newEnabled) {
        await chrome.declarativeNetRequest.enableRulesets(["main_rules"]);
      } else {
        await chrome.declarativeNetRequest.disableRulesets(["main_rules"]);
      }

      return { enabled: newEnabled };
    }

    case "addToWhitelist": {
      const { hostname } = message;
      const { whitelist } = await chrome.storage.local.get("whitelist");
      if (!whitelist.includes(hostname)) {
        const newList = [...whitelist, hostname];
        await chrome.storage.local.set({ whitelist: newList });

        // Add a dynamic rule that allows all requests from this domain
        await addWhitelistRule(hostname, newList.length + 1000);
      }
      return { success: true };
    }

    case "removeFromWhitelist": {
      const { hostname } = message;
      const { whitelist } = await chrome.storage.local.get("whitelist");
      const newList = whitelist.filter(h => h !== hostname);
      await chrome.storage.local.set({ whitelist: newList });

      // Remove the dynamic allow rule for this hostname
      await removeWhitelistRule(hostname);

      return { success: true };
    }

    case "resetStats": {
      await chrome.storage.local.set({ blockedCount: 0, dailyStats: {} });
      return { success: true };
    }

    default:
      return { error: "Unknown action" };
  }
}

// --------------- Whitelist Rule Helpers ---------------

async function addWhitelistRule(hostname, ruleId) {
  // First remove any existing rule for this hostname to avoid duplicates
  await removeWhitelistRule(hostname);

  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [{
      id: ruleId,
      priority: 10,
      action: { type: "allow" },
      condition: {
        initiatorDomains: [hostname],
        resourceTypes: [
          "main_frame", "sub_frame", "script",
          "image", "xmlhttprequest", "stylesheet", "font", "media"
        ]
      }
    }],
    removeRuleIds: []
  });
  console.log(`[AdBlocker] Whitelisted: ${hostname} with rule ID ${ruleId}`);
}

async function removeWhitelistRule(hostname) {
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  const toRemove = rules
    .filter(r => r.condition.initiatorDomains?.includes(hostname))
    .map(r => r.id);

  if (toRemove.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [],
      removeRuleIds: toRemove
    });
    console.log(`[AdBlocker] Removed whitelist rule(s) for: ${hostname}`, toRemove);
  }
}