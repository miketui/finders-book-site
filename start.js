/* ============================================================
   THE FINDER'S BOOK — /start orientation
   One-step-at-a-time on small screens; sequential on every width.
   Without JS, every step stays visible.
   ============================================================ */
(function () {
  "use strict";

  var wizard = document.querySelector("[data-start-wizard]");
  if (!wizard) return;

  var steps = Array.prototype.slice.call(wizard.querySelectorAll("[data-start-step]"));
  var dots = Array.prototype.slice.call(wizard.querySelectorAll("[data-start-goto]"));
  var prev = wizard.querySelector("[data-start-prev]");
  var next = wizard.querySelector("[data-start-next]");
  var label = document.getElementById("startProgressLabel");
  var total = steps.length;
  var current = 1;
  var reduced = false;
  try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  function track(name, params) {
    if (typeof window.fbTrack === "function") window.fbTrack(name, params);
  }

  function show(n) {
    if (n < 1) n = 1;
    if (n > total) n = total;
    current = n;
    steps.forEach(function (step) {
      var id = Number(step.getAttribute("data-start-step"));
      var on = id === current;
      step.hidden = !on;
      step.classList.toggle("is-on", on);
    });
    dots.forEach(function (dot) {
      var id = Number(dot.getAttribute("data-start-goto"));
      if (id === current) dot.setAttribute("aria-current", "step");
      else dot.removeAttribute("aria-current");
    });
    if (label) label.textContent = "Step " + current + " of " + total;
    if (prev) prev.disabled = current === 1;
    if (next) {
      next.hidden = current === total;
      next.textContent = current === total ? "Done" : "Next step";
    }
    if (!reduced && wizard.scrollIntoView) {
      try { wizard.scrollIntoView({ block: "start", behavior: "smooth" }); }
      catch (e) { wizard.scrollIntoView(true); }
    }
    track("start_step_view", { step: current });
  }

  wizard.classList.add("is-stepped");
  show(1);

  if (prev) {
    prev.addEventListener("click", function () { show(current - 1); });
  }
  if (next) {
    next.addEventListener("click", function () { show(current + 1); });
  }
  dots.forEach(function (dot) {
    dot.addEventListener("click", function () {
      show(Number(dot.getAttribute("data-start-goto")));
    });
  });

  function copied(status, ok) {
    if (!status) return;
    status.textContent = ok ? "Copied." : "Select the script and copy it yourself.";
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () { return false; });
    }
    return new Promise(function (resolve) {
      try {
        var area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.left = "-9999px";
        document.body.appendChild(area);
        area.select();
        var ok = document.execCommand("copy");
        document.body.removeChild(area);
        resolve(!!ok);
      } catch (e) {
        resolve(false);
      }
    });
  }

  Array.prototype.forEach.call(document.querySelectorAll("[data-copy]"), function (btn) {
    btn.addEventListener("click", function () {
      var sel = btn.getAttribute("data-copy");
      var node = sel ? document.querySelector(sel) : null;
      var status = document.querySelector(btn.getAttribute("data-copy-status") || "");
      var text = node ? (node.innerText || node.textContent || "").replace(/\s+\n/g, "\n").trim() : "";
      if (!text) { copied(status, false); return; }
      copyText(text).then(function (ok) {
        copied(status, ok);
        track("handoff_script_copy", { ok: ok ? "1" : "0" });
      });
    });
  });
})();
