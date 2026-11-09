/* ============================================================
   keepy.js — Keepy-Uppy: tap the ball before it hits the grass.
   Each touch counts one. Gravity gets stronger as you go,
   and wind starts pushing the ball after 10 touches.
   ============================================================ */
(function () {
  "use strict";

  const canvas = document.getElementById("keepy");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const overlay = document.querySelector(".game-overlay");
  const out = n => document.querySelector(`[data-out="${n}"]`);
  const muteBtn = document.querySelector('[data-action="mute"]');
  const pauseBtn = document.querySelector('[data-action="pause"]');
  const GROUND = H - 40;

  /* ---------- Sounds (made in the browser, no files) ---------- */
  let audio = null;
  let muted = localStorage.getItem("lucas-muted") === "1";
  function beep(freq, time, type, vol, slideTo) {
    if (muted) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = type || "sine";
      o.frequency.setValueAtTime(freq, audio.currentTime);
      if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, audio.currentTime + time);
      g.gain.setValueAtTime(vol || 0.15, audio.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + time);
      o.connect(g).connect(audio.destination);
      o.start(); o.stop(audio.currentTime + time);
    } catch (e) { /* sound is optional */ }
  }
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
    touches: 0, best: +(localStorage.getItem("lucas-keepy-best") || 0),
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
    muteBtn.textContent = muted ? "Sound off" : "Sound on";
    muteBtn.setAttribute("aria-pressed", String(!muted));
    pauseBtn.disabled = S.state !== "play" && !paused;
    pauseBtn.textContent = paused ? "Resume" : "Pause";
  }
  muteBtn.addEventListener("click", () => {
    muted = !muted;
    localStorage.setItem("lucas-muted", muted ? "1" : "0");
    updateBar();
  });

  let paused = false;
  function setPaused(v) {
    if (S.state !== "play") return;
    paused = v;
    if (paused) showOverlay("Half-time", "Take a breather. The ball will wait.", "Back to it", "resume");
    else overlay.hidden = true;
    updateBar();
  }
  pauseBtn.addEventListener("click", () => setPaused(!paused));

  function showOverlay(title, text, label, action) {
    overlay.innerHTML = `<div><h3>${title}</h3><p>${text}</p><button class="big" type="button" data-action="${action}">${label}</button></div>`;
    overlay.hidden = false;
    overlay.querySelector("button").focus({ preventScroll: true });
  }
  overlay.addEventListener("click", e => {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.action === "resume") setPaused(false);
    else start();
  });

  function start() {
    S.state = "play"; S.touches = 0; S.stars = 0;
    S.ball.x = W / 2; S.ball.y = GROUND - 200; S.ball.vx = 0; S.ball.vy = -250; S.ball.r = 42;
    S.wind = 0; S.windTarget = 0; S.star = null; S.pops = [];
    paused = false; overlay.hidden = true;
    sfx.whistle();
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
    const b = S.ball;
    const dx = b.x - px, dy = b.y - py;
    const hitR = b.r + 22;                              // a little forgiveness
    if (dx * dx + dy * dy > hitR * hitR) return false;
    // Hit the side of the ball and it flies the other way
    const side = Math.max(-1, Math.min(1, dx / b.r));
    b.vx = side * 420 + (Math.random() - 0.5) * 80;
    b.vy = -Math.max(780, Math.sqrt(gravity()) * 24);   // always enough to go up
    b.va = side * 14;
    S.touches++;
    S.ball.r = ballRadius();
    S.pops.push({ x: b.x, y: b.y - b.r - 10, t: 0, text: String(S.touches) });
    sfx.touch(S.touches);
    if (S.touches >= 10 && S.touches % 4 === 0) S.windTarget = (Math.random() - 0.5) * (200 + S.touches * 14);
    if (!S.star && S.touches >= 3 && Math.random() < 0.4) spawnStar();
    if (S.touches > S.best) { S.best = S.touches; localStorage.setItem("lucas-keepy-best", String(S.best)); }
    updateBar();
    return true;
  }
  canvas.addEventListener("pointerdown", e => {
    e.preventDefault();
    const p = toCanvas(e);
    touch(p.x, p.y);
  });
  // Keyboard: Space/Up touches the ball wherever it is (aimed at its centre)
  document.addEventListener("keydown", e => {
    if (e.target.closest && e.target.closest("button, a, input")) return;
    if (e.key === "Escape" || e.key === "p") { setPaused(!paused); e.preventDefault(); return; }
    if (S.state !== "play") {
      if ((e.key === " " || e.key === "Enter") && document.activeElement === canvas) { start(); e.preventDefault(); }
      return;
    }
    const b = S.ball;
    if (e.key === " " || e.key === "ArrowUp" || e.key === "w") touch(b.x, b.y);
    else if (e.key === "ArrowLeft" || e.key === "a") touch(b.x + b.r * 0.6, b.y);   // push it left
    else if (e.key === "ArrowRight" || e.key === "d") touch(b.x - b.r * 0.6, b.y);  // push it right
    else return;
    e.preventDefault();
  });

  /* ---------- Game loop ---------- */
  let last = performance.now();
  function loop(t) {
    const dt = Math.min(0.033, (t - last) / 1000);
    last = t;
    if (!paused) update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    const b = S.ball;
    if (S.state === "start" || S.state === "over") {
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
          S.stars++; S.touches += 3;
          S.pops.push({ x: S.star.x, y: S.star.y, t: 0, text: "+3" });
          S.star = null; sfx.star();
          if (S.touches > S.best) { S.best = S.touches; localStorage.setItem("lucas-keepy-best", String(S.best)); }
          updateBar();
        } else if (S.star.t > 6) S.star = null;
      }
      if (b.y > GROUND - b.r) {
        b.y = GROUND - b.r; b.vy = -380; b.vx *= 0.5;
        S.state = "over"; S.shake = 0.35; sfx.drop();
        for (let i = 0; i < 24; i++) S.dust.push({ x: b.x, y: GROUND, vx: (Math.random() - 0.5) * 300, vy: -Math.random() * 220, life: 0.8 });
        const best = S.touches >= S.best && S.touches > 0 ? " New best!" : "";
        setTimeout(() => {
          showOverlay("It hit the grass", `You kept it up for ${S.touches} touch${S.touches === 1 ? "" : "es"}.${best}`, "Go again", "play");
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
    if (S.shake) ctx.translate((Math.random() - 0.5) * 12 * S.shake, (Math.random() - 0.5) * 12 * S.shake);

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
      const s = S.star, k = 1 + Math.sin(s.t * 6) * 0.1;
      ctx.save(); ctx.translate(s.x, s.y); ctx.scale(k, k); ctx.rotate(s.t);
      ctx.fillStyle = s.t > 4.5 && Math.floor(s.t * 8) % 2 ? "rgba(228,239,134,.3)" : "#e4ef86";
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

  updateBar();
  requestAnimationFrame(loop);
})();
