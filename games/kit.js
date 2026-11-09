/* ============================================================
   kit.js — the shared toolkit every game in /games uses.
   It does the boring parts so each game file only has to say
   how the game plays:
     - the start / pause / game-over screens
     - the score bar, best score (saved), and sound on/off
     - a game loop, mouse/touch/keyboard input, and drawing helpers

   Each game calls Kit.create({...}) with these parts:
     id        a short unique name, used to save the best score
     best      "high" (bigger score is better, default) or "low" (e.g. fastest time)
     start()   reset everything for a new game
     update(dt)        move things; dt is seconds since last frame
     render(ctx)       draw everything onto the 800x480 canvas
     pointerDown(p) / pointerMove(p) / pointerUp(p)   p = {x, y} in canvas pixels
     keyDown(key) / keyUp(key)   return true if the key was used
   Then the game calls K.stat("score", 3), K.end(score), etc.
   ============================================================ */
(function () {
  "use strict";

  const storage = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* Play without saving. */ } }
  };
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const autotest = /[?&]autotest/.test(location.search);

  /* ---------- Sounds, made in the browser (no audio files) ---------- */
  const isMuted = () => storage.get("lucas-muted") === "1";
  let audio = null;
  function beep(freq, time, type, vol, slideTo) {
    if (isMuted() || autotest) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(freq, audio.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, audio.currentTime + time);
      g.gain.setValueAtTime(vol || 0.15, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + time);
      o.connect(g).connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + time);
    } catch (e) { /* sound is optional */ }
  }
  const sfx = {
    kick: () => beep(140, 0.12, "triangle", 0.3, 60),
    bounce: () => beep(220, 0.06, "square", 0.05),
    click: () => beep(660, 0.05, "square", 0.06),
    point: () => { beep(880, 0.1, "triangle", 0.15); setTimeout(() => beep(1320, 0.14, "triangle", 0.15), 80); },
    goal: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.25, "triangle", 0.18), i * 110)); },
    miss: () => beep(300, 0.35, "sawtooth", 0.12, 90),
    whistle: () => { beep(2100, 0.18, "sine", 0.1); setTimeout(() => beep(2100, 0.4, "sine", 0.1), 220); }
  };

  /* ---------- Site colours, for drawing ---------- */
  const C = {
    grass: "#2f7d3b", grassLight: "#378a44", ink: "#10301a", chalk: "#f6f8ee",
    pink: "#f0559a", lime: "#ddeb4a", teal: "#5fd3c6", skin: "#e9b88f"
  };
  const DISPLAY = "'Big Shoulders Display', Impact, sans-serif";
  const BODY = "'Atkinson Hyperlegible', system-ui, sans-serif";

  const ballImg = new Image();
  ballImg.src = "../ball.png";

  function create(game) {
    const section = document.querySelector(".game-page") || document;
    const canvas = section.querySelector("canvas");
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    const overlay = section.querySelector(".game-overlay");
    const muteBtn = section.querySelector('[data-action="mute"]');
    const pauseBtn = section.querySelector('[data-action="pause"]');
    const announcer = section.querySelector('[data-out="announcement"]');
    const out = n => section.querySelector(`[data-out="${n}"]`);
    const lowIsBest = game.best === "low";
    const bestKey = "lucas-best-" + game.id;
    const savedBest = Number(storage.get(bestKey));

    const K = {
      W, H, ctx, canvas, C, DISPLAY, BODY, sfx, beep, ballImg, reducedMotion,
      state: "start",          // start | play | over
      paused: false,
      time: 0,                 // seconds since this game started
      best: storage.get(bestKey) !== null && Number.isFinite(savedBest) ? savedBest : null,
      stat, end, announce, pop, confetti, shake,
      drawPitch, drawBall, text, rand, randInt, clamp, dist, pick
    };
    let fx = { pops: [], confetti: [], shake: 0 };

    /* ----- Score bar ----- */
    function stat(name, value) {
      const el = out(name);
      if (el) el.textContent = value;
    }
    function updateBar() {
      stat("best", K.best === null ? "–" : K.best);
      muteBtn.textContent = isMuted() ? "Sound off" : "Sound on";
      muteBtn.setAttribute("aria-pressed", String(!isMuted()));
      pauseBtn.disabled = K.state !== "play";
      pauseBtn.textContent = K.paused ? "Resume" : "Pause";
    }
    muteBtn.addEventListener("click", () => {
      storage.set("lucas-muted", isMuted() ? "0" : "1");
      updateBar();
    });

    function announce(message) { if (announcer) announcer.textContent = message; }

    /* ----- Start, pause and game-over screens ----- */
    function showOverlay(title, message, button, action, focus = true) {
      overlay.innerHTML = `<div><h3>${title}</h3><p>${message}</p><button class="big" type="button" data-action="${action}">${button}</button></div>`;
      overlay.hidden = false;
      if (focus) overlay.querySelector("button").focus({ preventScroll: true });
    }
    overlay.addEventListener("click", e => {
      if (e.target.closest('[data-action="play"]')) startGame();
      if (e.target.closest('[data-action="resume"]')) setPaused(false);
    });

    function startGame() {
      fx = { pops: [], confetti: [], shake: 0 };
      K.time = 0;
      K.paused = false;
      K.state = "play";
      overlay.hidden = true;
      game.start && game.start();
      updateBar();
      announce("Kick off!");
      canvas.focus({ preventScroll: true });
    }

    function setPaused(value, focus = true) {
      if (K.state !== "play") return;
      K.paused = value;
      if (value) showOverlay("Half-time", "Take a breather. Your game is right here.", "Back to the game", "resume", focus);
      else {
        overlay.hidden = true;
        last = performance.now();
        canvas.focus({ preventScroll: true });
      }
      updateBar();
    }
    pauseBtn.addEventListener("click", () => setPaused(!K.paused));
    document.addEventListener("visibilitychange", () => { if (document.hidden && !autotest) setPaused(true, false); });

    // Call this when the game is over. score = the final score (or time).
    // message = optional extra sentence. title = optional heading.
    function end(score, message, title) {
      if (K.state !== "play") return;
      K.state = "over";
      let isBest = false;
      if (typeof score === "number" && Number.isFinite(score)) {
        if (K.best === null || (lowIsBest ? score < K.best : score > K.best)) {
          isBest = K.best !== null || score !== 0;
          K.best = score;
          storage.set(bestKey, String(score));
        }
      }
      sfx.whistle();
      updateBar();
      const extra = (message ? message + " " : "") + (isBest ? "New best!" : "");
      announce(`Full time. ${extra}`);
      setTimeout(() => showOverlay(title || "Full time", extra || "Good game!", "Play again", "play"), 700);
    }

    /* ----- Effects ----- */
    function pop(message, color) { fx.pops.push({ text: message, color: color || C.lime, t: 0 }); }
    function confetti(x, y, n = 50) {
      if (reducedMotion) return;
      for (let i = 0; i < n; i++) fx.confetti.push({ x, y, vx: (Math.random() - .5) * 500, vy: -Math.random() * 420, life: 1.2,
        c: [C.lime, C.pink, C.chalk, C.teal][i % 4] });
    }
    function shake(amount) { if (!reducedMotion) fx.shake = Math.max(fx.shake, amount || 8); }

    /* ----- Drawing helpers ----- */
    function drawPitch(stripes = 10, a = C.grass, b = C.grassLight) {
      const w = W / stripes;
      for (let i = 0; i < stripes; i++) { ctx.fillStyle = i % 2 ? b : a; ctx.fillRect(i * w, 0, w + 1, H); }
    }
    function drawBall(x, y, r, angle = 0) {
      if (ballImg.complete && ballImg.naturalWidth) {
        ctx.save();
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
        ctx.translate(x, y); ctx.rotate(angle);
        ctx.drawImage(ballImg, -r * 1.08, -r * 1.08, r * 2.16, r * 2.16);
        ctx.restore();
      } else {
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Big chunky text with a dark shadow, like the site headings
    function text(str, x, y, size = 48, color = C.chalk, align = "center", font = DISPLAY, weight = 900) {
      ctx.save();
      ctx.font = `${weight} ${size}px ${font}`;
      ctx.textAlign = align;
      ctx.textBaseline = "middle";
      if (font === DISPLAY) { ctx.fillStyle = C.ink; ctx.fillText(str, x, y + Math.max(2, size / 18)); }
      ctx.fillStyle = color;
      ctx.fillText(str, x, y);
      ctx.restore();
    }
    function rand(a, b) { return a + Math.random() * (b - a); }
    function randInt(a, b) { return Math.floor(rand(a, b + 1)); }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }
    function pick(list) { return list[Math.floor(Math.random() * list.length)]; }

    /* ----- Input ----- */
    function toCanvas(e) {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
    }
    const playing = () => K.state === "play" && !K.paused;
    canvas.addEventListener("pointerdown", e => {
      if (!playing() || !game.pointerDown) return;
      canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
      game.pointerDown(toCanvas(e), e);
    });
    canvas.addEventListener("pointermove", e => { if (playing() && game.pointerMove) game.pointerMove(toCanvas(e), e); });
    canvas.addEventListener("pointerup", e => { if (playing() && game.pointerUp) game.pointerUp(toCanvas(e), e); });
    canvas.addEventListener("pointercancel", e => { if (playing() && game.pointerUp) game.pointerUp(toCanvas(e), e); });
    canvas.tabIndex = 0;
    document.addEventListener("keydown", e => {
      if (document.activeElement !== canvas) return;
      if (e.key === "Escape") { e.preventDefault(); setPaused(true); return; }
      if (!playing() || e.altKey || e.ctrlKey || e.metaKey || !game.keyDown) return;
      if (game.keyDown(e.key, e) === true) e.preventDefault();
    });
    document.addEventListener("keyup", e => {
      if (document.activeElement !== canvas || !game.keyUp) return;
      if (game.keyUp(e.key, e) === true) e.preventDefault();
    });

    /* ----- Game loop ----- */
    let last = performance.now();
    function loop(t) {
      const dt = Math.min(0.033, Math.max(0, (t - last) / 1000));
      last = t;
      if (!document.hidden || autotest) {
        if (playing()) { K.time += dt; game.update && game.update(dt); }
        fx.pops.forEach(p => { p.t += dt; });
        fx.pops = fx.pops.filter(p => p.t < 1.2);
        fx.confetti.forEach(c => { c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 700 * dt; c.life -= dt; });
        fx.confetti = fx.confetti.filter(c => c.life > 0);
        fx.shake *= Math.pow(0.02, dt);

        ctx.save();
        if (fx.shake > 0.5) ctx.translate((Math.random() - .5) * fx.shake, (Math.random() - .5) * fx.shake);
        game.render && game.render(ctx);
        ctx.restore();
        fx.confetti.forEach(c => { ctx.fillStyle = c.c; ctx.globalAlpha = Math.max(0, c.life); ctx.fillRect(c.x, c.y, 7, 7); });
        ctx.globalAlpha = 1;
        fx.pops.forEach(p => {
          const s = Math.min(1, p.t * 6);
          ctx.save();
          ctx.globalAlpha = Math.min(1, (1.2 - p.t) * 3);
          ctx.translate(W / 2, H * 0.4);
          ctx.scale(s, s);
          text(p.text, 0, 0, 72, p.color);
          ctx.restore();
        });
        frames++;
      }
      requestAnimationFrame(loop);
    }
    let frames = 0;

    if (game.init) game.init();
    updateBar();
    requestAnimationFrame(loop);

    /* ----- Self-test: open the page with ?autotest to bash random buttons ----- */
    if (autotest) runAutotest();
    function runAutotest() {
      const root = document.documentElement;
      const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Enter", "a", "d", "w", "s"];
      let n = 0;
      setTimeout(() => {
        overlay.querySelector('[data-action="play"]').click();
        const timer = setInterval(() => {
          n++;
          if (K.state === "over" && n % 40 === 0) overlay.querySelector('[data-action="play"]')?.click();
          const r = canvas.getBoundingClientRect();
          const x = r.left + Math.random() * r.width, y = r.top + Math.random() * r.height;
          const ev = type => canvas.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, bubbles: true, pointerId: 1 }));
          ev("pointerdown"); ev("pointermove"); if (n % 2) ev("pointerup");
          const key = keys[n % keys.length];
          canvas.focus();
          document.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
          if (n % 3) document.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
          root.dataset.frames = frames;
          root.dataset.state = K.state;
          if (n > 300) { clearInterval(timer); root.dataset.autotest = "done"; }
        }, 30);
      }, 200);
    }
    return K;
  }

  // Record any crash so the self-test can report it
  window.addEventListener("error", e => {
    const root = document.documentElement;
    root.dataset.errors = (root.dataset.errors ? root.dataset.errors + " | " : "") + (e.message || "error");
  });

  window.Kit = { create };
})();
