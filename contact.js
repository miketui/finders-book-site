/* ============================================================
   THE FINDER'S BOOK — CONTACT & FEEDBACK

   GATE 2 decision: MailerLite, not a new vendor and not a new
   route in api/. MailerLite is already the site's data processor,
   already named in privacy-policy.html, and already an allowed
   origin because the Gap Check form uses it. Nothing new enters
   the privacy surface.

   ROUTING RULE (important)
   Contact and feedback must NOT land in the leads group
   (194226608569059081). Someone asking where their download is
   should never be dropped into the Gap Check nurture sequence.
   Each message kind gets its own group and its own event.

   MANUAL SETUP REQUIRED before this works — see docs/CHROME.md:
     1. MailerLite > Subscribers > Groups: create
          "Contact — presale question"
          "Contact — reader feedback"
          "Contact — licensing"
     2. MailerLite > Forms: create one embedded form with fields
          name, email, message, kind
     3. Paste the form's JSONP subscribe endpoint into ML_FORM below
        and the three group IDs into GROUPS.
   Until then the form fails gracefully to the support address.
   ============================================================ */
(function () {
  "use strict";

  var form = document.getElementById("contactForm");
  if (!form) return;

  /* ---- configuration ---- */
  var ML_ACCOUNT   = "2202141";
  var ML_FORM      = "";            /* e.g. "https://assets.mailerlite.com/jsonp/2202141/forms/XXXXXXXXXXXXXXXX/subscribe" */
  var SUPPORT      = "warrenjrmd@gmail.com";
  var GROUPS = {
    question:  "",                  /* Contact — presale question   */
    feedback:  "",                  /* Contact — reader feedback    */
    licensing: ""                   /* Contact — licensing          */
  };

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

  var KIND_LABEL = {
    question:  "question",
    feedback:  "feedback",
    licensing: "licensing"
  };

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

    if (!ML_FORM || !GROUPS[kind]) {
      say("err", "The message form is not connected yet. Email " + SUPPORT + " and a person will reply.");
      track("contact_submit_unconfigured", { kind: kind });
      return;
    }

    busy = true;
    if (submit) { submit.disabled = true; submit.textContent = "Sending\u2026"; }
    say("ok", "Sending\u2026");

    var payload = new URLSearchParams();
    payload.set("fields[email]", email);
    payload.set("fields[name]", name);
    payload.set("fields[message]", body);
    payload.set("fields[kind]", KIND_LABEL[kind] || kind);
    payload.set("groups[]", GROUPS[kind]);
    payload.set("ml-submit", "1");
    payload.set("anticsrf", "true");

    fetch(ML_FORM, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: payload.toString()
    })
    .then(function (r) {
      return r.json().catch(function () { return { ok: r.ok, success: r.ok }; });
    })
    .then(function (data) {
      if (data && (data.ok || data.success)) {
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

  /* Account reference kept for the setup docs. */
  void ML_ACCOUNT;
})();
