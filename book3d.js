/* ============================================================
   THE FINDER'S BOOK — 3D BOOK
   Poster first. Model second. Never in the critical path.

   BUDGET (honest accounting)
     <model-viewer> module   ~150 kB gzipped, loaded from a local
                             copy in assets/vendor/ — no CDN, no
                             third-party origin, no CSP surprise
     book.glb                target <= 900 kB with baked textures
     DRACO decoder           NOT USED. At this model's complexity
                             (a rectangular solid, three texture
                             maps) DRACO's own >100 kB decoder
                             costs more than it saves. Geometry is
                             quantised at export instead.

   LOAD RULE
     assets/book-poster.webp renders immediately and is the LCP
     candidate. The module is imported only when the container is
     within 400px of the viewport, and the model itself is only
     revealed on interaction. If anything fails — no WebGL, blocked
     script, slow network — the poster simply stays. The visitor
     never sees an error state.
   ============================================================ */
(function () {
  "use strict";

  var host = document.querySelector("[data-book3d]");
  if (!host) return;

  /* Respect data-saver and very low-end devices: poster only. */
  var conn = navigator.connection || {};
  if (conn.saveData === true) return;
  if (typeof conn.effectiveType === "string" && /(^|-)2g$/.test(conn.effectiveType)) return;

  /* No WebGL, no 3D. Fail silently to the poster. */
  function hasWebGL() {
    try {
      var c = document.createElement("canvas");
      return !!(window.WebGLRenderingContext &&
                (c.getContext("webgl") || c.getContext("experimental-webgl")));
    } catch (e) { return false; }
  }
  if (!hasWebGL()) return;

  var reduced = false;
  try { reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) {}

  function track(name, params) {
    if (typeof window.fbTrack === "function") window.fbTrack(name, params);
  }

  var loaded = false;

  function mount() {
    if (loaded) return;
    loaded = true;

    import("./assets/vendor/model-viewer.min.js")
      .then(function () {
        var mv = document.createElement("model-viewer");
        mv.setAttribute("src", host.getAttribute("data-src"));
        mv.setAttribute("alt", host.getAttribute("data-alt") ||
          "A three-dimensional view of The Finder's Book that you can rotate.");
        mv.setAttribute("camera-controls", "");
        mv.setAttribute("touch-action", "pan-y");   /* page scroll still wins on mobile */
        mv.setAttribute("interaction-prompt", "none");
        mv.setAttribute("shadow-intensity", "1");
        mv.setAttribute("shadow-softness", "0.9");
        mv.setAttribute("exposure", "0.95");
        mv.setAttribute("environment-image", "neutral");
        mv.setAttribute("min-camera-orbit", "auto auto auto");
        mv.setAttribute("max-camera-orbit", "auto auto auto");
        mv.setAttribute("disable-zoom", "");
        mv.setAttribute("loading", "lazy");

        /* Auto-rotate is motion the visitor did not ask for.
           Manual rotation is motion they initiate, so it stays
           available either way. */
        if (!reduced) {
          mv.setAttribute("auto-rotate", "");
          mv.setAttribute("auto-rotate-delay", "2600");
          mv.setAttribute("rotation-per-second", "12deg");
        }

        mv.addEventListener("load", function () {
          host.classList.add("live");
          host.style.willChange = "transform";
          track("book3d_ready", {});
        }, { once: true });

        mv.addEventListener("error", function () {
          /* Poster stays. Nothing visible changes. */
          host.classList.remove("live");
          host.style.willChange = "";
        }, { once: true });

        var seenInteraction = false;
        ["pointerdown", "keydown", "touchstart"].forEach(function (ev) {
          mv.addEventListener(ev, function () {
            host.classList.add("touched");
            if (!seenInteraction) {
              seenInteraction = true;
              track("book3d_interact", {});
            }
          }, { passive: true });
        });

        /* Release the compositing hint once the visitor moves on. */
        if ("IntersectionObserver" in window) {
          new IntersectionObserver(function (entries) {
            entries.forEach(function (e) {
              host.style.willChange = e.isIntersecting ? "transform" : "";
            });
          }, { threshold: 0 }).observe(host);
        }

        host.appendChild(mv);
      })
      .catch(function () {
        /* Module missing or blocked. Poster stays. Silent. */
        loaded = false;
      });
  }

  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { io.disconnect(); mount(); }
      });
    }, { rootMargin: "400px 0px" });
    io.observe(host);
  } else {
    window.addEventListener("load", mount);
  }

  /* A deliberate tap on the poster loads it immediately. */
  host.addEventListener("click", mount, { once: true });
})();
