/* Shared browser helpers. Kept dependency-free so the site also works from a file. */
(() => {
  "use strict";

  const storage = {
    get(key) {
      try { return localStorage.getItem(key); } catch { return null; }
    },
    set(key, value) {
      try { localStorage.setItem(key, String(value)); } catch { /* Saving is optional. */ }
    },
    score(key) {
      const value = Number(this.get(key));
      return Number.isSafeInteger(value) && value >= 0 ? value : 0;
    }
  };

  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function createSound() {
    let context;
    let muted = storage.get("lucas-muted") === "1";
    const listeners = new Set();
    function notify() { listeners.forEach(listener => listener(muted)); }
    window.addEventListener("storage", event => {
      if (event.key === "lucas-muted" || event.key === null) {
        muted = storage.get("lucas-muted") === "1";
        notify();
      }
    });
    return {
      get muted() { return muted; },
      toggle() {
        muted = !muted;
        storage.set("lucas-muted", muted ? "1" : "0");
        notify();
      },
      onChange(listener) { listeners.add(listener); },
      beep(frequency, duration, type = "sine", volume = 0.15, slideTo) {
        if (muted || document.hidden) return;
        try {
          context ||= new (window.AudioContext || window.webkitAudioContext)();
          if (context.state === "suspended") context.resume().catch(() => {});
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = type;
          oscillator.frequency.setValueAtTime(frequency, context.currentTime);
          if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, context.currentTime + duration);
          gain.gain.setValueAtTime(volume, context.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
          oscillator.connect(gain).connect(context.destination);
          oscillator.start();
          oscillator.stop(context.currentTime + duration);
          oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
        } catch { /* Audio support and permission are optional. */ }
      }
    };
  }

  // Coordinates stay in game units; only the backing bitmap follows screen density.
  function prepareCanvas(canvas, width, height) {
    const context = canvas.getContext("2d");
    canvas.style.aspectRatio = `${width} / ${height}`;
    let redraw = () => {};
    function resize() {
      if (!context) return;
      const cssWidth = canvas.getBoundingClientRect().width || width;
      const density = Math.min(window.devicePixelRatio || 1, 2);
      const pixelWidth = Math.round(cssWidth * density);
      const pixelHeight = Math.round(pixelWidth * height / width);
      if (canvas.width === pixelWidth && canvas.height === pixelHeight) return;
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
      context.setTransform(pixelWidth / width, 0, 0, pixelHeight / height, 0, 0);
      redraw();
    }
    resize();
    if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);
    window.addEventListener("resize", resize);
    return { context, onResize(callback) { redraw = callback; } };
  }

  function showCanvasError(canvas) {
    const frame = canvas.closest(".game-frame");
    const overlay = frame.querySelector(".game-overlay");
    overlay.innerHTML = '<div><h3>A quick time-out</h3><p>This browser can’t draw the game. Try opening this page in another browser.</p></div>';
    overlay.hidden = false;
    frame.querySelectorAll("button").forEach(button => { button.disabled = true; });
  }

  window.Kickabout = { storage, motion, createSound, prepareCanvas, showCanvasError };
})();
