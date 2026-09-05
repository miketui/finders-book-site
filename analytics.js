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

  /* Live product slugs. Do not invent new ones. */
  var PAYHIP_SLUGS = { essentials: "eHcPG", ultimate: "Y1O7B", family_bundle: "xPuv4" };
  var PAYHIP_TITLES = {
    eHcPG: "The Finder's Book — Essentials",
    Y1O7B: "The Finder's Book — Ultimate",
    xPuv4: "The Finder's Book — Family Bundle"
  };
  var CHECKOUT_SUBLINE = "Instant download · One-time · No account required";
  var PAYHIP_SCRIPT = "https://payhip.com/payhip.js";
  var START_PATH = "/start.html";
  var payhipScriptState = "idle";

  function brandedStartUrl(){
    try { return new URL(START_PATH, location.origin).href; }
    catch (e) { return START_PATH; }
  }

  function productKeyFromHref(href){
    var raw = String(href || "");
    var buy = raw.match(/[?&]link=([A-Za-z0-9_-]+)/i);
    if (buy) return buy[1];
    var page = raw.match(/payhip\.com\/b\/([A-Za-z0-9_-]+)/i);
    return page ? page[1] : "";
  }

  function productKeyFromEl(el){
    if (!el) return "";
    return el.getAttribute("data-product")
      || PAYHIP_SLUGS[el.getAttribute("data-tier")]
      || productKeyFromHref(el.getAttribute("href"));
  }

  function hidePayhipSaleChrome(){
    if (document.getElementById("fb-payhip-sale-hide")) return;
    var style = document.createElement("style");
    style.id = "fb-payhip-sale-hide";
    style.textContent = [
      ".payhip-sale,",
      ".payhip-sale-badge,",
      ".payhip-product-badge,",
      ".payhip-on-sale,",
      "[class*='payhip'][class*='sale'],",
      "[class*='Payhip'][class*='Sale'],",
      ".payhip-buy-button [class*='sale']{display:none!important}"
    ].join("");
    (document.head || document.documentElement).appendChild(style);
  }

  function decorateOverlayLink(el){
    var key = productKeyFromEl(el);
    if (!key) return;
    el.setAttribute("data-product", key);
    el.setAttribute("data-theme", "none");
    /* Own the click in openPayhipOverlay. Do not add payhip-buy-button —
       that class lets Payhip.js bind a second handler and can double-open. */
  }

  function loadPayhipScript(done){
    if (window.Payhip) { payhipScriptState = "ready"; done(true); return; }
    if (payhipScriptState === "ready") { done(!!window.Payhip); return; }
    if (payhipScriptState === "loading") {
      var once = function(){ done(!!window.Payhip); };
      window.addEventListener("finder:payhip-ready", once, { once: true });
      return;
    }
    payhipScriptState = "loading";
    var s = document.createElement("script");
    s.src = PAYHIP_SCRIPT;
    s.async = true;
    s.onload = function(){
      payhipScriptState = window.Payhip ? "ready" : "error";
      try { window.dispatchEvent(new Event("finder:payhip-ready")); } catch (e) {}
      done(!!window.Payhip);
    };
    s.onerror = function(){
      payhipScriptState = "error";
      try { window.dispatchEvent(new Event("finder:payhip-ready")); } catch (e) {}
      done(false);
    };
    (document.head || document.documentElement).appendChild(s);
  }

  function overlayTitleFor(key){
    return PAYHIP_TITLES[key] || "";
  }

  function callPayhipCheckout(key){
    var Payhip = window.Payhip;
    if (!Payhip || !key) return false;
    var start = brandedStartUrl();
    var title = overlayTitleFor(key);
    /* title / name are best-effort. Payhip's public embed API documents
       `product` only; the iframe still prints the dashboard product name. */
    var options = {
      product: key,
      title: title,
      name: title,
      successUrl: start,
      redirect: start
    };
    try {
      if (Payhip.Checkout && typeof Payhip.Checkout.open === "function") {
        Payhip.Checkout.open(options);
        return true;
      }
    } catch (e) {}
    try {
      if (typeof Payhip.Buy === "function") { Payhip.Buy(key); return true; }
    } catch (e) {}
    try {
      if (Payhip.Buy && typeof Payhip.Buy.product === "function") {
        Payhip.Buy.product(key);
        return true;
      }
    } catch (e) {}
    return false;
  }

  function openPayhipOverlay(el){
    var key = productKeyFromEl(el);
    if (!key) return false;
    return callPayhipCheckout(key);
  }

  function watchOverlaySuccess(){
    if (watchOverlaySuccess.bound) return;
    watchOverlaySuccess.bound = true;
    window.addEventListener("message", function(e){
      var origin = String(e && e.origin || "");
      if (!/^https:\/\/(?:[\w-]+\.)?payhip\.com$/i.test(origin)) return;
      var data = e.data;
      var text = "";
      try { text = typeof data === "string" ? data : JSON.stringify(data || ""); }
      catch (err) { text = ""; }
      if (!/purchas|success|complete|paid|order/i.test(text)) return;
      try { location.assign(brandedStartUrl()); } catch (err) {}
    });
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
      decorateOverlayLink(el);
    }catch(e){}
  }

  function refreshCheckoutLinks(){
    checkoutLinks().forEach(function(el){
      decorateOverlayLink(el);
      forwardAttribution(el);
    });
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

  /* ---------- checkout click tracking + in-page overlay ----------
     Prefer Payhip's overlay when the script is present. Fall back to the
     existing /buy?link= full-page path (no-JS, modifier-click, or overlay miss).
     Overlay never replaces the href, so middle-click and "Open in new tab" stay. */
  hidePayhipSaleChrome();
  watchOverlaySuccess();
  function scheduleIdlePayhip(){
    function idleLoadPayhip(){
      loadPayhipScript(function(){});
    }
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(idleLoadPayhip, { timeout: 4000 });
    } else {
      setTimeout(idleLoadPayhip, 1);
    }
  }
  /* Wait for `load` first. An idle callback during parse/image fetch
     steals the throttled pipe from the order-page cover (lab LCP). */
  if (document.readyState === "complete") scheduleIdlePayhip();
  else window.addEventListener("load", scheduleIdlePayhip);
  checkoutLinks().forEach(function(el){
    decorateOverlayLink(el);
    // Direct-checkout + UTM decoration happens at initialization so middle-click,
    // Cmd/Ctrl-click and context "Open in new tab" retain the intended checkout.
    forwardAttribution(el);
    el.addEventListener("click", function(e){
      forwardAttribution(el);
      track("checkout_click", Object.assign({
        placement: el.getAttribute("data-placement"),
        tier: el.getAttribute("data-tier") || "n/a",
        value: Number(el.getAttribute("data-price") || 0),
        currency: "USD"
      }, attribution()));
      if (!e || e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (typeof e.button === "number" && e.button !== 0) return;
      if (openPayhipOverlay(el)) {
        e.preventDefault();
        return;
      }
      if (payhipScriptState === "idle" || payhipScriptState === "loading") {
        e.preventDefault();
        loadPayhipScript(function(ready){
          if (ready && openPayhipOverlay(el)) return;
          try { location.assign(el.href); } catch (err) {}
        });
      }
    });
  });
  if (window.fbAnalyticsConsent === "granted") hydrateGaCheckout();

  window.fbPayhip = {
    slugs: PAYHIP_SLUGS,
    titles: PAYHIP_TITLES,
    checkoutSubline: CHECKOUT_SUBLINE,
    startPath: START_PATH,
    overlayTitleFor: overlayTitleFor,
    productKeyFromHref: productKeyFromHref,
    productKeyFromEl: productKeyFromEl,
    brandedStartUrl: brandedStartUrl,
    openOverlay: openPayhipOverlay
  };

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
