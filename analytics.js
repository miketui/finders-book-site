/* ============================================================
   THE FINDER'S BOOK — ANALYTICS & FUNNEL TRACKING
   Fires to consent-loaded analytics providers only after the visitor
   explicitly allows optional analytics. Zero hard dependencies.
   ============================================================ */
(function(){
  "use strict";

  /* ---------- page dimension ----------
     data-placement="header" and "drawer" fire from all eight pages, so
     without this every header-CTA click landed in one undifferentiated
     bucket and header performance could not be attributed to a page. */
  var PAGE_ID = (function(){
    try{
      var path = (location.pathname || "/").replace(/\/index\.html$/i, "/").replace(/\.html$/i, "");
      var id = path.replace(/^\/+/, "").replace(/\/+$/, "");
      return id || "home";
    }catch(e){ return "unknown"; }
  })();

  /* ---------- shared tracking bus ---------- */
  function track(name, params){
    if (window.fbAnalyticsConsent !== "granted") return;
    var p = Object.assign({page_variant:"v3.2", page_id:PAGE_ID}, params || {});
    try{
      if (typeof window.va === "function") window.va("event", {name:name, data:p});
      if (typeof window.gtag === "function") {
        var gaParams = Object.assign({}, p);
        if (window.fbGaMeasurementId) gaParams.send_to = window.fbGaMeasurementId;
        window.gtag("event", name, gaParams);
      }
      else if (Array.isArray(window.dataLayer)) window.dataLayer.push(Object.assign({event:name}, p));
      if (typeof window.plausible === "function") window.plausible(name, {props:p});
      if (typeof window.fbq === "function" && name === "checkout_click") window.fbq("track","InitiateCheckout",p);
      if (typeof window.fbq === "function" && name === "lead_submit") window.fbq("track","Lead",p);
    }catch(e){}
  }

  /* ---------- UTM attribution, held for this session ---------- */
  try{
    var qs = new URLSearchParams(location.search), utm = {}, keys = ["utm_source","utm_medium","utm_campaign","utm_content","utm_term"];
    keys.forEach(function(k){ if (qs.get(k)) utm[k] = qs.get(k); });
    if (Object.keys(utm).length) sessionStorage.setItem("fb_utm", JSON.stringify(utm));
  }catch(e){}

  function attribution(){
    try{ return JSON.parse(sessionStorage.getItem("fb_utm") || "{}"); }catch(e){ return {}; }
  }

  /* ---------- consent-gated checkout attribution bridge ----------
     Payhip direct checkout supports metadata[...] values and echoes them into
     the paid/refunded webhook. When analytics is allowed, carry GA4's existing
     browser client/session ids through that metadata so the server purchase can
     join the same GA4 session. No email, name, IP or other customer PII is added.
     Without consent these two metadata keys are removed and checkout still works. */
  var gaCheckout = { clientId: "", sessionId: "" };

  function checkoutLinks(){
    return document.querySelectorAll("[data-checkout]");
  }

  function asPayhipDirectCheckout(url){
    if (!/(^|\.)payhip\.com$/i.test(url.hostname)) return url;
    var match = url.pathname.match(/^\/b\/([A-Za-z0-9_-]+)\/?$/);
    if (!match) return url;
    var prior = new URLSearchParams(url.search);
    url.pathname = "/buy";
    url.search = "";
    url.searchParams.set("link", match[1]);
    prior.forEach(function(value, key){
      if (!url.searchParams.has(key)) url.searchParams.append(key, value);
    });
    return url;
  }

  function forwardAttribution(el){
    var raw = el.getAttribute("href") || "";
    if (!/^https?:\/\//i.test(raw)) return;
    try{
      var url = asPayhipDirectCheckout(new URL(raw)), source = attribution();
      Object.keys(source).forEach(function(key){
        if (!url.searchParams.has(key)) url.searchParams.set(key, source[key]);
      });

      // A visitor can withdraw consent after links were already decorated.
      // Remove analytics metadata first, then add it back only while granted.
      url.searchParams.delete("metadata[ga_client_id]");
      url.searchParams.delete("metadata[ga_session_id]");
      ["utm_source","utm_medium","utm_campaign","utm_content","utm_term"].forEach(function(key){
        url.searchParams.delete("metadata[" + key + "]");
      });
      if (window.fbAnalyticsConsent === "granted") {
        if (gaCheckout.clientId) url.searchParams.set("metadata[ga_client_id]", gaCheckout.clientId);
        if (gaCheckout.sessionId) url.searchParams.set("metadata[ga_session_id]", gaCheckout.sessionId);
        Object.keys(source).forEach(function(key){
          url.searchParams.set("metadata[" + key + "]", source[key]);
        });
      }
      el.href = url.toString();
    }catch(e){}
  }

  function refreshCheckoutLinks(){
    checkoutLinks().forEach(forwardAttribution);
  }

  function hydrateGaCheckout(){
    gaCheckout = { clientId: "", sessionId: "" };
    refreshCheckoutLinks();
    if (window.fbAnalyticsConsent !== "granted") return;
    if (typeof window.gtag !== "function" || !window.fbGaMeasurementId) return;

    var next = { clientId: "", sessionId: "" }, remaining = 2;
    function done(){
      remaining -= 1;
      if (remaining === 0) {
        gaCheckout = next;
        refreshCheckoutLinks();
      }
    }
    try{
      window.gtag("get", window.fbGaMeasurementId, "client_id", function(value){
        var id = String(value || "").trim();
        if (/^\d+\.\d+$/.test(id)) next.clientId = id;
        done();
      });
    }catch(e){ done(); }
    try{
      window.gtag("get", window.fbGaMeasurementId, "session_id", function(value){
        var id = String(value || "").trim();
        if (/^\d+$/.test(id) && Number(id) > 0) next.sessionId = id;
        done();
      });
    }catch(e){ done(); }
  }

  /* ---------- landing view ---------- */
  track("landing_view", Object.assign({offer:"the-finders-book"}, attribution()));
  window.addEventListener("finder:analytics-consent", function(e){
    var status = e && e.detail && e.detail.status;
    if (status === "granted") track("landing_view", Object.assign({offer:"the-finders-book"}, attribution()));
    if (status === "granted" || status === "denied") hydrateGaCheckout();
  });

  /* ---------- checkout click tracking ---------- */
  checkoutLinks().forEach(function(el){
    // Direct-checkout + UTM decoration happens at initialization so middle-click,
    // Cmd/Ctrl-click and context "Open in new tab" retain the intended checkout.
    forwardAttribution(el);
    el.addEventListener("click", function(){
      forwardAttribution(el);
      track("checkout_click", Object.assign({
        placement: el.getAttribute("data-placement"),
        tier: el.getAttribute("data-tier") || "n/a",
        value: Number(el.getAttribute("data-price") || 0),
        currency: "USD"
      }, attribution()));
    });
  });
  if (window.fbAnalyticsConsent === "granted") hydrateGaCheckout();

  /* ---------- supporting CTA clicks ---------- */
  document.querySelectorAll("[data-scroll-cta]").forEach(function(el){
    el.addEventListener("click", function(){
      track("cta_click", Object.assign({
        placement: el.getAttribute("data-placement") || "n/a",
        destination: el.getAttribute("href") || ""
      }, attribution()));
    });
  });

  /* ---------- FAQ open tracking ---------- */
  document.querySelectorAll(".faq details").forEach(function(d){
    d.addEventListener("toggle", function(){
      if (d.open) track("faq_open", {question: d.querySelector("summary").textContent.trim()});
    });
  });

  /* ---------- pricing section view ---------- */
  var pricing = document.getElementById("pricing");
  if (pricing && "IntersectionObserver" in window){
    var seenPricing = false;
    new IntersectionObserver(function(entries){
      entries.forEach(function(en){
        if (en.isIntersecting && !seenPricing){
          seenPricing = true;
          track("pricing_view", attribution());
        }
      });
    }, {threshold: 0.15}).observe(pricing);
  }

  /* Expose for use by motion.js and other scripts */
  window.fbTrack = track;
  window.fbAttribution = attribution;
})();
