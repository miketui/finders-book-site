/* ============================================================
   THE FINDER'S BOOK — MOTION & INTERACTIONS (v4.0 GSAP ELEVATION)
   Powered by GSAP ScrollTrigger + SplitText + Lenis WHERE AVAILABLE,
   with a vanilla IntersectionObserver reveal fallback everywhere else.
   Progressive enhancement: animates only when html.fx is set
   and prefers-reduced-motion is not active.
   Depends on analytics.js exposing window.fbTrack / window.fbAttribution.
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

  /* ---------- Reveal fallback (runs when GSAP is absent) ----------
     GSAP is loaded from a CDN on index.html only. about/order/contact
     share this same file without it. The previous `return` here killed
     the ENTIRE module on those pages -- not just the animations, but the
     lightbox, sticky bar and form handlers 200 lines below -- leaving
     every .fx-up / .fx-scale element stuck at opacity 0 (they are set to
     opacity:0 by styles.css and only made visible by adding .fx-on).
     This restores the original vanilla IntersectionObserver reveal so the
     page is fully readable with or without GSAP, and with or without a
     working CDN. */
  function vanillaReveal(){
    var els = document.querySelectorAll(".fx-up, .fx-fade, .fx-scale, .fx-in, .fx-rule, .rfield, .eyebrow");
    if (!els.length) return;

    var reduced = false;
    try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

    /* No IntersectionObserver, or motion is unwanted: show everything now. */
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
      /* Anything already above the fold reveals immediately rather than
         waiting for a scroll that may never come. */
      var r = el.getBoundingClientRect();
      if (r.top < (window.innerHeight || 0)){
        el.style.setProperty("--fx-d", Math.min(i * 60, 360) + "ms");
        el.classList.add("fx-on");
      } else {
        io.observe(el);
      }
    });
  }

  /* ---------- GSAP setup ---------- */
  var hasGSAP = (typeof gsap !== "undefined" && typeof ScrollTrigger !== "undefined");

  if (!hasGSAP){
    /* No GSAP on this page (or the CDN failed). Reveal content the plain
       way, then fall through -- the lightbox, sticky bar and form handlers
       below are not GSAP-dependent and must still run. */
    vanillaReveal();
  } else {
  gsap.registerPlugin(ScrollTrigger);
  if (typeof SplitText !== "undefined") gsap.registerPlugin(SplitText);

  /* ---------- Progressive enhancement + reduced-motion ----------
     Uses gsap.matchMedia() per SKILL.md best practice.
     All animations live inside the matchMedia handler so they
     are automatically reverted if conditions change. */
  var mm = gsap.matchMedia();

  mm.add(
    {
      animate: "(prefers-reduced-motion: no-preference)",
      reduce:  "(prefers-reduced-motion: reduce)"
    },
    function(context){
      var conditions = context.conditions;
      var animate = conditions.animate && document.documentElement.classList.contains("fx");
      var compactMotion = window.matchMedia("(max-width: 860px)").matches || window.matchMedia("(pointer:coarse)").matches;

      /* ===========================================================
         LENIS SMOOTH SCROLL
         Butter-smooth inertia scrolling that elevates the entire
         page feel. Synced with GSAP's ticker for perfect
         ScrollTrigger compatibility.
         =========================================================== */
      var lenis = null;
      if (animate && !compactMotion && typeof Lenis !== "undefined"){
        lenis = new Lenis({
          lerp: 0.09,
          duration: 1.2,
          smoothWheel: true,
          wheelMultiplier: 1,
          touchMultiplier: 1.5
        });

        /* Sync Lenis with GSAP ticker — per Lenis README integration pattern */
        lenis.on("scroll", ScrollTrigger.update);
        gsap.ticker.add(function(time){
          lenis.raf(time * 1000);
        });
        gsap.ticker.lagSmoothing(0);
      }

      if (!animate){
        /* Reduced motion: ensure all elements are visible, no animation */
        gsap.set(".hero .eyebrow, .hero h1, .hero .lede, .hero .btn-row, .hero .btn-note, .hero .snap", {
          clearProps: "all"
        });
        return; // exit — no animations created
      }

      /* ===========================================================
         1. HERO CHOREOGRAPHY — GSAP TIMELINE
         One orchestrated wave, resolved by ~700ms.
         The CTA is never the last thing to arrive.
         =========================================================== */
      var hero = document.querySelector(".hero");
      if (hero){
        var heroTl = gsap.timeline({
          defaults: { ease: "power3.out", duration: 0.7 }
        });

        /* Staggered entrance of hero text elements */
        heroTl
          .from(".hero .eyebrow", {
            y: 20, opacity: 0, duration: 0.5
          })
          .from(".hero h1", {
            y: 30, opacity: 0, duration: 0.8
          }, "-=0.35")
          .from(".hero .lede", {
            y: 20, opacity: 0, duration: 0.6
          }, "-=0.45")
          .from(".hero .btn-row", {
            y: 16, opacity: 0, duration: 0.5
          }, "-=0.35")
          .from(".hero .btn-note", {
            y: 12, opacity: 0, duration: 0.4
          }, "-=0.25");

        /* SplitText: hero h1 character-by-character reveal
           Adds cinematic text animation per GSAP SplitText SKILL.md.
           Uses autoSplit + onSplit for font-load resilience. */
        if (typeof SplitText !== "undefined"){
          var h1El = hero.querySelector("h1");
          if (h1El){
            SplitText.create(h1El, {
              type: compactMotion ? "words" : "words, chars",
              autoSplit: true,
              onSplit: function(self){
                var units = self.chars && self.chars.length ? self.chars : self.words;
                return gsap.from(units, {
                  opacity: 0,
                  y: compactMotion ? 14 : 24,
                  rotateX: compactMotion ? 0 : -40,
                  stagger: compactMotion ? 0.03 : 0.018,
                  duration: compactMotion ? 0.45 : 0.55,
                  ease: "back.out(1.4)",
                  delay: 0.15
                });
              }
            });
          }
        }

        /* Snapshot card entrance with ruled fields filling in */
        var snap = hero.querySelector(".snap");
        if (snap){
          heroTl.from(snap, {
            y: 40, opacity: 0, scale: 0.97, duration: 0.8,
            ease: "power2.out"
          }, "-=0.5");

          var fields = hero.querySelectorAll(".rfield");
          if (fields.length){
            heroTl.from(fields, {
              y: 12, opacity: 0, stagger: 0.09, duration: 0.45,
              ease: "power2.out"
            }, "-=0.3");
          }
        }

        /* Eyebrow gold rule draws itself */
        var eyebrowAfter = hero.querySelector(".eyebrow");
        if (eyebrowAfter){
          gsap.from(eyebrowAfter, {
            "--rule-scale": 0,
            duration: 0.8,
            ease: "power2.out",
            delay: 0.1
          });
        }
      }

      /* ===========================================================
         2. SCROLL-TRIGGERED SECTION REVEALS (replaces IntersectionObserver)
         Uses ScrollTrigger.batch() per SKILL.md — the GSAP
         replacement for IntersectionObserver with stagger support.
         =========================================================== */

      /* Section headers: staggered children reveal */
      var headBlocks = document.querySelectorAll(".band .head-block");
      headBlocks.forEach(function(hb){
        if (hero && hero.contains(hb)) return;
        var children = hb.children;
        if (children.length){
          gsap.from(children, {
            y: 28, opacity: 0, stagger: 0.08, duration: 0.65,
            ease: "power3.out",
            scrollTrigger: {
              trigger: hb,
              start: "top 85%",
              toggleActions: "play none none none"
            }
          });
        }
      });

      /* Card grids: staggered batch reveal */
      var batchSelectors = [
        ".gallery .pg",
        ".tiers .tier",
        ".bonus-grid .bonus",
        ".aud",
        ".steps .step",
        ".doctrine .doc-panel",
        ".fmt .card"
      ];

      batchSelectors.forEach(function(sel){
        var nodes = document.querySelectorAll(sel);
        if (!nodes.length) return;

        ScrollTrigger.batch(nodes, {
          start: "top 88%",
          onEnter: function(batch){
            gsap.from(batch, {
              y: 30,
              opacity: 0,
              stagger: 0.08,
              duration: 0.6,
              ease: "power3.out",
              overwrite: true
            });
          }
        });
      });

      /* Proof strip: items slide up with stagger */
      var proofItems = document.querySelectorAll(".proof-list li");
      if (proofItems.length){
        gsap.from(proofItems, {
          y: 20, opacity: 0, stagger: 0.1, duration: 0.5,
          ease: "power2.out",
          scrollTrigger: {
            trigger: ".proof-strip",
            start: "top 85%",
            toggleActions: "play none none none"
          }
        });
      }
      var journeyLinks = document.querySelectorAll(".journey-links a");
      if (journeyLinks.length){
        gsap.from(journeyLinks, {
          y: 14, opacity: 0, stagger: 0.05, duration: 0.45,
          ease: "power2.out",
          scrollTrigger: {
            trigger: ".journey-strip",
            start: "top 88%",
            toggleActions: "play none none none"
          }
        });
      }

      /* ===========================================================
         3. PARALLAX + SCROLL-SCRUB EFFECTS
         Adds depth and cinematic feel per ScrollTrigger patterns.
         =========================================================== */

      /* Hero: subtle upward parallax as user scrolls past */
      if (hero){
        gsap.to(".hero", {
          yPercent: compactMotion ? -3 : -8,
          ease: "none",
          scrollTrigger: {
            trigger: ".hero",
            start: "top top",
            end: "bottom top",
            scrub: true
          }
        });

        /* Hero cover image: slow float */
        var heroCover = hero.querySelector(".hero-cover");
        if (heroCover){
          gsap.to(heroCover, {
            y: -15, rotation: 0.5,
            ease: "none",
            scrollTrigger: {
              trigger: ".hero",
              start: "top top",
              end: "bottom top",
              scrub: 1.5
            }
          });
        }
      }

      /* Section band backgrounds: subtle parallax depth */
      if (!compactMotion){
        document.querySelectorAll(".band-pine, .band-deep, .band-sage, .band-hi").forEach(function(band){
          gsap.from(band, {
            backgroundPositionY: "20%",
            ease: "none",
            scrollTrigger: {
              trigger: band,
              start: "top bottom",
              end: "bottom top",
              scrub: true
            }
          });
        });
      }

      /* Bonus images: gentle float on scroll */
      if (!compactMotion){
        document.querySelectorAll(".bonus img").forEach(function(img){
          gsap.to(img, {
            y: -8, rotation: -0.5,
            ease: "none",
            scrollTrigger: {
              trigger: img,
              start: "top bottom",
              end: "bottom top",
              scrub: 2
            }
          });
        });
      }

      /* FAQ: details items reveal with micro-stagger */
      var faqDetails = document.querySelectorAll(".faq details");
      if (faqDetails.length){
        gsap.from(faqDetails, {
          y: 16, opacity: 0, stagger: 0.06, duration: 0.5,
          ease: "power2.out",
          scrollTrigger: {
            trigger: ".faq",
            start: "top 80%",
            toggleActions: "play none none none"
          }
        });
      }

      /* Final CTA: scale-up entrance with emotional weight */
      var finalCta = document.getElementById("final-cta");
      if (finalCta){
        gsap.from("#final-cta .h-lg", {
          scale: 0.92, opacity: 0, y: 30, duration: 0.8,
          ease: "power3.out",
          scrollTrigger: {
            trigger: finalCta,
            start: "top 75%",
            toggleActions: "play none none none"
          }
        });
        gsap.from("#final-cta .btn", {
          y: 20, opacity: 0, duration: 0.6,
          ease: "back.out(1.4)",
          delay: 0.2,
          scrollTrigger: {
            trigger: finalCta,
            start: "top 75%",
            toggleActions: "play none none none"
          }
        });
      }

      /* Gap Check section: card slides in */
      var gapSection = document.getElementById("gap-check");
      if (gapSection){
        gsap.from(".gap-card", {
          x: 40, opacity: 0, duration: 0.7,
          ease: "power3.out",
          scrollTrigger: {
            trigger: gapSection,
            start: "top 75%",
            toggleActions: "play none none none"
          }
        });
      }

      /* ===========================================================
         4. PRICING TIER HOVER ELEVATION
         Interactive micro-animation on hover via GSAP.
         =========================================================== */
      document.querySelectorAll(".tier").forEach(function(tier){
        tier.addEventListener("mouseenter", function(){
          if (compactMotion) return;
          gsap.to(tier, { y: -6, scale: 1.015, duration: 0.3, ease: "power2.out" });
        });
        tier.addEventListener("mouseleave", function(){
          if (compactMotion) return;
          gsap.to(tier, { y: 0, scale: 1, duration: 0.4, ease: "power2.out" });
        });
      });

      /* Cleanup function — called when matchMedia conditions change */
      return function(){
        if (lenis){ lenis.destroy(); lenis = null; }
      };
    }
  );
  } /* end if (hasGSAP) */

  /* ============================================================
     5. LIGHTBOX (unchanged — not scroll-dependent)
     Deliberately OUTSIDE the GSAP branch: this and everything
     below it works without GSAP and must run on every page.
     ============================================================ */
  var lb = document.getElementById("lb"),
      lbImg = document.getElementById("lbImg"),
      lbCap = document.getElementById("lbCap"),
      lbClose = document.getElementById("lbClose"),
      lastFocus = null;

  function openLb(src, cap){
    lastFocus = document.activeElement;
    /* Sanitize: only relative asset paths are allowed as image sources.
       Blocks javascript:, data:, and absolute URLs to prevent DOM XSS. */
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
     6. STICKY MOBILE CTA (unchanged — uses rAF efficiently)
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
     7. GAP CHECK LEAD CAPTURE (unchanged)
     ============================================================ */
  var FB_LEAD = {
    mode: "api",
    apiEndpoint: "/api/gap-check-subscribe",
    leadEndpoint: "https://assets.mailerlite.com/jsonp/2202141/forms/194226651000735158/subscribe",
    supportEmail: "warrenjrmd@gmail.com"
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

      /* Honeypot: a real person never fills this. */
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
      if (submit){ submit.disabled = true; submit.textContent = "Sending\u2026"; }
      say("ok", "Sending your checklist\u2026");

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
            /* Token-gated download: show an immediate download link. */
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
              msg.appendChild(document.createTextNode("\u00a0Check your inbox — a confirmation link is also on its way."));
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

    /* Fire once when the section is actually seen, for funnel maths.
       Uses ScrollTrigger when GSAP is present, and a plain
       IntersectionObserver otherwise, so the lead_form_view event is
       never silently lost just because the CDN did not load. */
    (function(){
      var gapEl = document.getElementById("gap-check");
      if (!gapEl) return;

      function fireOnce(){ track("lead_form_view", {offer:"gap-check"}); }

      if (hasGSAP && typeof ScrollTrigger !== "undefined"){
        ScrollTrigger.create({
          trigger: "#gap-check",
          start: "top 65%",
          once: true,
          onEnter: fireOnce
        });
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
