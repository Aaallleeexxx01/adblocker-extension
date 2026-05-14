
(function() {
  window.open = function() { return null; };

  document.addEventListener("submit", (e) => {
    const form = e.target;
    if (form.target === "_blank") {
      form.removeAttribute("target");
    }
  }, true);

  document.addEventListener("auxclick", (e) => {
    if (e.button === 1) {
      const el = e.target.closest("a");
      if (el && isAdLink(el.href)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }, true);

  document.addEventListener("click", (e) => {
    const el = e.target.closest("a");
    if (!el) return;

    if (el.target === "_blank" && el.href && isAdLink(el.href)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    if (el.href && el.href.startsWith("javascript:")) {
      const code = el.href.slice("javascript:".length);
      if (/window\.open|popup|ad/i.test(code)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }
  }, true);

  const _addEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    if (type === "click" && this === document) {
      const wrapped = function(e) {
        if (e.target?.closest("a[href*='ad']")) return;
        return listener.call(this, e);
      };
      return _addEventListener.call(this, type, wrapped, options);
    }
    return _addEventListener.call(this, type, listener, options);
  };

  function isAdLink(href) {
    if (!href) return false;
    const adPatterns = [
      /doubleclick/, /googlesyndication/, /adnxs/, /taboola/, /outbrain/,
      /popads/, /popcash/, /propellerads/, /exoclick/, /adsterra/,
      /trafficjunky/, /juicyads/, /hilltopads/, /adcash/, /clickadu/,
      /tsyndicate/, /plugrush/, /adspyglass/, /fsonline.*ad/,
      /track\./, /click\./, /go\./, /redirect\./
    ];
    return adPatterns.some(p => p.test(href));
  }
})();

const AD_SELECTORS = [
  ".ad", ".ads", ".ad-container", ".ad-wrapper", ".advertisement",
  ".adsbygoogle", ".ad-slot", ".ad-unit", ".ad-banner",
  "ins.adsbygoogle", ".sticky-ad", ".floating-ad", ".overlay-ad",
  '[data-ad-unit]', '[data-google-query-id]',
  "#ad", "#ads", "#advertisement", "#google_ads_iframe_0",
  ".popup", ".pop-up", ".popunder", ".overlay", ".modal-ad",
  "[id*='popup']", "[class*='popup']", "[id*='overlay']",
  "[id*='banner-ad']", "[class*='banner-ad']"
];

function hideAdElements() {
  try {
    const selector = AD_SELECTORS.join(", ");
    document.querySelectorAll(selector).forEach(el => {
      const tag = el.tagName?.toLowerCase();
      if (tag === "img" || tag === "video" || tag === "canvas") return;
      const text = (el.innerText || el.textContent || "").trim();
      if (text.length < 50) {
        el.style.setProperty("display", "none", "important");
        el.style.setProperty("visibility", "hidden", "important");
        el.style.setProperty("height", "0", "important");
      }
    });
  } catch(e) {}
}

function startObserver() {
  try {
    const target = document.body || document.documentElement;
    if (!target) {
      document.addEventListener("DOMContentLoaded", startObserver);
      return;
    }
    hideAdElements();
    const observer = new MutationObserver(() => hideAdElements());
    observer.observe(target, { childList: true, subtree: true });
  } catch(e) {}
}

startObserver();