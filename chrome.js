/* ============================================================
   THE FINDER'S BOOK — CHROME BEHAVIOUR
   Header scroll state, mobile drawer, focus trap, active links.

   Markup lives statically in every page (crawlable, zero CLS).
   Behaviour lives here, once. See docs/CHROME.md.

   Depends on analytics.js for window.fbTrack (optional).
   Degrades completely: with JS off the nav is a plain, usable
   list of links and every page is fully navigable.
   ============================================================ */
(function () {
  "use strict";

  function track(name, params) {
    if (typeof window.fbTrack === "function") window.fbTrack(name, params);
  }

  var reduced = false;
  try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  var hdr     = document.querySelector(".hdr");
  var nav     = document.querySelector(".hdr .nav");
  var toggle  = document.querySelector(".nav-toggle");
  var scrim   = document.querySelector(".scrim");
  var isOver  = document.documentElement.classList.contains("hdr-over");

  /* ============================================================
     1. HEADER SCROLL STATE
     solid  — past the hero, paper background
     The header (and Get Ultimate) stay visible on scroll-down.
     ============================================================ */
  if (hdr) {
    var queued   = false;
    var SOLID_AT = isOver ? 80 : 8;

    function applyHeaderState() {
      var y = window.pageYOffset || 0;
      hdr.classList.toggle("solid", y > SOLID_AT);
      hdr.classList.remove("tuck");
    }

    function queueHeader() {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; applyHeaderState(); });
    }

    window.addEventListener("scroll", queueHeader, { passive: true });
    window.addEventListener("resize", queueHeader);
    applyHeaderState();
  }

  /* ============================================================
     2. MOBILE DRAWER + FOCUS TRAP

     NOTE: this is deliberately NOT the pattern used by the
     lightbox in motion.js, which pins focus to a single control.
     A drawer must let the user reach every link inside it, so
     focus cycles through all focusable children (WCAG 2.1.2).
     ============================================================ */
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),' +
                  'select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  var lastFocus = null;

  function focusablesIn(root) {
    return Array.prototype.filter.call(
      root.querySelectorAll(FOCUSABLE),
      function (el) { return el.offsetParent !== null || el === document.activeElement; }
    );
  }

  function openNav() {
    if (!nav || !toggle) return;
    lastFocus = document.activeElement;
    nav.classList.add("on");
    if (scrim) scrim.classList.add("on");
    toggle.setAttribute("aria-expanded", "true");
    document.body.classList.add("nav-open");
    document.body.style.overflow = "hidden";
    if (hdr) hdr.classList.remove("tuck");

    var f = focusablesIn(nav);
    if (f.length) f[0].focus();
    track("nav_open", { viewport: "mobile" });
  }

  function closeNav(returnFocus) {
    if (!nav || !toggle) return;
    nav.classList.remove("on");
    if (scrim) scrim.classList.remove("on");
    toggle.setAttribute("aria-expanded", "false");
    document.body.classList.remove("nav-open");
    document.body.style.overflow = "";
    if (returnFocus !== false && lastFocus) lastFocus.focus();
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      if (toggle.getAttribute("aria-expanded") === "true") closeNav();
      else openNav();
    });

    if (scrim) scrim.addEventListener("click", function () { closeNav(); });

    /* Following a link closes the drawer without stealing focus back. */
    nav.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a");
      if (a && nav.classList.contains("on")) closeNav(false);
    });

    document.addEventListener("keydown", function (e) {
      if (!nav.classList.contains("on")) return;

      if (e.key === "Escape") { closeNav(); return; }
      if (e.key !== "Tab") return;

      var f = focusablesIn(nav);
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus();
      }
      /* Otherwise the browser's native tab order is left alone —
         every link inside the drawer stays reachable. */
    });

    /* Leaving mobile width with the drawer open would otherwise
       strand the body in overflow:hidden. */
    if (window.matchMedia) {
      var mq = window.matchMedia("(min-width:721px)");
      var onChange = function (ev) { if (ev.matches) closeNav(false); };
      if (mq.addEventListener) mq.addEventListener("change", onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
  }

  /* ============================================================
     3. ACTIVE PAGE
     ============================================================ */
  (function markActivePage() {
    if (!nav) return;
    var path = window.location.pathname.replace(/index\.html$/, "").replace(/\/$/, "") || "/";
    Array.prototype.forEach.call(nav.querySelectorAll("a[href]"), function (a) {
      var href = a.getAttribute("href") || "";
      if (href.charAt(0) === "#" || /^https?:/i.test(href)) return;
      var target = href.replace(/index\.html$/, "").replace(/\/$/, "") || "/";
      if (target === path) a.setAttribute("aria-current", "page");
    });
  })();

  /* ============================================================
     4. ACTIVE SECTION (home page only)
     Reuses the same observer strategy as motion.js rather than
     adding a scroll handler.
     ============================================================ */
  (function markActiveSection() {
    if (!nav || !("IntersectionObserver" in window)) return;

    var anchors = Array.prototype.filter.call(
      nav.querySelectorAll('a[href^="#"]'),
      function (a) { return a.getAttribute("href").length > 1; }
    );
    if (!anchors.length) return;

    var map = {};
    var targets = [];
    anchors.forEach(function (a) {
      var id = a.getAttribute("href").slice(1);
      var el = document.getElementById(id);
      if (el) { map[id] = a; targets.push(el); }
    });
    if (!targets.length) return;

    var current = null;
    var sio = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var id = entry.target.id;
        if (id === current) return;
        if (current && map[current]) map[current].removeAttribute("aria-current");
        current = id;
        if (map[id]) map[id].setAttribute("aria-current", "true");
      });
    }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });

    targets.forEach(function (t) { sio.observe(t); });
  })();

  /* ============================================================
     5. SMOOTH ANCHOR SCROLL WITH HEADER OFFSET
     ============================================================ */
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if (!a) return;
    var id = a.getAttribute("href").slice(1);
    if (!id) return;
    var el = document.getElementById(id);
    if (!el) return;

    e.preventDefault();
    var offset = hdr ? hdr.getBoundingClientRect().height : 0;
    var top = el.getBoundingClientRect().top + window.pageYOffset - offset - 12;
    window.scrollTo({ top: top, behavior: reduced ? "auto" : "smooth" });
    /* Keep the URL and the keyboard in sync. */
    history.replaceState(null, "", "#" + id);
    el.setAttribute("tabindex", "-1");
    el.focus({ preventScroll: true });
  });
})();

/* ============================================================
   6. CROSS-PAGE EVENTS
   Added here rather than in analytics.js so the existing event
   contract (landing_view, pricing_view, cta_click, checkout_click,
   lead_submit, faq_open) is not touched. These are NEW events only.
   ============================================================ */
(function () {
  "use strict";
  function track(name, params) {
    if (typeof window.fbTrack === "function") window.fbTrack(name, params);
  }
  function attribution() {
    if (typeof window.fbAttribution === "function") return window.fbAttribution();
    return {};
  }

  /* Internal navigation CTAs — distinct from checkout_click, which
     analytics.js already owns for [data-checkout]. */
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("[data-cta]");
    if (!a || a.hasAttribute("data-checkout")) return;
    track("nav_cta_click", Object.assign({
      placement: a.getAttribute("data-placement") || "unknown",
      href: a.getAttribute("href") || ""
    }, attribution()));
  });

  /* Objection accordions on the order page. */
  Array.prototype.forEach.call(document.querySelectorAll("details[data-faq]"), function (d) {
    d.addEventListener("toggle", function () {
      if (!d.open) return;
      var s = d.querySelector("summary");
      track("objection_open", { question: s ? s.textContent.trim().slice(0, 90) : "" });
    });
  });

  /* One page_view per sub-page, named so it does not collide with
     landing_view on the home page. */
  (function () {
    var path = window.location.pathname;
    if (path === "/" || /index\.html$/.test(path)) return;
    var name = path.replace(/^\//, "").replace(/\.html$/, "") || "unknown";
    track("subpage_view", Object.assign({ page: name }, attribution()));
  })();

  /* Visiting any inner page counts as a return: the homepage intro
     compresses on the next arrival. Do not set this on "/" here —
     motion.js owns the first-home-visit write after Act 0 has decided. */
  (function markReturningVisitor() {
    var path = window.location.pathname;
    if (path === "/" || /index\.html$/.test(path)) return;
    try {
      document.cookie = "fb_seen_intro=1; Max-Age=31536000; Path=/; SameSite=Lax";
      localStorage.setItem("fb_seen_intro", "1");
    } catch (e) {}
  })();
})();
