/* ============================================================
   THE FINDER'S BOOK — MOTION & INTERACTIONS
   Scroll reveals, hero choreography, lightbox, sticky CTA,
   and Gap Check lead capture form.
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

  var reduced = false;
  try{ reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; }catch(e){}
  var animate = document.documentElement.classList.contains("fx") && !reduced;

  /* ============================================================
     1. MOTION CHOREOGRAPHY
     ============================================================ */
  function stagger(nodes, step, base){
    Array.prototype.forEach.call(nodes, function(el, i){
      el.style.setProperty("--fx-d", ((base||0) + i*step) + "ms");
    });
  }

  if (animate){
    /* ---- Hero: one orchestrated wave, resolved by 620ms ----
       The primary CTA sits in the 180ms slot. It is never the last
       thing to arrive and it is clickable the entire time. */
    var hero = document.querySelector(".hero");
    if (hero){
      var wave = [
        [".eyebrow",   0],
        ["h1",        70],
        [".lede",    140],
        [".btn-row", 180],
        [".btn-note",260]
      ];
      wave.forEach(function(pair){
        var el = hero.querySelector(pair[0]);
        if (el){ el.classList.add("fx-up"); el.style.setProperty("--fx-d", pair[1]+"ms"); }
      });

      /* The snapshot panel, then its four ruled fields filling in
         left to right the way a hand would fill them. */
      var snap = hero.querySelector(".snap");
      if (snap){ snap.classList.add("fx-up"); snap.style.setProperty("--fx-d","150ms"); }
      var fields = hero.querySelectorAll(".rfield");
      stagger(fields, 90, 380);
      Array.prototype.forEach.call(fields, function(el){
        el.classList.add("fx-on"); // hero fields animate via transition on load
      });
      requestAnimationFrame(function(){
        requestAnimationFrame(function(){
          Array.prototype.forEach.call(fields, function(el){ el.classList.add("fx-on"); });
        });
      });
    }

    /* ---- Scroll reveals ---- */
    var io = null;
    if ("IntersectionObserver" in window){
      io = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if (!entry.isIntersecting) return;
          entry.target.classList.add("fx-on");
          io.unobserve(entry.target);
        });
      }, {rootMargin:"0px 0px -12% 0px", threshold:0.08});
    }

    function reveal(el, delay){
      if (!el) return;
      if (delay) el.style.setProperty("--fx-d", delay+"ms");
      el.classList.add("fx-up");
      if (io) io.observe(el); else el.classList.add("fx-on");
    }

    /* Section headers outside the hero */
    document.querySelectorAll(".band .head-block").forEach(function(hb){
      if (hero && hero.contains(hb)) return;
      Array.prototype.forEach.call(hb.children, function(child, i){
        reveal(child, i*70);
      });
      var eb = hb.querySelector(".eyebrow");
      if (eb && io) io.observe(eb); // draws its own gold rule
    });

    /* Repeating card grids, staggered by position within the grid */
    [".gallery .pg", ".tiers .tier", ".bonus-grid .card", ".aud"].forEach(function(sel){
      var nodes = document.querySelectorAll(sel);
      Array.prototype.forEach.call(nodes, function(el, i){
        reveal(el, (i % 3) * 80);
      });
    });
  }

  /* ============================================================
     2. LIGHTBOX
     ============================================================ */
  var lb = document.getElementById("lb"),
      lbImg = document.getElementById("lbImg"),
      lbCap = document.getElementById("lbCap"),
      lbClose = document.getElementById("lbClose"),
      lastFocus = null;

  function openLb(src, cap){
    lastFocus = document.activeElement;
    /* Only allow relative asset paths — block javascript: and data: URIs */
    if (/^(assets\/|\.?\/)/.test(src) && !/^javascript:/i.test(src)){
      lbImg.src = src;
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
     3. STICKY MOBILE CTA
     ============================================================ */
  var sticky = document.getElementById("sticky"),
      pricing = document.getElementById("pricing"),
      heroEl = document.querySelector(".hero"),
      finalCta = document.getElementById("final-cta"),
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
        blocked = isVisible(pricing) || isVisible(finalCta) || isVisible(footer);
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
     4. GAP CHECK LEAD CAPTURE
     ============================================================ */
  var FB_LEAD = {
    mode: "api",
    apiEndpoint: "/api/subscribe",
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
          say("ok", "Check your inbox for a confirmation link. Your Gap Check arrives right after you confirm.");
          track("lead_submit", Object.assign({offer:"gap-check", value:0, currency:"USD"}, attribution()));
          form.querySelectorAll("input").forEach(function(i){ i.value = ""; });
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
    if ("IntersectionObserver" in window){
      var seen = false;
      var gio = new IntersectionObserver(function(en){
        en.forEach(function(e){
          if (e.isIntersecting && !seen){
            seen = true;
            track("lead_form_view", {offer:"gap-check"});
            gio.disconnect();
          }
        });
      }, {threshold:0.35});
      var gapSection = document.getElementById("gap-check");
      if (gapSection) gio.observe(gapSection);
    }
  }
})();
