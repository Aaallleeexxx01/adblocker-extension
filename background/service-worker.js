// =============================================================
// AdBlocker Service Worker — MV3 Background Script
// =============================================================

// --------------- State Management ---------------

// Default state stored in chrome.storage.local
const DEFAULT_STATE = {
  enabled: true,
  blockedCount: 0,
  whitelist: [],        // array of hostnames, e.g. ["example.com"]
  dailyStats: {},        // { "2025-04-22": 42, ... }
  siteStats: {},
  customRules: []

};

// Initialize storage with defaults on first install
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install") {
    await chrome.storage.local.set(DEFAULT_STATE);
    console.log("[AdBlocker] Installed. Storage initialized.");
  }
});

// Re-apply whitelist rules on browser startup
chrome.runtime.onStartup.addListener(async () => {
  const { whitelist, customRules } = await chrome.storage.local.get([
    "whitelist", "customRules"
  ]);

  // Clear ALL existing dynamic rules first to avoid ID conflicts
  const existing = await chrome.declarativeNetRequest.getDynamicRules();
  if (existing.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existing.map(r => r.id),
      addRules: []
    });
  }

  // Re-apply whitelist rules
  for (let i = 0; i < (whitelist || []).length; i++) {
    await addWhitelistRule(whitelist[i], i + 1001);
  }

  // Re-apply custom block rules
  for (const rule of (customRules || [])) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [{
        id: rule.ruleId,
        priority: 5,
        action: { type: "block" },
        condition: {
          urlFilter: `||${rule.domain}^`,
          resourceTypes: ["script", "image", "xmlhttprequest", "sub_frame", "stylesheet", "font", "media"]
        }
      }],
      removeRuleIds: []
    });
  }

  console.log("[AdBlocker] Rules restored after browser restart.");
});

// --------------- Blocked Ads Counter ---------------
// declarativeNetRequestFeedback lets us listen to which rules fired.
// We use this to increment our counter whenever a request is blocked.

chrome.declarativeNetRequest.onRuleMatchedDebug.addListener(
  async (info) => {
    if (info.rule.rulesetId !== "main_rules") return;
    if (info.request.type === "main_frame") return;

    const { enabled, blockedCount, dailyStats, siteStats } =
      await chrome.storage.local.get([
        "enabled", "blockedCount", "dailyStats", "siteStats"
      ]);

    if (!enabled) return;

    // Daily stats
    const today = new Date().toISOString().split("T")[0];
    const newDaily = {
      ...dailyStats,
      [today]: (dailyStats?.[today] || 0) + 1
    };

    // Per-site stats — extract hostname from initiator
    let hostname = "unknown";
    try {
      if (info.request.initiator) {
        hostname = new URL(info.request.initiator).hostname;
      }
    } catch (e) { }

    const newSiteStats = { ...siteStats };
    newSiteStats[hostname] = (newSiteStats[hostname] || 0) + 1;

    await chrome.storage.local.set({
      blockedCount: (blockedCount || 0) + 1,
      dailyStats: newDaily,
      siteStats: newSiteStats
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

      await chrome.declarativeNetRequest.updateEnabledRulesets({
        enableRulesetIds: newEnabled ? ["main_rules"] : [],
        disableRulesetIds: newEnabled ? [] : ["main_rules"]
      });

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
      await chrome.storage.local.set({
        blockedCount: 0,
        dailyStats: {},
        siteStats: {}
      });
      return { success: true };
    }

    case "addCustomRule": {
      const { domain } = message;
      const { customRules } = await chrome.storage.local.get("customRules");
      const list = customRules || [];

      if (list.some(r => r.domain === domain)) return { error: "Already exists" };

      const ruleId = 5000 + list.length + 1;
      await chrome.declarativeNetRequest.updateDynamicRules({
        addRules: [{
          id: ruleId,
          priority: 5,
          action: { type: "block" },
          condition: {
            urlFilter: `||${domain}^`,
            resourceTypes: [
              "script", "image", "xmlhttprequest",
              "sub_frame", "stylesheet", "font", "media"
            ]
          }
        }],
        removeRuleIds: []
      });

      await chrome.storage.local.set({
        customRules: [...list, { domain, ruleId }]
      });

      return { success: true };
    }

    case "removeCustomRule": {
      const { domain } = message;
      const { customRules } = await chrome.storage.local.get("customRules");
      const list = customRules || [];
      const rule = list.find(r => r.domain === domain);

      if (rule) {
        await chrome.declarativeNetRequest.updateDynamicRules({
          addRules: [],
          removeRuleIds: [rule.ruleId]
        });
        await chrome.storage.local.set({
          customRules: list.filter(r => r.domain !== domain)
        });
      }

      return { success: true };
    }

    case "getCustomRules": {
      const { customRules } = await chrome.storage.local.get("customRules");
      return { customRules: customRules || [] };
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