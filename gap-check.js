/**
 * On-page Family Readiness Gap Check — scored product.
 * Email is optional and never required to see the score.
 * MailerLite campaign sends stay held unless the API is explicitly enabled.
 */
(function () {
  "use strict";

  var SUPPORT = "info@familyfindersbook.com";
  var YES = "Yes — we could find this tonight";
  var NO = "No — not tonight";
  var BONUS_LEAK = /fridge card|vault setup|check-in plan|handoff scripts|digital legacy/i;

  var BANDS = [
    { max: 3, text: "Most of the first-hour basics are still in someone’s head. A short first pass would change that." },
    { max: 7, text: "Some pieces are findable. The gaps are usually people, locations, or access — not more paperwork." },
    { max: 10, text: "You are ahead of most households. Fill the remaining blanks while it is still calm." },
    { max: 12, text: "The map is largely in place. Review it after the next big life change." }
  ];

  function track(name, params) {
    if (typeof window.fbTrack === "function") window.fbTrack(name, params);
  }
  function attribution() {
    if (typeof window.fbAttribution === "function") return window.fbAttribution();
    return {};
  }

  function bandFor(score) {
    for (var i = 0; i < BANDS.length; i++) {
      if (score <= BANDS[i].max) return BANDS[i].text;
    }
    return BANDS[BANDS.length - 1].text;
  }

  function collect(form) {
    var yes = 0;
    var answered = 0;
    for (var i = 1; i <= 12; i++) {
      var picked = form.querySelector('input[name="q' + i + '"]:checked');
      if (!picked) continue;
      answered += 1;
      if (picked.value === "yes") yes += 1;
    }
    return { yes: yes, answered: answered };
  }

  function renderResults(score) {
    var line = document.getElementById("gapScoreLine");
    var band = document.getElementById("gapScoreBand");
    var results = document.getElementById("gapResults");
    if (line) line.textContent = "Your family would find " + score + " of 12 things tonight.";
    if (band) band.textContent = bandFor(score);
    if (results) results.hidden = false;
    var printScore = document.getElementById("gapPrintScore");
    var printBand = document.getElementById("gapPrintBand");
    if (printScore) printScore.textContent = "Your family would find " + score + " of 12 things tonight.";
    if (printBand) printBand.textContent = bandFor(score);
  }

  function bootQuiz() {
    var form = document.getElementById("gapQuiz");
    var progress = document.getElementById("gapProgress");
    if (!form) return;

    function refresh() {
      var state = collect(form);
      if (progress) {
        progress.textContent = state.answered === 12
          ? "All 12 answered."
          : state.answered + " of 12 answered.";
      }
      if (state.answered === 12) {
        renderResults(state.yes);
        track("gap_check_complete", { score: state.yes, offer: "gap-check" });
      }
    }

    form.addEventListener("change", refresh);
  }

  function bootEmail() {
    var form = document.getElementById("gapForm");
    if (!form) return;

    var msg = document.getElementById("gapMsg");
    var submit = document.getElementById("gapSubmit");
    var busy = false;

    function say(state, text) {
      if (!msg) return;
      msg.hidden = false;
      msg.setAttribute("data-state", state);
      msg.textContent = text;
    }

    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      if (busy) return;

      var hp = form.querySelector('input[name="company_website"]');
      if (hp && hp.value) return;

      var emailEl = form.querySelector('input[name="fields[email]"]');
      var nameEl = form.querySelector('input[name="fields[name]"]');
      var email = (emailEl && emailEl.value || "").trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) {
        say("err", "Please enter an email address we can use for the checklist.");
        if (emailEl) emailEl.focus();
        return;
      }

      var quiz = document.getElementById("gapQuiz");
      var state = quiz ? collect(quiz) : { yes: null, answered: 0 };

      busy = true;
      if (submit) { submit.disabled = true; submit.textContent = "Saving…"; }
      say("ok", "Preparing your checklist…");

      fetch("/api/gap-check-subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email,
          name: (nameEl && nameEl.value.trim()) || "",
          company_website: (hp && hp.value) || "",
          score: state.answered === 12 ? state.yes : null
        })
      })
        .then(function (r) { return r.json().catch(function () { return { ok: r.ok }; }); })
        .then(function (data) {
          var good = data && data.ok;
          if (!good) {
            say("err", (data && data.message) || ("That did not go through. Email " + SUPPORT + " and we will send the checklist directly."));
            track("lead_submit_error", { offer: "gap-check", reason: (data && data.error) || "rejected" });
            return;
          }

          track("lead_submit", Object.assign({ offer: "gap-check", value: 0, currency: "USD", held: !!data.held }, attribution()));
          form.querySelectorAll("input").forEach(function (i) { i.value = ""; });

          if (msg) {
            msg.hidden = false;
            msg.setAttribute("data-state", "ok");
            msg.textContent = "";
            if (data.token) {
              var dl = document.createElement("a");
              dl.href = "/api/gap-check-download?token=" + encodeURIComponent(data.token);
              dl.className = "btn btn-primary gap-download-btn";
              dl.textContent = "Download the 1-page checklist (PDF)";
              dl.setAttribute("download", "Family-Readiness-Gap-Check.pdf");
              msg.appendChild(dl);
            }
            var note = document.createElement("span");
            note.textContent = data.held
              ? " Your checklist is ready. We have not added you to any mailing list yet — email delivery is held."
              : " Check your inbox for a confirmation link. The checklist arrives after you confirm.";
            msg.appendChild(note);
          }
        })
        .catch(function () {
          say("err", "That did not go through. Email " + SUPPORT + " and we will send the checklist directly.");
          track("lead_submit_error", { offer: "gap-check", reason: "network" });
        })
        .finally(function () {
          busy = false;
          if (submit) { submit.disabled = false; submit.textContent = "Email me this score + the 1-page checklist"; }
        });
    });
  }

  function bootPrint() {
    var btn = document.getElementById("gapPrintBtn");
    if (!btn) return;
    btn.addEventListener("click", function () {
      document.documentElement.classList.add("gap-printing");
      window.print();
      window.setTimeout(function () {
        document.documentElement.classList.remove("gap-printing");
      }, 400);
    });
  }

  function bootView() {
    var gapEl = document.getElementById("gap-check");
    if (!gapEl) return;
    function fireOnce() { track("lead_form_view", { offer: "gap-check" }); }
    if ("IntersectionObserver" in window) {
      var gio = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          fireOnce();
          gio.disconnect();
        });
      }, { threshold: 0.35 });
      gio.observe(gapEl);
    } else {
      fireOnce();
    }
  }

  if (BONUS_LEAK.test(document.getElementById("gap-check") ? document.getElementById("gap-check").textContent : "")) {
    console.warn("Gap Check copy leaked an Ultimate bonus name — diagnostic only.");
  }

  bootQuiz();
  bootEmail();
  bootPrint();
  bootView();
})();
