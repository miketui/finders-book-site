/* ============================================================
   THE FINDER'S BOOK — CONTACT & FEEDBACK

   Posts to /api/contact, the site's own serverless route, for the
   same reasons the Gap Check form posts to /api/gap-check-subscribe:
   the MailerLite key stays server-side, and the honeypot and rate
   limit live where devtools cannot reach them.

   This replaces an earlier client-side MailerLite JSONP stub that
   was never wired up (ML_FORM and all three group IDs were blank,
   so every submission fell through to the support address). That
   approach could not have worked regardless: the site CSP allows
   connect-src 'self' and connect.mailerlite.com, but NOT
   assets.mailerlite.com, where the JSONP endpoint lives.

   ROUTING RULE (unchanged)
   Contact and feedback must NOT land in the Leads group. Someone
   asking where their download is should never be dropped into the
   Gap Check nurture sequence. Each message kind gets its own group
   and its own event. The routing now lives in api/contact.js.

   No manual setup remains. Groups, fields, and the route all exist.
   ============================================================ */
(function () {
  "use strict";

  var form = document.getElementById("contactForm");
  if (!form) return;

  /* ---- configuration ---- */
  var ENDPOINT = "/api/contact";
  var SUPPORT  = "info@michaeldavidjr.beauty";

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

    /* Honeypot */
    var hp = form.querySelector('input[name="company_website"]');
    if (hp && hp.value) return;

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
    if (submit) { submit.disabled = true; submit.textContent = "Sending…"; }
    say("ok", "Sending…");

    fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name,
        email: email,
        message: body,
        kind: kind,
        company_website: (hp && hp.value) || ""
      })
    })
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
    .catch(function () {
      say("err", "That did not go through. Email " + SUPPORT + " and we will pick it up there.");
      track("contact_submit_error", { kind: kind, reason: "network" });
    })
    .finally(function () {
      busy = false;
      if (submit) { submit.disabled = false; submit.textContent = "Send message"; }
    });
  });
})();
