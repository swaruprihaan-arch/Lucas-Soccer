/* ============================================================
   keepy.js — Keepy-Uppy: tap the ball before it hits the grass.
   Each touch counts one. Gravity gets stronger as you go,
   and wind starts pushing the ball after 10 touches.
   ============================================================ */
(function () {
  "use strict";

  const canvas = document.getElementById("keepy");
  const { storage, motion, createSound, prepareCanvas, showCanvasError } = window.Kickabout;
  const W = 800, H = 520;
  const surface = prepareCanvas(canvas, W, H);
  const ctx = surface.context;
  if (!ctx) { showCanvasError(canvas); return; }
  const overlay = document.querySelector(".game-overlay");
  const out = n => document.querySelector(`[data-out="${n}"]`);
  const muteBtn = document.querySelector('[data-action="mute"]');
  const pauseBtn = document.querySelector('[data-action="pause"]');
  const GROUND = H - 40;

  /* ---------- Sounds (made in the browser, no files) ---------- */
  const sound = createSound();
  const beep = sound.beep;
  const sfx = {
    touch: n => beep(180 + Math.min(n, 40) * 12, 0.1, "triangle", 0.25, 90),
    wall: () => beep(240, 0.05, "square", 0.05),
    star: () => { beep(880, 0.12, "triangle", 0.15); setTimeout(() => beep(1320, 0.18, "triangle", 0.15), 90); },
    drop: () => beep(260, 0.5, "sawtooth", 0.12, 60),
    whistle: () => { beep(2100, 0.18, "sine", 0.1); setTimeout(() => beep(2100, 0.4, "sine", 0.1), 220); }
  };

  const ballImg = new Image();
  ballImg.src = "ball.png";

  const S = {
    state: "start",            // start | play | over
    touches: 0, hits: 0, best: storage.score("lucas-keepy-best"),
    ball: { x: W / 2, y: GROUND - 160, vx: 0, vy: 0, r: 42, spin: 0, va: 0 },
    wind: 0, windTarget: 0, windT: 0,
    star: null, stars: 0,
    pops: [], dust: [], shake: 0
  };
  window.keepy = S; // so the page can be tested from the console

  function gravity() { return 1500 + S.touches * 45; }      // gets heavier every touch
  function ballRadius() { return Math.max(26, 42 - S.touches * 0.4); } // and smaller
  function level() { return 1 + Math.floor(S.touches / 5); }

  function updateBar() {
    out("score").textContent = S.touches;
    out("best").textContent = S.best;
    out("level").textContent = level();
    out("stars").textContent = S.stars;
    muteBtn.textContent = sound.muted ? "Sound off" : "Sound on";
    muteBtn.setAttribute("aria-pressed", String(!sound.muted));
    pauseBtn.disabled = S.state !== "play" && !paused;
    pauseBtn.textContent = paused ? "Resume" : "Pause";
  }
  muteBtn.addEventListener("click", () => sound.toggle());
  sound.onChange(updateBar);

  let paused = false;
  let inView = true;
  let endTimer = 0;
  let lastTouch = -Infinity;
  let previousBest = S.best;
  const announce = text => { out("announcement").textContent = text; };
  function setPaused(v, focus = true) {
    if (S.state !== "play") return;
    paused = v;
    if (paused) showOverlay("Half-time", "Take a breather. The ball will wait.", "Back to it", "resume", focus);
    else {
      overlay.hidden = true;
      last = performance.now();
      canvas.focus({ preventScroll: true });
    }
    updateBar();
  }
  pauseBtn.addEventListener("click", () => setPaused(!paused));

  function showOverlay(title, text, label, action, focus = true) {
    overlay.innerHTML = `<div><h3>${title}</h3><p>${text}</p><button class="big" type="button" data-action="${action}">${label}</button></div>`;
    overlay.hidden = false;
    if (focus) overlay.querySelector("button").focus({ preventScroll: true });
  }
  overlay.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.action === "resume") setPaused(false);
    else if (b.dataset.action === "play") start();
  });

  function start() {
    clearTimeout(endTimer);
    previousBest = S.best;
    lastTouch = -Infinity;
    S.state = "play"; S.touches = 0; S.hits = 0; S.stars = 0;
    S.ball.x = W / 2; S.ball.y = GROUND - 200; S.ball.vx = 0; S.ball.vy = -250; S.ball.r = 42; S.ball.spin = 0; S.ball.va = 0;
    S.wind = 0; S.windTarget = 0; S.star = null; S.pops = []; S.dust = []; S.shake = 0;
    paused = false; overlay.hidden = true;
    sfx.whistle();
    announce("Kick off. Keep the ball in the air.");
    updateBar();
    canvas.focus({ preventScroll: true });
  }

  function spawnStar() {
    S.star = { x: 80 + Math.random() * (W - 160), y: 70 + Math.random() * 140, t: 0 };
  }

  /* ---------- Touching the ball ---------- */
  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  function touch(px, py) {
    if (S.state !== "play" || paused) return false;
    const now = performance.now();
    if (now - lastTouch < 110) return false;
    const b = S.ball;
    const dx = b.x - px, dy = b.y - py;
    const hitR = Math.max(b.r + 22, 24 * W / (canvas.getBoundingClientRect().width || W));                              // a little forgiveness
    if (dx * dx + dy * dy > hitR * hitR) return false;
    lastTouch = now;
    S.hits++;
    // Hit the side of the ball and it flies the other way
    const side = Math.max(-1, Math.min(1, dx / b.r));
    b.vx = side * 420 + (Math.random() - 0.5) * 80;
    b.vy = -Math.max(780, Math.sqrt(gravity()) * 24);   // always enough to go up
    b.va = side * 14;
    S.touches++;
    S.ball.r = ballRadius();
    if (!motion.matches) S.pops.push({ x: b.x, y: b.y - b.r - 10, t: 0, text: String(S.touches) });
    sfx.touch(S.touches);
    if (S.touches >= 10 && (S.windTarget === 0 || S.hits % 4 === 0)) S.windTarget = (Math.random() - 0.5) * (200 + S.touches * 14);
    if (!S.star && S.touches >= 3 && Math.random() < 0.4) spawnStar();
    if (S.touches > S.best) { S.best = S.touches; storage.set("lucas-keepy-best", String(S.best)); }
    updateBar();
    return true;
  }
  canvas.addEventListener("pointerdown", e => {
    if (e.button !== 0 || e.isPrimary === false) return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    const p = toCanvas(e);
    touch(p.x, p.y);
  });
  // Only the focused game handles keys; navigation and page scrolling stay native.
  canvas.addEventListener("keydown", e => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    if (!["escape", "p", " ", "enter", "arrowup", "w", "arrowleft", "a", "arrowright", "d"].includes(key)) return;
    e.preventDefault();
    if (e.repeat) return;
    if (key === "escape" || key === "p") { setPaused(!paused); return; }
    if (S.state !== "play") {
      if (key === " " || key === "enter") start();
      return;
    }
    const b = S.ball;
    if ([" ", "enter", "arrowup", "w"].includes(key)) touch(b.x, b.y);
    else if (key === "arrowleft" || key === "a") touch(b.x + b.r * 0.6, b.y);
    else if (key === "arrowright" || key === "d") touch(b.x - b.r * 0.6, b.y);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) setPaused(true, false);
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (!inView) setPaused(true, false);
    }).observe(canvas);
  }

  /* ---------- Game loop ---------- */
  let last = performance.now();
  function loop(t) {
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;
    if (!document.hidden && inView) {
      if (!paused) update(dt);
      render();
    }
    requestAnimationFrame(loop);
  }

  function update(dt) {
    const b = S.ball;
    if (!motion.matches && (S.state === "start" || S.state === "over")) {
      // Idle: the ball bounces gently on the grass
      b.vy += 1400 * dt; b.y += b.vy * dt;
      if (b.y > GROUND - b.r) { b.y = GROUND - b.r; b.vy = -620; }
      b.x += (W / 2 - b.x) * dt * 2;
    }
    if (S.state === "play") {
      S.wind += (S.windTarget - S.wind) * dt * 1.5;
      b.vx += S.wind * dt;
      b.vy += gravity() * dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.spin += b.va * dt; b.va *= Math.pow(0.6, dt);
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.8; sfx.wall(); }
      if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.8; sfx.wall(); }
      if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.4; }
      if (S.star) {
        S.star.t += dt;
        if (Math.hypot(S.star.x - b.x, S.star.y - b.y) < b.r + 22) {
          S.stars++; S.touches += 3; S.ball.r = ballRadius();
          announce(`Bonus star! Score: ${S.touches}.`);
          if (!motion.matches) S.pops.push({ x: S.star.x, y: S.star.y, t: 0, text: "+3" });
          S.star = null; sfx.star();
          if (S.touches > S.best) { S.best = S.touches; storage.set("lucas-keepy-best", String(S.best)); }
          updateBar();
        } else if (S.star.t > 6) S.star = null;
      }
      if (b.y > GROUND - b.r) {
        b.y = GROUND - b.r; b.vy = -380; b.vx *= 0.5;
        S.state = "over"; S.shake = motion.matches ? 0 : 0.35; sfx.drop();
        for (let i = 0; i < (motion.matches ? 0 : 24); i++) S.dust.push({ x: b.x, y: GROUND, vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 220, life: 0.8 });
        const best = S.touches > previousBest ? " New best!" : "";
        updateBar();
        endTimer = setTimeout(() => {
          if (S.state !== "over") return;
          showOverlay("It hit the grass", `You scored ${S.touches} point${S.touches === 1 ? "" : "s"}: ${S.hits} touch${S.hits === 1 ? "" : "es"} and ${S.stars} bonus star${S.stars === 1 ? "" : "s"}.${best}`, "Go again", "play", !document.hidden && inView && document.activeElement === canvas);
          updateBar();
        }, 650);
      }
    }
    S.pops.forEach(p => { p.t += dt; p.y -= 50 * dt; });
    S.pops = S.pops.filter(p => p.t < 0.8);
    S.dust.forEach(d => { d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 600 * dt; d.life -= dt; });
    S.dust = S.dust.filter(d => d.life > 0);
    S.shake = Math.max(0, S.shake - dt);
  }

  function render() {
    ctx.save();
    if (S.shake && !motion.matches) ctx.translate((Math.random() - 0.5) * 12 * S.shake, (Math.random() - 0.5) * 12 * S.shake);

    // Sky over the stadium, then grass
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, "#1d4d37"); sky.addColorStop(1, "#296343");
    ctx.fillStyle = sky; ctx.fillRect(-10, -10, W + 20, GROUND + 10);
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i % 2 ? "#2d6948" : "#296343";
      ctx.fillRect(i * 80, GROUND, 80, H - GROUND + 10);
    }
    ctx.strokeStyle = "rgba(246,245,237,.7)"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, GROUND); ctx.lineTo(W, GROUND); ctx.stroke();

    // Height lines, so you can see how high you are kicking it
    ctx.strokeStyle = "rgba(246,245,237,.08)"; ctx.lineWidth = 1;
    for (let y = GROUND - 100; y > 0; y -= 100) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // Wind arrow
    if (S.state === "play" && Math.abs(S.wind) > 20) {
      const len = Math.min(120, Math.abs(S.wind) * 0.25), dir = Math.sign(S.wind);
      ctx.strokeStyle = "rgba(228,239,134,.8)"; ctx.lineWidth = 4; ctx.lineCap = "round";
      ctx.beginPath(); ctx.moveTo(W / 2 - dir * len / 2, 34); ctx.lineTo(W / 2 + dir * len / 2, 34);
      ctx.lineTo(W / 2 + dir * len / 2 - dir * 12, 24); ctx.moveTo(W / 2 + dir * len / 2, 34); ctx.lineTo(W / 2 + dir * len / 2 - dir * 12, 44);
      ctx.stroke();
      ctx.fillStyle = "rgba(228,239,134,.8)"; ctx.font = "700 14px 'Atkinson Hyperlegible', sans-serif"; ctx.textAlign = "center";
      ctx.fillText("WIND", W / 2, 66);
    }

    // Bonus star
    if (S.star) {
      const s = S.star, k = motion.matches ? 1 : 1 + Math.sin(s.t * 6) * 0.1;
      ctx.save(); ctx.translate(s.x, s.y); ctx.scale(k, k); if (!motion.matches) ctx.rotate(s.t);
      ctx.fillStyle = !motion.matches && s.t > 4.5 && Math.floor(s.t * 8) % 2 ? "rgba(228,239,134,.3)" : "#e4ef86";
      ctx.beginPath();
      for (let i = 0; i < 10; i++) {
        const r = i % 2 ? 9 : 20, a = i * Math.PI / 5 - Math.PI / 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath(); ctx.fill(); ctx.restore();
    }

    // Shadow grows as the ball comes down
    const b = S.ball;
    const h = Math.max(0, GROUND - b.y);
    ctx.fillStyle = `rgba(0,0,0,${Math.max(0.08, 0.35 - h / 1600)})`;
    ctx.beginPath(); ctx.ellipse(b.x, GROUND + 4, b.r * Math.max(0.4, 1 - h / 700), 7, 0, 0, Math.PI * 2); ctx.fill();

    // Ball
    ctx.save();
    ctx.translate(b.x, b.y); ctx.rotate(b.spin);
    ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.clip();
    if (ballImg.complete && ballImg.naturalWidth) ctx.drawImage(ballImg, -b.r * 1.08, -b.r * 1.08, b.r * 2.16, b.r * 2.16);
    else { ctx.fillStyle = "#fff"; ctx.fill(); }
    ctx.restore();

    // Danger ring when the ball is low and falling
    if (S.state === "play" && b.vy > 0 && GROUND - b.y < 170) {
      ctx.strokeStyle = "rgba(239,145,181,.9)"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 8, 0, Math.PI * 2); ctx.stroke();
    }

    S.dust.forEach(d => { ctx.fillStyle = `rgba(246,245,237,${d.life})`; ctx.fillRect(d.x, d.y, 4, 4); });

    S.pops.forEach(p => {
      ctx.globalAlpha = 1 - p.t / 0.8;
      ctx.fillStyle = "#e4ef86"; ctx.font = "900 34px 'Big Shoulders Display', Impact, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(p.text, p.x, p.y);
    });
    ctx.globalAlpha = 1;

    // Big touch counter in the background
    if (S.state === "play") {
      ctx.fillStyle = "rgba(246,245,237,.10)";
      ctx.font = "900 200px 'Big Shoulders Display', Impact, sans-serif"; ctx.textAlign = "center";
      ctx.fillText(S.touches, W / 2, GROUND - 120);
    }
    ctx.restore();
  }

  surface.onResize(render);
  ballImg.addEventListener("load", render);
  updateBar();
  render();
  requestAnimationFrame(loop);
})();
