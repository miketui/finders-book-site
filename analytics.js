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
      if (typeof window.gtag === "function") window.gtag("event", name, p);
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

  /* ---------- landing view ---------- */
  track("landing_view", Object.assign({offer:"the-finders-book"}, attribution()));
  window.addEventListener("finder:analytics-consent", function(e){
    if (e && e.detail && e.detail.status === "granted") {
      track("landing_view", Object.assign({offer:"the-finders-book"}, attribution()));
    }
  });

  /* ---------- forward UTM params to external checkout links ---------- */
  function forwardAttribution(el){
    var raw = el.getAttribute("href") || "";
    if (!/^https?:\/\//i.test(raw)) return;
    try{
      var url = new URL(raw), source = attribution();
      Object.keys(source).forEach(function(key){
        if (!url.searchParams.has(key)) url.searchParams.set(key, source[key]);
      });
      el.href = url.toString();
    }catch(e){}
  }

  /* ---------- checkout click tracking ---------- */
  document.querySelectorAll("[data-checkout]").forEach(function(el){
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
