/* ============================================================
   THE FINDER'S BOOK — CONTACT & FEEDBACK

   Posts only to the site's same-origin /api/contact route.
   A support message is not a marketing opt-in: the server validates the
   message and routes it directly to the configured owner-notification
   endpoint. It does not create a MailerLite subscriber or contact-group
   membership. If owner routing is unavailable, the API returns an error and
   this client shows the support-email fallback rather than claiming success.
   ============================================================ */
(function () {
  "use strict";

  var form = document.getElementById("contactForm");
  if (!form) return;

  /* ---- configuration ---- */
  var ENDPOINT = "/api/contact";
  var SUPPORT  = "info@familyfindersbook.com";
  var REQUEST_TIMEOUT_MS = 12000;

  var out    = document.getElementById("cfMsgOut");
  var submit = document.getElementById("cfSubmit");
  var busy   = false;

  function track(name, params) {
    if (typeof window.fbTrack === "function") window.fbTrack(name, params);
  }
  function attribution() {
    if (typeof window.fbAttribution === "function") return window.fbAttribution();
    return {};
  }

  function say(state, text) {
    if (!out) return;
    out.hidden = false;
    out.setAttribute("data-state", state);
    out.textContent = text;
  }

  function fieldError(el, text) {
    say("err", text);
    if (el) { el.setAttribute("aria-invalid", "true"); el.focus(); }
  }
  function clearErrors() {
    Array.prototype.forEach.call(
      form.querySelectorAll("[aria-invalid]"),
      function (el) { el.removeAttribute("aria-invalid"); }
    );
  }

  /* Fires once when the form is genuinely seen, for funnel maths. */
  if ("IntersectionObserver" in window) {
    var seen = false;
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting && !seen) {
          seen = true;
          track("contact_form_view", {});
          cio.disconnect();
        }
      });
    }, { threshold: 0.35 });
    cio.observe(form);
  }

  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (busy) return;
    clearErrors();

    /* Honeypot. Password managers and browser autofill occasionally populate
       hidden text fields despite autocomplete=off. Never turn that into a silent
       no-op for a real visitor: clear the client-side value and continue. Direct
       bot POSTs are still rejected by the server-side honeypot and rate limit. */
    var hp = form.querySelector('input[name="company_website"]');
    if (hp && hp.value) {
      track("contact_honeypot_autofill_recovered", {});
      hp.value = "";
    }

    var nameEl  = form.querySelector('input[name="name"]');
    var emailEl = form.querySelector('input[name="email"]');
    var msgEl   = form.querySelector('textarea[name="message"]');
    var kindEl  = form.querySelector('input[name="kind"]:checked');

    var name  = (nameEl  && nameEl.value  || "").trim();
    var email = (emailEl && emailEl.value || "").trim();
    var body  = (msgEl   && msgEl.value   || "").trim();
    var kind  = (kindEl  && kindEl.value) || "question";

    if (!name) {
      return fieldError(nameEl, "Please add a name so we know who we are replying to.");
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
      return fieldError(emailEl, "Please enter an email address we can reply to.");
    }
    if (body.length < 10) {
      return fieldError(msgEl, "Please add a little more detail so we can actually help.");
    }

    busy = true;
    if (submit) {
      submit.disabled = true;
      submit.setAttribute("aria-busy", "true");
      submit.textContent = "Sending…";
    }
    say("ok", "Sending…");

    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timer = controller ? window.setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS) : null;
    var request = {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name,
        email: email,
        message: body,
        kind: kind,
        company_website: (hp && hp.value) || ""
      })
    };
    if (controller) request.signal = controller.signal;

    fetch(ENDPOINT, request)
    .then(function (r) {
      return r.json().catch(function () { return { ok: r.ok }; });
    })
    .then(function (data) {
      if (data && data.ok) {
        say("ok", "Message received. A person will reply to " + email + ".");
        track(kind === "feedback" ? "feedback_submit" : "contact_submit",
              Object.assign({ kind: kind }, attribution()));
        form.reset();
      } else {
        say("err", (data && data.message) ||
            ("That did not go through. Email " + SUPPORT + " and we will pick it up there."));
        track("contact_submit_error", { kind: kind, reason: (data && data.error) || "rejected" });
      }
    })
    .catch(function (err) {
      var timedOut = err && err.name === "AbortError";
      say("err", timedOut
        ? ("That took too long. Please try once more, or email " + SUPPORT + ".")
        : ("That did not go through. Email " + SUPPORT + " and we will pick it up there."));
      track("contact_submit_error", { kind: kind, reason: timedOut ? "timeout" : "network" });
    })
    .finally(function () {
      if (timer) window.clearTimeout(timer);
      busy = false;
      if (submit) {
        submit.disabled = false;
        submit.removeAttribute("aria-busy");
        submit.textContent = "Send message";
      }
    });
  });
})();
