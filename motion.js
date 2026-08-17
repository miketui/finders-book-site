/* ============================================================
   THE FINDER'S BOOK — MOTION & INTERACTIONS (v4.1 ACT-ZERO)
   The page is sequenced as the book being opened: Act 0 withholds
   the product for four scroll-scrubbed statements, then the reveal
   earns the object with one rotation. Powered by GSAP where present,
   with a vanilla scroll layer that runs on every page so the sequence,
   the lightbox, the sticky bar and the form all work with or without
   the CDN. Animates only when html.fx is set and prefers-reduced-motion
   is not active. Depends on analytics.js exposing window.fbTrack /
   window.fbAttribution. Support: info@familyfindersbook.com
   ============================================================ */
(function(){
  "use strict";

  /* ---------- helpers ---------- */
  function track(name, params){
    if (typeof window.fbTrack === "function") window.fbTrack(name, params);
  }
  function attribution(){
    if (typeof window.fbAttribution === "function") return window.fbAttribution();
    return {};
  }

  var docEl = document.documentElement;
  /* html.js is added once the Act sequence controller has fully bound —
     see the end of section 2 below, not here. It must mark "the sequence
     is confirmed running," not "the file started executing": a script
     that starts but throws partway through section 2, before any line's
     is-on class gets set, would otherwise leave html.js present with
     nothing actually driving Act 0 — the exact blank-screen failure this
     marker exists to prevent. */

  var reduced = false;
  try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  /* The native anchor remains the no-JS/failure fallback. When the motion
     layer is healthy, route the same action through Lenis if it is active so
     two independent scroll controllers never fight over the destination. */
  var smoothScroller = null;
  function scrollToTarget(target){
    if (!target) return;
    if (smoothScroller && typeof smoothScroller.scrollTo === "function"){
      smoothScroller.scrollTo(target, { duration: 0.85, immediate: reduced });
      return;
    }
    var top = target.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top: top, behavior: reduced ? "auto" : "smooth" });
    if (reduced) return;
    /* A scrubbed ScrollTrigger interrupts a native smooth scroll partway: on
       phones the Skip control consistently stopped 77px short, leaving the
       headline tucked under the header. Re-assert the position once the
       animation has had time to finish — and only while we are clearly still
       aiming at the same place, so a visitor who scrolled somewhere else in
       the meantime never gets yanked back. */
    window.setTimeout(function(){
      var drift = target.getBoundingClientRect().top;
      if (Math.abs(drift) > 2 && Math.abs(drift) < 240){
        window.scrollTo({ top: window.scrollY + drift, behavior: "auto" });
      }
    }, 900);
  }

  /* ============================================================
     0. ACT-0 COMPRESSION — warm traffic does not need the full intro.
     Any deep-link (#anchor), a returning visitor, or paid/retargeting
     traffic collapses Act 0 to a single relief statement. Cold organic
     and direct traffic get the full four-statement sequence.
     Set before the reveal binds so the scroll math uses the right height.
     ============================================================ */
  (function(){
    var call = document.getElementById("call");
    if (!call) return;
    var warm = false;
    try {
      if (location.hash && location.hash.length > 1) warm = true;
      var qs = new URLSearchParams(location.search);
      var medium = (qs.get("utm_medium") || "").toLowerCase();
      if (/cpc|paid|retarget|remarket|display|social|email|affiliate/.test(medium)) warm = true;
      /* sessionStorage, not localStorage: this is a same-session warm-
         traffic signal for choosing which UI variant to show, not data
         this site persists across visits without consent — consent.js
         owns that decision for everything that actually needs it. */
      if (sessionStorage.getItem("fb_seen_call") === "1") warm = true;
    } catch (e) {}
    if (warm) docEl.classList.add("call-compress");
    try {
      window.addEventListener("load", function(){
        try { sessionStorage.setItem("fb_seen_call", "1"); } catch (e) {}
      });
    } catch (e) {}
  })();

  /* ============================================================
     1. CSS REVEAL — reveals every html.fx-gated element on scroll.
     Runs on EVERY page, with or without GSAP, so .rfield, .eyebrow
     rules and .fx-* primitives are never left invisible. Idempotent
     with the GSAP layer below (different elements / properties).
     ============================================================ */
  function cssReveal(){
    var els = document.querySelectorAll(".fx-up, .fx-fade, .fx-scale, .fx-in, .fx-rule, .rfield, .eyebrow");
    if (!els.length) return;
    if (reduced || !("IntersectionObserver" in window)){
      Array.prototype.forEach.call(els, function(el){ el.classList.add("fx-on"); });
      return;
    }
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(entry){
        if (!entry.isIntersecting) return;
        entry.target.classList.add("fx-on");
        io.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.01 });

    Array.prototype.forEach.call(els, function(el, i){
      var r = el.getBoundingClientRect();
      if (r.top < (window.innerHeight || 0)){
        el.style.setProperty("--fx-d", Math.min(i * 60, 360) + "ms");
        el.classList.add("fx-on");
      } else {
        io.observe(el);
      }
    });
  }
  cssReveal();

  /* ============================================================
     2. THE ACT SEQUENCE — vanilla scroll, works with or without GSAP.
     Act 0 scrub · the reveal · write-in · strike · the spread.
     Under reduced motion everything is shown at once and nothing moves.
     ============================================================ */
  (function(){
    var call    = document.getElementById("call");
    var reveal  = document.getElementById("reveal");
    var spine   = document.getElementById("callSpine");
    var hint    = document.getElementById("callHint");
    var lines   = call ? Array.prototype.slice.call(call.querySelectorAll(".call-line")) : [];
    var snapshot= document.getElementById("snapshot");
    var security= document.getElementById("security");
    var track3d = document.getElementById("spreadTrack");
    var spread  = document.getElementById("inside");
    var bar     = document.getElementById("spreadBar");

    /* Reduced motion, or no Act 0 on the page: reveal everything, done. */
    if (reduced){
      if (reveal) reveal.classList.add("is-revealed");
      if (snapshot) snapshot.classList.add("is-written");
      if (security) security.classList.add("is-struck");
      lines.forEach(function(l){ l.classList.add("is-on"); });
      return;
    }

    var current = -1;
    var revealed = false;
    var seen = {};

    function armOnce(el, cls, key){
      if (!el || seen[key]) return;
      var r = el.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.80 && r.bottom > 0){
        seen[key] = true;
        el.classList.add(cls);
      }
    }

    function paintCall(){
      if (!call || !lines.length) return;
      var compressed = docEl.classList.contains("call-compress");
      if (compressed){
        /* Single relief line, always shown; no scrub. */
        if (current !== 3){
          current = 3;
          lines.forEach(function(l){ l.classList.toggle("is-on", l.getAttribute("data-slot") === "3"); });
        }
        return;
      }
      var box = call.getBoundingClientRect();
      var travel = call.offsetHeight - window.innerHeight;
      var p = travel > 0 ? Math.min(1, Math.max(0, -box.top / travel)) : 0;
      var stops = [0, 0.22, 0.44, 0.66];
      var slot = 0;
      for (var i = stops.length - 1; i >= 0; i--){ if (p >= stops[i]) { slot = i; break; } }
      if (slot !== current){
        current = slot;
        lines.forEach(function(l, idx){ l.classList.toggle("is-on", idx === slot); });
      }
      if (spine) spine.style.height = (p * 100).toFixed(1) + "%";
      if (hint) hint.classList.toggle("gone", p > 0.04);
      /* Suppress the header purchase CTA until the reveal has begun. */
      document.body.classList.toggle("in-call", !revealed && box.bottom > window.innerHeight * 0.5);
    }

    function paintReveal(){
      if (!reveal || revealed) return;
      var r = reveal.getBoundingClientRect();
      if (r.top < window.innerHeight * 0.62){
        revealed = true;
        reveal.classList.add("is-revealed");
        document.body.classList.remove("in-call");
      }
    }

    /* scrollWidth/clientWidth only change on resize, not on scroll — reading
       them inside the scroll-driven paint functions forces a synchronous
       layout on every frame. Cached here, recomputed only on resize. */
    var spreadTravel = 0;
    function measureSpread(){
      if (!track3d) return;
      spreadTravel = Math.max(0, track3d.scrollWidth - track3d.parentElement.clientWidth);
    }

    function paintSpread(){
      if (!spread || !track3d) return;
      var r = spread.getBoundingClientRect();
      var vh = window.innerHeight;
      var p = Math.min(1, Math.max(0, (vh - r.top) / (vh + r.height)));
      track3d.style.transform = "translate3d(" + (-spreadTravel * p).toFixed(1) + "px,0,0)";
      if (bar) bar.style.width = (p * 100).toFixed(1) + "%";
    }

    var ticking = false;
    function onScroll(){
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(function(){
        paintCall();
        paintReveal();
        paintSpread();
        armOnce(snapshot, "is-written", "snap");
        armOnce(security, "is-struck", "strike");
        ticking = false;
      });
    }

    measureSpread();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", function(){ measureSpread(); onScroll(); });
    onScroll();

    /* Everything above this line ran without throwing: the scroll/resize
       listeners are attached and the first paint is queued. This is the
       point html.js means "the sequence is bound" rather than merely
       "the file started" — see the note where docEl is declared. Also
       switches .spread-viewport from native scroll to the JS-controlled
       transform (styles.css, html.fx.js .spread-viewport). */
    docEl.classList.add("js");

    var callSkip = document.getElementById("callSkip");
    if (callSkip && reveal){
      /* The href="#reveal" on this control is the no-JS path and is left
         intact; once the sequence is bound, scrollToTarget owns the movement
         because it routes through Lenis when Lenis is driving the page and
         corrects for the scrub interrupting a native smooth scroll when it
         is not. */
      callSkip.addEventListener("click", function(e){
        e.preventDefault();
        scrollToTarget(reveal);
      });
    }

    /* The book answers the cursor once revealed, and never spins again. */
    var book = document.getElementById("book");
    var stage = book && book.parentElement;
    if (book && stage){
      stage.addEventListener("pointermove", function(e){
        if (!revealed) return;
        var b = stage.getBoundingClientRect();
        var dx = (e.clientX - (b.left + b.width / 2)) / b.width;
        book.style.transition = "transform .6s cubic-bezier(.22,1,.36,1)";
        book.style.transform = "rotateY(" + (-18 + dx * 14).toFixed(2) + "deg) translateY(0)";
      });
      stage.addEventListener("pointerleave", function(){
        if (!revealed) return;
        book.style.transform = "rotateY(-18deg) translateY(0)";
      });
    }
  })();

  /* ============================================================
     3. THE "ALL 49" OVERLAY — holds the seven scans off the spread.
     ============================================================ */
  (function(){
    var overlay = document.getElementById("allPages");
    var openBtn = document.getElementById("veilBtn");
    var closeBtn = document.getElementById("allPagesClose");
    if (!overlay || !openBtn || !closeBtn) return;
    var lastFocus = null;
    function open(){
      lastFocus = document.activeElement;
      overlay.hidden = false;
      openBtn.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
      closeBtn.focus();
      track("all_pages_open", { offer: "the-finders-book" });
    }
    function close(){
      overlay.hidden = true;
      openBtn.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
      if (lastFocus) lastFocus.focus();
    }
    /* Focus trap: the overlay holds a real grid of page-preview buttons a
       keyboard user should be able to reach, so Tab must cycle within the
       dialog (first <-> last) rather than escape to the page behind it. */
    function focusables(){
      return Array.prototype.slice.call(
        overlay.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
      ).filter(function(el){ return !el.disabled && el.offsetParent !== null; });
    }

    openBtn.addEventListener("click", open);
    closeBtn.addEventListener("click", close);
    overlay.addEventListener("click", function(e){ if (e.target === overlay) close(); });
    document.addEventListener("keydown", function(e){
      if (overlay.hidden) return;
      if (e.key === "Escape"){ close(); return; }
      if (e.key !== "Tab") return;
      var list = focusables();
      if (!list.length) return;
      var first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first){
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last){
        e.preventDefault(); first.focus();
      }
    });
  })();

  /* ---------- GSAP setup ---------- */
  var hasGSAP = (typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined");

  if (hasGSAP){
    gsap.registerPlugin(ScrollTrigger);

    var mm = gsap.matchMedia();
    mm.add(
      {
        animate: "(prefers-reduced-motion: no-preference)",
        reduce:  "(prefers-reduced-motion: reduce)"
      },
      function(context){
        var conditions = context.conditions;
        var animate = conditions.animate && docEl.classList.contains("fx");
        var compactMotion = window.matchMedia("(max-width: 860px)").matches || window.matchMedia("(pointer:coarse)").matches;
        if (!animate) return;

        var lenis = null;
        if (!compactMotion && typeof Lenis !== "undefined"){
          lenis = new Lenis({ lerp: 0.09, duration: 1.2, smoothWheel: true, wheelMultiplier: 1, touchMultiplier: 1.5 });
          smoothScroller = lenis;
          lenis.on("scroll", ScrollTrigger.update);
          gsap.ticker.add(function(time){ lenis.raf(time * 1000); });
          gsap.ticker.lagSmoothing(0);
        }

        /* ---- restrained editorial reveals ----
           Section heads and card grids settle up when scrolled to. This is
           the "Settle" neutral. The named motions (Act 0, reveal, write-in,
           strike, spread) are driven by the vanilla layer above so they work
           identically without the CDN; GSAP only adds the quiet settle. */

        /* Section heads (outside the hero/reveal). */
        document.querySelectorAll(".band .head-block").forEach(function(hb){
          var children = hb.children;
          if (!children.length) return;
          gsap.from(children, {
            y: 24, opacity: 0, stagger: 0.08, duration: 0.85,
            ease: "power3.out",
            scrollTrigger: { trigger: hb, start: "top 82%", toggleActions: "play none none none" }
          });
        });

        /* Card grids: quiet staggered settle. */
        [".tiers .tier", ".bonus-grid .bonus", ".aud", ".steps .step",
         ".doctrine .doc-panel", ".fmt .card", ".trust-foot .rfield",
         ".fact-rail li"].forEach(function(sel){
          var nodes = document.querySelectorAll(sel);
          if (!nodes.length) return;
          ScrollTrigger.batch(nodes, {
            start: "top 88%",
            onEnter: function(batch){
              gsap.from(batch, { y: 26, opacity: 0, stagger: 0.08, duration: 0.8, ease: "power3.out", overwrite: true });
            }
          });
        });

        /* The moment callout: the one quiet image-scale on the page. */
        var callout = document.querySelector(".moment-callout");
        if (callout){
          gsap.from(callout, {
            opacity: 0, y: 20, duration: 1.1, ease: "power3.out",
            scrollTrigger: { trigger: callout, start: "top 80%", toggleActions: "play none none none" }
          });
        }

        /* FAQ rows. */
        var faqDetails = document.querySelectorAll(".faq details");
        if (faqDetails.length){
          gsap.from(faqDetails, {
            y: 16, opacity: 0, stagger: 0.06, duration: 0.6, ease: "power2.out",
            scrollTrigger: { trigger: ".faq", start: "top 82%", toggleActions: "play none none none" }
          });
        }

        /* Final CTA. */
        var finalCta = document.getElementById("final-cta");
        if (finalCta){
          gsap.from("#final-cta .h-lg", {
            y: 26, opacity: 0, duration: 0.85, ease: "power3.out",
            scrollTrigger: { trigger: finalCta, start: "top 78%", toggleActions: "play none none none" }
          });
        }

        return function(){ if (lenis){ lenis.destroy(); lenis = null; } };
      }
    );
  }

  /* ============================================================
     4. LIGHTBOX — works on every .pg (spread + overlay). Not scroll-
     dependent; deliberately outside the GSAP branch.
     ============================================================ */
  var lb = document.getElementById("lb"),
      lbImg = document.getElementById("lbImg"),
      lbCap = document.getElementById("lbCap"),
      lbClose = document.getElementById("lbClose"),
      lastFocus = null;

  function openLb(src, cap){
    lastFocus = document.activeElement;
    var safeSrc = String(src || "");
    if (safeSrc.indexOf("assets/") === 0) {
      lbImg.setAttribute("src", safeSrc);
    }
    lbImg.alt = cap; lbCap.textContent = cap;
    lb.hidden = false; lb.classList.add("on");
    document.body.style.overflow = "hidden";
    lbClose.focus();
    track("product_preview_open", {page: cap});
  }
  function closeLb(){
    lb.classList.remove("on"); lb.hidden = true;
    document.body.style.overflow = "";
    lbImg.src = "assets/cover.webp"; lbImg.alt = "Product page preview";
    if (lastFocus) lastFocus.focus();
  }
  document.querySelectorAll(".pg").forEach(function(btn){
    btn.addEventListener("click", function(){
      openLb(btn.getAttribute("data-full"), btn.getAttribute("data-cap"));
    });
  });
  if (lbClose) lbClose.addEventListener("click", closeLb);
  if (lb) lb.addEventListener("click", function(e){ if (e.target === lb) closeLb(); });
  document.addEventListener("keydown", function(e){
    if (!lb || !lb.classList.contains("on")) return;
    if (e.key === "Escape") closeLb();
    if (e.key === "Tab"){
      e.preventDefault();
      lbClose.focus();
    }
  });

  /* ============================================================
     5. STICKY MOBILE CTA — hidden through Act 0 and the reveal; shows
     only after the hero (reveal) is scrolled past. Unchanged logic.
     ============================================================ */
  var sticky = document.getElementById("sticky"),
      pricing = document.getElementById("pricing"),
      heroEl = document.querySelector(".hero"),
      finalCtaEl = document.getElementById("final-cta"),
      footer = document.querySelector(".ftr"),
      stickyQueued = false;

  function isVisible(el){
    if (!el) return false;
    var rect = el.getBoundingClientRect();
    return rect.top < window.innerHeight && rect.bottom > 0;
  }

  function updateSticky(){
    if (!heroEl || !sticky) return;
    var heroPassed = heroEl.getBoundingClientRect().bottom <= 120,
        blocked = isVisible(pricing) || isVisible(finalCtaEl) || isVisible(footer);
    sticky.classList.toggle("on", heroPassed && !blocked);
  }

  function queueStickyUpdate(){
    if (stickyQueued) return;
    stickyQueued = true;
    requestAnimationFrame(function(){
      stickyQueued = false;
      updateSticky();
    });
  }

  window.addEventListener("scroll", queueStickyUpdate, {passive:true});
  window.addEventListener("resize", queueStickyUpdate);
  updateSticky();

  /* ============================================================
     6. GAP CHECK LEAD CAPTURE (unchanged)
     ============================================================ */
  var FB_LEAD = {
    mode: "api",
    apiEndpoint: "/api/gap-check-subscribe",
    leadEndpoint: "https://assets.mailerlite.com/jsonp/2202141/forms/194226651000735158/subscribe",
    supportEmail: "info@familyfindersbook.com"
  };

  var form = document.getElementById("gapForm");
  if (form){
    var msg    = document.getElementById("gapMsg");
    var submit = document.getElementById("gapSubmit");
    var busy   = false;

    function say(state, text){
      if (!msg) return;
      msg.hidden = false;
      msg.setAttribute("data-state", state);
      msg.textContent = text;
    }

    form.addEventListener("submit", function(ev){
      ev.preventDefault();
      if (busy) return;

      var hp = form.querySelector('input[name="company_website"]');
      if (hp && hp.value) return;

      var emailEl = form.querySelector('input[name="fields[email]"]');
      var nameEl  = form.querySelector('input[name="fields[name]"]');
      var email   = (emailEl && emailEl.value || "").trim();

      if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)){
        say("err", "Please enter an email address we can send the checklist to.");
        if (emailEl) emailEl.focus();
        return;
      }

      var useApi = FB_LEAD.mode === "api";
      var endpoint = useApi ? FB_LEAD.apiEndpoint : FB_LEAD.leadEndpoint;

      if (!endpoint){
        say("err", "The signup form is not connected yet. Email " + FB_LEAD.supportEmail + " and we will send the Gap Check directly.");
        track("lead_submit_unconfigured", {offer:"gap-check", mode:FB_LEAD.mode});
        return;
      }

      busy = true;
      if (submit){ submit.disabled = true; submit.textContent = "Sending…"; }
      say("ok", "Sending your checklist…");

      var req;
      if (useApi){
        req = fetch(endpoint, {
          method: "POST",
          headers: {"Content-Type":"application/json"},
          body: JSON.stringify({
            email: email,
            name: (nameEl && nameEl.value.trim()) || "",
            company_website: (hp && hp.value) || ""
          })
        });
      } else {
        var body = new URLSearchParams();
        body.set("fields[email]", email);
        if (nameEl && nameEl.value.trim()) body.set("fields[name]", nameEl.value.trim());
        body.set("ml-submit", "1");
        body.set("anticsrf", "true");
        req = fetch(endpoint, {
          method: "POST",
          headers: {"Content-Type":"application/x-www-form-urlencoded"},
          body: body.toString()
        });
      }

      req
      .then(function(r){
        return r.json().catch(function(){ return {ok:r.ok, success:r.ok}; });
      })
      .then(function(data){
        var good = data && (data.ok || data.success);
        if (good){
          track("lead_submit", Object.assign({offer:"gap-check", value:0, currency:"USD"}, attribution()));
          form.querySelectorAll("input").forEach(function(i){ i.value = ""; });

          if (data.token){
            var dl = document.createElement("a");
            dl.href = "/api/gap-check-download?token=" + encodeURIComponent(data.token);
            dl.className = "btn btn-primary gap-download-btn";
            dl.textContent = "Download your Gap Check (PDF)";
            dl.setAttribute("download", "Family-Readiness-Gap-Check.pdf");
            if (msg){
              msg.hidden = false;
              msg.setAttribute("data-state", "ok");
              msg.textContent = "";
              msg.appendChild(dl);
              msg.appendChild(document.createTextNode(" Check your inbox — a confirmation link is also on its way."));
            }
          } else {
            say("ok", "Check your inbox for a confirmation link. Your Gap Check arrives right after you confirm.");
          }
        } else {
          say("err", (data && data.message) || ("That did not go through. Email " + FB_LEAD.supportEmail + " and we will send it to you directly."));
          track("lead_submit_error", {offer:"gap-check", reason:(data && data.error) || "rejected"});
        }
      })
      .catch(function(){
        say("err", "That did not go through. Email " + FB_LEAD.supportEmail + " and we will send it to you directly.");
        track("lead_submit_error", {offer:"gap-check", reason:"network"});
      })
      .finally(function(){
        busy = false;
        if (submit){ submit.disabled = false; submit.textContent = "Send me the Gap Check"; }
      });
    });

    /* Fire once when the section is actually seen, for funnel maths. */
    (function(){
      var gapEl = document.getElementById("gap-check");
      if (!gapEl) return;
      function fireOnce(){ track("lead_form_view", {offer:"gap-check"}); }
      if (hasGSAP && typeof ScrollTrigger !== "undefined"){
        ScrollTrigger.create({ trigger: "#gap-check", start: "top 65%", once: true, onEnter: fireOnce });
      } else if ("IntersectionObserver" in window){
        var gio = new IntersectionObserver(function(entries){
          entries.forEach(function(entry){
            if (!entry.isIntersecting) return;
            fireOnce();
            gio.disconnect();
          });
        }, { threshold: 0.35 });
        gio.observe(gapEl);
      } else {
        fireOnce();
      }
    })();
  }
})();
