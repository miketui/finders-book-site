/* ============================================================
   THE FINDER'S BOOK — /gift
   Copyable forward notes and an in-page printable card face.
   Templates stay on the device. Nothing is posted or mailed from here.
   ============================================================ */
(function () {
  "use strict";

  function track(name, params) {
    if (typeof window.fbTrack === "function") window.fbTrack(name, params);
  }

  var recipient = document.getElementById("giftRecipient");
  var giver = document.getElementById("giftGiver");
  var download = document.getElementById("giftLink");
  var essentials = document.getElementById("giftEmailEssentials");
  var ultimate = document.getElementById("giftEmailUltimate");

  function filled(value, fallback) {
    var text = value ? String(value).replace(/\s+/g, " ").trim() : "";
    return text || fallback;
  }

  function essentialsBody() {
    return [
      filled(recipient && recipient.value, "[Recipient's name]") + ",",
      "",
      "I bought you The Finder's Book Essentials so there would be one clear place to start.",
      "",
      "It is the 49-page first-hours organizer (pages 001–049) — who to call, where records live. Fillable and printable. Instant download. One-time.",
      "",
      "It is a pointer, not a vault. Not a will. No passwords belong in the book.",
      "",
      "Your files: " + filled(download && download.value, "[paste the Payhip download link here]"),
      "",
      "Start together on the Continuity Snapshot — fifteen minutes. Open page 2.",
      "",
      "After you have the files: https://www.familyfindersbook.com/start.html",
      "",
      "— " + filled(giver && giver.value, "[Your name]")
    ].join("\n");
  }

  function ultimateBody() {
    return [
      filled(recipient && recipient.value, "[Recipient's name]") + ",",
      "",
      "I bought you The Finder's Book Ultimate so your household would have the 250-page full system in one place.",
      "",
      "Instant download. One-time. Start together on the Continuity Snapshot — fifteen minutes. Open page 2.",
      "",
      "It is a pointer, not a vault. Not a will. No passwords belong in the book.",
      "",
      "Your files: " + filled(download && download.value, "[paste the Payhip download link here]"),
      "",
      "After you have the files: https://www.familyfindersbook.com/start.html",
      "",
      "— " + filled(giver && giver.value, "[Your name]")
    ].join("\n");
  }

  function render() {
    if (essentials) essentials.textContent = essentialsBody();
    if (ultimate) ultimate.textContent = ultimateBody();
  }

  render();
  [recipient, giver, download].forEach(function (field) {
    if (!field) return;
    field.addEventListener("input", render);
    field.addEventListener("change", render);
  });

  function copied(status, ok) {
    if (!status) return;
    status.textContent = ok ? "Copied" : "Select the note and copy it yourself.";
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
      render();
      var sel = btn.getAttribute("data-copy");
      var node = sel ? document.querySelector(sel) : null;
      var status = document.querySelector(btn.getAttribute("data-copy-status") || "");
      var text = node ? (node.innerText || node.textContent || "").replace(/\s+\n/g, "\n").trim() : "";
      if (!text) { copied(status, false); return; }
      copyText(text).then(function (ok) {
        copied(status, ok);
        track("gift_email_copy", {
          ok: ok ? "1" : "0",
          version: sel && sel.indexOf("Ultimate") !== -1 ? "ultimate" : "essentials"
        });
      });
    });
  });

  var printBtn = document.querySelector("[data-print-card]");
  if (printBtn) {
    printBtn.addEventListener("click", function () {
      track("gift_card_print", { surface: "gift" });
      document.body.classList.add("gift-printing");
      window.print();
      window.setTimeout(function () {
        document.body.classList.remove("gift-printing");
      }, 300);
    });
  }
})();
