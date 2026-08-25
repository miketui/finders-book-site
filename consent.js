/* ============================================================
   THE FINDER'S BOOK — OPTIONAL ANALYTICS CONSENT

   GA4 and Vercel Web Analytics are never requested until the
   visitor explicitly allows analytics. The preference itself is
   stored locally so the site can remember the choice.
   ============================================================ */
(function () {
  "use strict";

  var STORAGE_KEY = "fb_analytics_consent_v1";
  var GA_ID = "G-ZXX0M4VYT5";
  window.fbGaMeasurementId = GA_ID;
  var loaded = false;

  /* Establish the consent queue before any provider can load. Google recommends
     setting the denied default before tag configuration, then issuing an
     explicit update after the visitor makes a choice. */
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag("consent", "default", {
    ad_storage: "denied",
    analytics_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied"
  });

  function readChoice() {
    try {
      var value = localStorage.getItem(STORAGE_KEY);
      return value === "granted" || value === "denied" ? value : "unknown";
    } catch (e) {
      return "unknown";
    }
  }

  function writeChoice(value) {
    try { localStorage.setItem(STORAGE_KEY, value); } catch (e) {}
  }

  function addScript(src, id, isAsync) {
    if (document.getElementById(id)) return;
    var script = document.createElement("script");
    script.id = id;
    script.src = src;
    if (isAsync) script.async = true;
    else script.defer = true;
    document.head.appendChild(script);
  }

  function loadAnalytics() {
    if (loaded) return;
    loaded = true;

    window.gtag("js", new Date());
    window.gtag("config", GA_ID, { anonymize_ip: true });
    addScript("https://www.googletagmanager.com/gtag/js?id=" + GA_ID, "fb-ga4", true);

    window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
    addScript("/_vercel/insights/script.js", "fb-vercel-analytics", false);
  }

  function clearGaCookies() {
    try {
      var parts = location.hostname.split(".");
      var parentDomain = parts.length > 1 ? "." + parts.slice(-2).join(".") : "";
      document.cookie.split(";").forEach(function (part) {
        var name = part.split("=")[0].trim();
        if (!/^_ga(?:_|$)/.test(name)) return;
        document.cookie = name + "=; Max-Age=0; Path=/; SameSite=Lax";
        document.cookie = name + "=; Max-Age=0; Path=/; Domain=." + location.hostname + "; SameSite=Lax";
        if (parentDomain) document.cookie = name + "=; Max-Age=0; Path=/; Domain=" + parentDomain + "; SameSite=Lax";
      });
    } catch (e) {}
  }

  function announce(value) {
    try {
      window.dispatchEvent(new CustomEvent("finder:analytics-consent", {
        detail: { status: value }
      }));
    } catch (e) {}
  }

  function applyChoice(value) {
    window.fbAnalyticsConsent = value;
    if (value === "granted") {
      window["ga-disable-" + GA_ID] = false;
      window.gtag("consent", "update", {
        ad_storage: "denied",
        analytics_storage: "granted",
        ad_user_data: "denied",
        ad_personalization: "denied"
      });
      loadAnalytics();
    }
    if (value === "denied") {
      window["ga-disable-" + GA_ID] = true;
      window.gtag("consent", "update", {
        ad_storage: "denied",
        analytics_storage: "denied",
        ad_user_data: "denied",
        ad_personalization: "denied"
      });
      clearGaCookies();
    }
  }

  function buildControls() {
    var banner = document.createElement("section");
    banner.className = "consent-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-modal", "false");
    banner.setAttribute("aria-labelledby", "consent-title");
    banner.hidden = true;
    banner.innerHTML =
      '<div class="consent-copy">' +
        '<h2 id="consent-title">Your privacy choice</h2>' +
        '<p>Optional analytics help us understand which pages and offers work. The site works normally if you decline. <a href="/privacy-policy.html">Read the privacy policy</a>.</p>' +
      '</div>' +
      '<div class="consent-actions">' +
        '<button type="button" class="consent-decline">Decline analytics</button>' +
        '<button type="button" class="consent-allow">Allow analytics</button>' +
      '</div>';

    var reopen = document.createElement("button");
    reopen.type = "button";
    reopen.className = "consent-reopen";
    reopen.textContent = "Privacy choices";
    reopen.setAttribute("aria-haspopup", "dialog");
    reopen.hidden = true;

    function show(focus) {
      banner.hidden = false;
      reopen.hidden = true;
      if (focus) banner.querySelector(".consent-decline").focus();
    }

    function choose(value) {
      writeChoice(value);
      applyChoice(value);
      banner.hidden = true;
      reopen.hidden = false;
      reopen.focus();
      announce(value);
    }

    banner.querySelector(".consent-decline").addEventListener("click", function () { choose("denied"); });
    banner.querySelector(".consent-allow").addEventListener("click", function () { choose("granted"); });
    reopen.addEventListener("click", function () { show(true); });

    document.body.appendChild(banner);
    document.body.appendChild(reopen);

    if (window.fbAnalyticsConsent === "unknown") show(false);
    else reopen.hidden = false;
  }

  window.fbAnalyticsConsent = readChoice();
  applyChoice(window.fbAnalyticsConsent);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", buildControls);
  else buildControls();
})();
