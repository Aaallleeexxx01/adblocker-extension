document.addEventListener("DOMContentLoaded", async () => {
  const state = await chrome.runtime.sendMessage({ action: "getState" });
  renderDashboard(state);
  await renderCustomRules();
});

function renderDashboard(state) {
  const { blockedCount, dailyStats, siteStats } = state;
  const today = new Date().toISOString().split("T")[0];

  document.getElementById("totalBlocked").textContent =
    (blockedCount || 0).toLocaleString();

  document.getElementById("todayBlocked").textContent =
    (dailyStats?.[today] || 0).toLocaleString();

  const bestDay = Math.max(0, ...Object.values(dailyStats || {}));
  document.getElementById("bestDay").textContent = bestDay.toLocaleString();

  document.getElementById("sitesTracked").textContent =
    Object.keys(siteStats || {}).length;

  drawBarChart(dailyStats || {});

  renderSitesList(siteStats || {});
}

function drawBarChart(dailyStats) {
  const canvas = document.getElementById("barChart");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split("T")[0];
    days.push({
      label: d.toLocaleDateString("en", { weekday: "short" }),
      value: dailyStats[key] || 0
    });
  }

  const maxVal = Math.max(1, ...days.map(d => d.value));
  const padding = { top: 20, bottom: 40, left: 40, right: 20 };
  const chartW = W - padding.left - padding.right;
  const chartH = H - padding.top - padding.bottom;
  const barW = chartW / days.length * 0.6;
  const gap = chartW / days.length;

  ctx.clearRect(0, 0, W, H);

  ctx.strokeStyle = "#2a2d3e";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padding.top + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(W - padding.right, y);
    ctx.stroke();

    const val = Math.round(maxVal - (maxVal / 4) * i);
    ctx.fillStyle = "#8891a8";
    ctx.font = "11px system-ui";
    ctx.textAlign = "right";
    ctx.fillText(val, padding.left - 6, y + 4);
  }

  days.forEach((day, i) => {
    const barH = (day.value / maxVal) * chartH;
    const x = padding.left + gap * i + (gap - barW) / 2;
    const y = padding.top + chartH - barH;

    const grad = ctx.createLinearGradient(0, y, 0, y + barH);
    grad.addColorStop(0, "#4f8ef7");
    grad.addColorStop(1, "#2a5bd7");
    ctx.fillStyle = day.value > 0 ? grad : "#2a2d3e";
    ctx.beginPath();
    ctx.roundRect(x, y, barW, barH, [4, 4, 0, 0]);
    ctx.fill();

    if (day.value > 0) {
      ctx.fillStyle = "#e8eaf0";
      ctx.font = "11px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(day.value, x + barW / 2, y - 6);
    }

    ctx.fillStyle = "#8891a8";
    ctx.font = "12px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(day.label, x + barW / 2, H - 10);
  });
}

function renderSitesList(siteStats) {
  const container = document.getElementById("sitesList");

  const sorted = Object.entries(siteStats)
    .filter(([host]) => host !== "unknown")
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10); // top 10

  if (sorted.length === 0) {
    container.innerHTML = `<p class="empty">No data yet — browse some sites first!</p>`;
    return;
  }

  const maxVal = sorted[0][1];
  container.innerHTML = sorted.map(([host, count]) => `
    <div class="site-row">
      <span class="site-name">${host}</span>
      <div class="site-bar-wrap">
        <div class="site-bar" style="width: ${(count / maxVal * 100).toFixed(1)}%"></div>
      </div>
      <span class="site-count">${count.toLocaleString()}</span>
    </div>
  `).join("");
}

document.getElementById("backBtn").addEventListener("click", () => {
  window.close();
});

document.getElementById("resetAllBtn").addEventListener("click", async () => {
  const first = confirm("This will delete ALL statistics including total blocked count and all site data. Are you sure?");
  if (!first) return;
  const second = confirm("This cannot be undone. Reset everything?");
  if (!second) return;
  await chrome.runtime.sendMessage({ action: "resetStats" });
  window.location.reload();
});

async function renderCustomRules() {
  const { customRules } = await chrome.runtime.sendMessage({ action: "getCustomRules" });
  const container = document.getElementById("customRulesList");

  if (!customRules || customRules.length === 0) {
    container.innerHTML = `<p class="empty">No custom rules yet.</p>`;
    return;
  }

  container.innerHTML = customRules.map(r => `
    <div class="custom-rule-row">
      <span class="custom-rule-domain">||${r.domain}^</span>
      <button class="btn-remove" data-domain="${r.domain}" title="Remove rule">✕</button>
    </div>
  `).join("");

  container.querySelectorAll(".btn-remove").forEach(btn => {
    btn.addEventListener("click", async () => {
      const domain = btn.dataset.domain;
      await chrome.runtime.sendMessage({ action: "removeCustomRule", domain });
      await renderCustomRules();
    });
  });
}

document.getElementById("addRuleBtn").addEventListener("click", async () => {
  await addCustomRule();
});

document.getElementById("customRuleInput").addEventListener("keydown", async (e) => {
  if (e.key === "Enter") await addCustomRule();
});

async function addCustomRule() {
  const input = document.getElementById("customRuleInput");
  let domain = input.value.trim().toLowerCase();

  domain = domain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]; 

  if (!domain) return;

  if (!domain.includes(".")) {
    alert("Please enter a valid domain like: example.com");
    return;
  }

  const result = await chrome.runtime.sendMessage({ action: "addCustomRule", domain });

  if (result.error) {
    alert(`Error: ${result.error}`);
    return;
  }

  input.value = "";
  await renderCustomRules();
}