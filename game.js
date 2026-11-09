/* ============================================================
   game.js — makes the page playable
   1. The hero ball: drag it and let go to kick it around the pitch.
      Get it into a goal (the gaps in the penalty boxes) to score.
   2. Penalty Shootout: the penalty challenge on the home page.
   Shared helpers are loaded first from site.js.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Tiny sound effects (no audio files needed) ---------- */
  const { storage, motion, createSound, prepareCanvas, showCanvasError } = window.Kickabout;
  const sound = createSound();
  const beep = sound.beep;
  const sfx = {
    kick: () => beep(140, 0.12, "triangle", 0.3, 60),
    bounce: () => beep(220, 0.06, "square", 0.05),
    goal: () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.25, "triangle", 0.18), i * 110)); },
    save: () => beep(300, 0.35, "sawtooth", 0.12, 90),
    whistle: () => { beep(2100, 0.18, "sine", 0.1); setTimeout(() => beep(2100, 0.4, "sine", 0.1), 220); }
  };

  /* ============================================================
     PART 1 — the hero ball you can kick around the pitch
     ============================================================ */
  const ball = document.querySelector(".ball");
  const pitch = document.querySelector(".pitch");
  let heroGoals = 0;

  if (ball && pitch) {
    ball.disabled = false;
    const score = document.createElement("div");
    score.className = "hero-score";
    score.setAttribute("aria-live", "polite");
    score.innerHTML = "Goals: <b>0</b>";
    pitch.appendChild(score);

    // Goal mouths drawn on the left and right edges of the pitch
    const mouths = [document.createElement("div"), document.createElement("div")];
    mouths.forEach(m => { m.className = "goal-mouth"; pitch.appendChild(m); });

    const hint = pitch.querySelector(".intro span, .hint");
    if (hint) hint.textContent = "Drag the ball and let go to kick it into a goal!";

    let x = 0, y = 0, vx = 0, vy = 0, angle = 0;  // offset from the ball's home spot
    let dragging = false, moved = false, raf = 0, lastT = 0;
    let trail = [];
    let celebrating = false, returnFrame = 0, goalTimer = 0, activePointer = null;

    function bounds() {
      // How far the ball can travel from home before it hits the touchline
      // (measured from the parent so the ball's own spin doesn't skew it)
      const p = pitch.getBoundingClientRect();
      const c = ball.parentElement.getBoundingClientRect();
      const size = ball.offsetWidth;
      const b = { width: size, height: size };
      const homeX = c.left + (c.width - size) / 2, homeY = c.top + (c.height - size) / 2;
      const pad = 22;
      return {
        minX: p.left + pad - homeX, maxX: p.right - pad - b.width - homeX,
        minY: p.top + pad - homeY, maxY: p.bottom - pad - b.height - homeY,
        p, b, homeX, homeY
      };
    }
    function goalBand() {
      const p = pitch.getBoundingClientRect();
      const circle = ball.parentElement.getBoundingClientRect();
      const middle = circle.top + circle.height / 2;
      const height = Math.min(180, p.height * 0.28);
      const top = Math.max(p.top + 40, Math.min(p.bottom - height - 40, middle - height / 2));
      return { top, bottom: top + height, p };
    }
    function placeMouths() {
      const g = goalBand();
      const boxHeight = Math.min(g.p.height - 44, (g.bottom - g.top) * 1.65);
      pitch.querySelectorAll(".box").forEach(box => {
        box.style.top = ((g.top + g.bottom) / 2 - g.p.top - boxHeight / 2 - 22) + "px";
        box.style.height = boxHeight + "px";
      });
      mouths.forEach((m, i) => {
        m.style.top = (g.top - g.p.top) + "px";
        m.style.height = (g.bottom - g.top) + "px";
        m.style.left = i === 0 ? "8px" : "";
        m.style.right = i === 1 ? "8px" : "";
      });
    }
    function fitPitch() {
      placeMouths();
      const B = bounds();
      x = Math.max(B.minX, Math.min(B.maxX, x));
      y = Math.max(B.minY, Math.min(B.maxY, y));
      draw();
    }
    placeMouths();
    window.addEventListener("resize", fitPitch);
    if (document.fonts) document.fonts.ready.then(fitPitch);
    if ("ResizeObserver" in window) new ResizeObserver(fitPitch).observe(pitch);

    function draw() {
      ball.style.transform = `translate(${x}px, ${y}px) rotate(${angle}deg)`;
    }
    function free() {
      if (!ball.classList.contains("is-free")) {
        ball.classList.remove("kick");
        ball.classList.add("is-free");
      }
      ball.style.position = "relative";
      ball.style.zIndex = "3";
    }

    function goal(side) {
      celebrating = true;
      heroGoals++;
      score.innerHTML = "Goals: <b>" + heroGoals + "</b>";
      const pop = document.createElement("div");
      pop.className = "goal-pop";
      pop.textContent = "Goal!";
      pitch.appendChild(pop);
      setTimeout(() => pop.remove(), 1300);
      sfx.goal();
      vx = vy = 0;
      // Roll back to the centre spot
      goalTimer = setTimeout(() => {
        const sx = x, sy = y, start = performance.now();
        (function back(t) {
          const k = motion.matches ? 1 : Math.min(1, (t - start) / 600), e = 1 - Math.pow(1 - k, 3);
          x = sx * (1 - e); y = sy * (1 - e); angle += (side < 0 ? 12 : -12);
          draw();
          if (k < 1) returnFrame = requestAnimationFrame(back); else { returnFrame = 0; celebrating = false; }
        })(start);
      }, 700);
    }

    function step(t) {
      const dt = Math.min(0.033, (t - lastT) / 1000 || 0.016);
      lastT = t;
      if (!dragging && !celebrating) {
        x += vx * dt; y += vy * dt;
        const f = Math.pow(0.32, dt);            // grass friction
        vx *= f; vy *= f;
        angle += (vx + vy * 0.3) * dt * 0.9;

        const B = bounds();
        const g = goalBand();
        const cy = B.homeY + y + B.b.height / 2; // ball centre on screen
        const inMouth = cy > g.top && cy < g.bottom;
        if (x < B.minX) {
          if (inMouth) return goalThen(-1);
          x = B.minX; vx = Math.abs(vx) * 0.7; sfx.bounce();
        } else if (x > B.maxX) {
          if (inMouth) return goalThen(1);
          x = B.maxX; vx = -Math.abs(vx) * 0.7; sfx.bounce();
        }
        if (y < B.minY) { y = B.minY; vy = Math.abs(vy) * 0.7; sfx.bounce(); }
        else if (y > B.maxY) { y = B.maxY; vy = -Math.abs(vy) * 0.7; sfx.bounce(); }
        draw();
        if (Math.hypot(vx, vy) < 8) { vx = vy = 0; raf = 0; return; }
      }
      raf = requestAnimationFrame(step);
    }
    function goalThen(side) { raf = 0; draw(); goal(side); }
    function run() { if (!raf) { lastT = performance.now(); raf = requestAnimationFrame(step); } }

    function resetBall() {
      clearTimeout(goalTimer);
      cancelAnimationFrame(returnFrame);
      cancelAnimationFrame(raf);
      raf = returnFrame = 0;
      dragging = moved = celebrating = false;
      if (activePointer !== null && ball.hasPointerCapture(activePointer)) ball.releasePointerCapture(activePointer);
      activePointer = null;
      x = y = vx = vy = angle = 0;
      draw();
    }
    pitch.querySelector('[data-action="reset-ball"]').addEventListener("click", resetBall);
    ball.addEventListener("keydown", e => {
      if (e.key === "Escape") { e.preventDefault(); resetBall(); }
      if (e.repeat && (e.key === " " || e.key === "Enter")) e.preventDefault();
    });
    document.addEventListener("visibilitychange", () => { if (document.hidden) resetBall(); });

    let startX = 0, startY = 0, baseX = 0, baseY = 0;
    ball.addEventListener("pointerdown", e => {
      if (celebrating || activePointer !== null || e.button !== 0 || e.isPrimary === false) return;
      activePointer = e.pointerId;
      dragging = true; moved = false;
      startX = e.clientX; startY = e.clientY; baseX = x; baseY = y;
      trail = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
      vx = vy = 0;
      ball.setPointerCapture(e.pointerId);
    });
    ball.addEventListener("pointermove", e => {
      if (!dragging || e.pointerId !== activePointer) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!moved && Math.hypot(dx, dy) > 6) { moved = true; free(); }
      if (!moved) return;
      const B = bounds();
      x = Math.max(B.minX, Math.min(B.maxX, baseX + dx));
      y = Math.max(B.minY, Math.min(B.maxY, baseY + dy));
      draw();
      trail.push({ x: e.clientX, y: e.clientY, t: performance.now() });
      if (trail.length > 6) trail.shift();
    });
    function release(e) {
      if (!dragging || e.pointerId !== activePointer) return;
      dragging = false;
      activePointer = null;
      if (!moved) return;
      const now = performance.now();
      const recent = trail.filter(point => now - point.t < 120);
      if (recent.length < 2) { vx = vy = 0; return; }
      const a = recent[0], b = recent[recent.length - 1];
      const ms = Math.max(16, b.t - a.t);
      vx = (b.x - a.x) / ms * 1000 * 1.4;
      vy = (b.y - a.y) / ms * 1000 * 1.4;
      const sp = Math.hypot(vx, vy), max = 2600;
      if (sp > max) { vx *= max / sp; vy *= max / sp; }
      if (sp > 60) sfx.kick();
      run();
    }
    ball.addEventListener("pointerup", release);
    ball.addEventListener("pointercancel", e => { if (e.pointerId === activePointer) resetBall(); });
    ball.addEventListener("lostpointercapture", () => { if (dragging) resetBall(); });

    // A plain click/tap (or Enter/Space) kicks it in a random direction
    ball.addEventListener("click", e => {
      if (moved && e.detail !== 0) { e.stopImmediatePropagation(); moved = false; return; }
      if (celebrating) return;
      moved = false;
      free();
      const a = Math.random() * Math.PI * 2;
      vx = Math.cos(a) * 1500; vy = Math.sin(a) * 1500;
      sfx.kick();
      run();
      e.stopImmediatePropagation();          // our kick replaces the old bounce
    }, true);

    // For testing in the console
    window.heroBall = { get x() { return x; }, get y() { return y; }, get goals() { return heroGoals; },
      kick(nvx, nvy) { free(); vx = nvx; vy = nvy; sfx.kick(); run(); } };
  }

  /* ============================================================
     PART 2 — Penalty Shootout mini game
     ============================================================ */
  const section = document.querySelector("#game");

  const canvas = section.querySelector("canvas");
  const surface = prepareCanvas(canvas, 800, 480);
  const ctx = surface.context;
  if (!ctx) { showCanvasError(canvas); return; }
  const overlay = section.querySelector(".game-overlay");
  const out = n => section.querySelector(`[data-out="${n}"]`);
  const muteBtn = section.querySelector('[data-action="mute"]');
  const pauseBtn = section.querySelector('[data-action="pause"]');
  let paused = false;
  let inView = true;
  let previousBest = 0;
  const W = 800, H = 480;
  const GOAL = { l: 190, r: 610, t: 70, b: 230 };      // goal mouth
  const SPOT = { x: 400, y: 420 };

  const ballImg = new Image();
  ballImg.src = "ball.png";

  const S = {
    state: "start",          // start | aim | flying | result | over
    score: 0, misses: 0, best: storage.score("lucas-best"),
    aim: { x: 400, y: 150 },
    keeper: { x: 400, dive: 0, diveTarget: 400, t: 0, phase: 0 },
    ball: { x: SPOT.x, y: SPOT.y, r: 22 },
    shot: null, msg: "", msgColor: "#ddeb4a", resultT: 0, confetti: []
  };
  window.penalty = S; // for testing

  function level() { return 1 + S.score; }
  function keeperSpeed() { return 160 + level() * 55; }               // patrol speed
  function keeperReach() { return 46 + Math.min(54, level() * 6); }   // half width of his dive
  function reaction() { return Math.max(0.05, 0.26 - level() * 0.025); }

  function updateBar() {
    out("score").textContent = S.score;
    out("best").textContent = S.best;
    out("level").textContent = level();
    out("lives").setAttribute("aria-label", `${3 - S.misses} misses remaining`);
    out("lives").textContent = "⚽".repeat(3 - S.misses) + "·".repeat(S.misses);
    muteBtn.textContent = sound.muted ? "Sound off" : "Sound on";
    pauseBtn.disabled = S.state === "start" || S.state === "over";
    pauseBtn.textContent = paused ? "Resume" : "Pause";
    muteBtn.setAttribute("aria-pressed", String(!sound.muted));
  }
  muteBtn.addEventListener("click", () => sound.toggle());
  sound.onChange(updateBar);

  function saveBest() {
    const saved = storage.score("lucas-best");
    S.best = Math.max(S.best, saved, S.score);
    if (S.best > saved) storage.set("lucas-best", S.best);
  }
  window.addEventListener("storage", event => {
    if (event.key !== "lucas-best" && event.key !== null) return;
    const saved = storage.score("lucas-best");
    S.best = Math.max(S.best, saved);
    previousBest = Math.max(previousBest, saved);
    updateBar();
  });

  function showOverlay(title, text, button, action = "play", focus = true) {
    overlay.innerHTML = `<div><h3>${title}</h3><p>${text}</p><button class="big" type="button" data-action="${action}">${button}</button></div>`;
    overlay.hidden = false;
    if (focus) overlay.querySelector("button").focus({ preventScroll: true });
  }
  overlay.addEventListener("click", e => {
    if (e.target.closest('[data-action="play"]')) startGame();
    if (e.target.closest('[data-action="resume"]')) setPaused(false);
  });

  function setPaused(value, focus = true) {
    if (S.state === "start" || S.state === "over") return;
    paused = value;
    if (paused) showOverlay("Half-time", "Take a breather. Your game is right here.", "Back to the game", "resume", focus);
    else {
      overlay.hidden = true;
      last = performance.now();
      canvas.focus({ preventScroll: true });
      wake();
    }
    updateBar();
  }
  pauseBtn.addEventListener("click", () => setPaused(!paused));
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) setPaused(true, false);
    else wake();
  });
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
      if (!inView) setPaused(true, false);
      else wake();
    }).observe(canvas);
  }

  function startGame() {
    paused = false;
    previousBest = S.best;
    out("announcement").textContent = "Kick off. Aim with the arrow keys and press Space to shoot.";
    S.score = 0; S.misses = 0; S.confetti = [];
    S.aim = { x: 400, y: 150 };
    S.keeper.x = 400; S.keeper.dive = 0; S.keeper.phase = 0;
    overlay.hidden = true;
    sfx.whistle();
    resetShot();
    updateBar();
    canvas.focus({ preventScroll: true });
    wake();
  }
  function resetShot() {
    S.state = "aim";
    S.ball.x = SPOT.x; S.ball.y = SPOT.y; S.ball.r = 22;
    S.shot = null; S.keeper.dive = 0; S.msg = "";
  }

  function shoot() {
    if (paused || S.state !== "aim") return;
    const tx = S.aim.x, ty = S.aim.y;
    // A little wobble, bigger the closer you aim to the woodwork
    const wob = 6;
    const target = { x: tx + (Math.random() - 0.5) * wob * 2, y: ty + (Math.random() - 0.5) * wob * 2 };
    S.shot = { from: { x: SPOT.x, y: SPOT.y }, to: target, t: 0, dur: Math.max(0.42, 0.62 - level() * 0.01) };
    // The keeper guesses: mostly right at higher levels
    const smart = Math.min(0.85, 0.35 + level() * 0.07);
    const guess = Math.random() < smart ? target.x : GOAL.l + 40 + Math.random() * (GOAL.r - GOAL.l - 80);
    S.keeper.diveTarget = Math.max(GOAL.l + 30, Math.min(GOAL.r - 30, guess));
    S.keeper.t = 0;
    S.state = "flying";
    sfx.kick();
  }

  function finishShot() {
    const p = S.shot.to;
    const inGoal = p.x > GOAL.l + 6 && p.x < GOAL.r - 6 && p.y > GOAL.t + 6 && p.y < GOAL.b;
    const hitPost = !inGoal && ((Math.abs(p.x - GOAL.l) < 10 || Math.abs(p.x - GOAL.r) < 10) && p.y > GOAL.t - 10 && p.y < GOAL.b
                   || Math.abs(p.y - GOAL.t) < 10 && p.x > GOAL.l - 10 && p.x < GOAL.r + 10);
    const k = S.keeper;
    const kx = k.x + k.dive;
    const reach = keeperReach();
    const saved = inGoal && Math.abs(p.x - kx) < reach && p.y > GOAL.t + 10 - (reach - 46);
    if (saved) {
      S.misses++; S.msg = "Saved!"; S.msgColor = "#ffd0e2"; sfx.save();
    } else if (inGoal) {
      S.score++; S.msg = "GOAL!"; S.msgColor = "#ddeb4a"; sfx.goal();
      for (let i = 0; i < (motion.matches ? 0 : 60); i++) S.confetti.push({ x: p.x, y: p.y, vx: (Math.random() - .5) * 500, vy: -Math.random() * 400, life: 1.2,
        c: ["#ddeb4a", "#f0559a", "#f6f8ee", "#5fd3c6"][i % 4] });
      saveBest();
    } else {
      S.misses++; S.msg = hitPost ? "Off the post!" : "Wide!"; S.msgColor = "#f6f8ee"; sfx.save();
    }
    out("announcement").textContent = `${S.msg} ${S.score} goal${S.score === 1 ? "" : "s"}. ${3 - S.misses} misses remaining.`;
    S.state = "result"; S.resultT = 0;
    updateBar();
  }

  // Aiming
  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  canvas.addEventListener("pointermove", e => {
    if (e.isPrimary === false) return;
    if (paused || S.state !== "aim") return;
    const p = toCanvas(e);
    S.aim.x = Math.max(120, Math.min(680, p.x));
    S.aim.y = Math.max(30, Math.min(300, p.y));
  });
  canvas.addEventListener("pointerdown", e => {
    if (e.button !== 0 || e.isPrimary === false) return;
    canvas.focus({ preventScroll: true });
    if (paused || S.state !== "aim") return;
    const p = toCanvas(e);
    S.aim.x = Math.max(120, Math.min(680, p.x));
    S.aim.y = Math.max(30, Math.min(300, p.y));
    shoot();
  });
  canvas.tabIndex = 0;
  canvas.addEventListener("keydown", e => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    if (key === "escape") { e.preventDefault(); setPaused(true); return; }
    if (paused || S.state !== "aim") return;
    const step = 18;
    if (key === "arrowleft" || key === "a") S.aim.x = Math.max(120, S.aim.x - step);
    else if (key === "arrowright" || key === "d") S.aim.x = Math.min(680, S.aim.x + step);
    else if (key === "arrowup" || key === "w") S.aim.y = Math.max(30, S.aim.y - step);
    else if (key === "arrowdown" || key === "s") S.aim.y = Math.min(300, S.aim.y + step);
    else if (key === " " || key === "enter") { if (!e.repeat) shoot(); }
    else return;
    e.preventDefault();
    if (key.startsWith("arrow") || ["a", "d", "w", "s"].includes(key)) {
      const horizontal = S.aim.x < 330 ? "left" : S.aim.x > 470 ? "right" : "centre";
      const vertical = S.aim.y < 120 ? "high" : S.aim.y > 180 ? "low" : "middle";
      out("announcement").textContent = `Aim: ${horizontal}, ${vertical}.`;
    }
  });

  /* ---------- Game loop ---------- */
  let last = performance.now();
  let frame = 0;
  const needsAnimation = () => S.state !== "over" && (S.state !== "start" || !motion.matches);
  function wake() {
    if (!frame && !paused && !document.hidden && inView && needsAnimation()) {
      last = performance.now();
      frame = requestAnimationFrame(loop);
    }
  }
  function loop(t) {
    frame = 0;
    if (paused || document.hidden || !inView) return;
    const dt = Math.min(0.033, Math.max(0, (t - last) / 1000));
    last = t;
    update(dt);
    render();
    if (needsAnimation()) frame = requestAnimationFrame(loop);
  }

  function update(dt) {
    const k = S.keeper;
    if (S.state === "aim" || (S.state === "start" && !motion.matches)) {
      // Keeper shuffles along his line, faster every level
      k.phase += dt * keeperSpeed() / 140;
      const span = (GOAL.r - GOAL.l) / 2 - 50;
      k.x = 400 + Math.sin(k.phase) * span * (S.state === "start" ? 0.5 : 1);
    }
    if (S.state === "flying") {
      const s = S.shot;
      s.t += dt;
      const p = Math.min(1, s.t / s.dur);
      S.ball.x = s.from.x + (s.to.x - s.from.x) * p;
      S.ball.y = s.from.y + (s.to.y - s.from.y) * p - Math.sin(p * Math.PI) * 40;
      S.ball.r = 22 - 10 * p;
      k.t += dt;
      if (k.t > reaction()) {
        const want = k.diveTarget - k.x;
        const sp = 900 + level() * 120;
        const d = want - k.dive;
        k.dive += Math.sign(d) * Math.min(Math.abs(d), sp * dt);
      }
      if (p >= 1) finishShot();
    }
    if (S.state === "result") {
      S.resultT += dt;
      if (S.resultT > 1.3) {
        if (S.misses >= 3) {
          S.state = "over";
          sfx.whistle();
          const best = S.score > previousBest ? " New best!" : "";
          updateBar();
          showOverlay("Full time", `You scored ${S.score} goal${S.score === 1 ? "" : "s"}.${best}`, "Play again", "play", document.activeElement === canvas);
        } else resetShot();
      }
    }
    S.confetti.forEach(c => { c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 700 * dt; c.life -= dt; });
    S.confetti = S.confetti.filter(c => c.life > 0);
  }

  function render() {
    // Grass stripes
    for (let i = 0; i < 10; i++) {
      ctx.fillStyle = i % 2 ? "#378a44" : "#2f7d3b";
      ctx.fillRect(i * 80, 0, 80, H);
    }
    // Chalk: six-yard box, penalty spot
    ctx.strokeStyle = "rgba(246,248,238,.75)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, GOAL.b); ctx.lineTo(W, GOAL.b);
    ctx.strokeRect(130, GOAL.b, 540, 90);
    ctx.stroke();
    ctx.fillStyle = "rgba(246,248,238,.85)";
    ctx.beginPath(); ctx.arc(SPOT.x, SPOT.y + 18, 5, 0, Math.PI * 2); ctx.fill();

    // Net
    ctx.fillStyle = "rgba(16,48,26,.35)";
    ctx.fillRect(GOAL.l, GOAL.t, GOAL.r - GOAL.l, GOAL.b - GOAL.t);
    ctx.strokeStyle = "rgba(246,248,238,.35)";
    ctx.lineWidth = 1;
    for (let x = GOAL.l; x <= GOAL.r; x += 16) { ctx.beginPath(); ctx.moveTo(x, GOAL.t); ctx.lineTo(x, GOAL.b); ctx.stroke(); }
    for (let y = GOAL.t; y <= GOAL.b; y += 16) { ctx.beginPath(); ctx.moveTo(GOAL.l, y); ctx.lineTo(GOAL.r, y); ctx.stroke(); }
    // Posts and crossbar
    ctx.strokeStyle = "#f6f8ee";
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(GOAL.l, GOAL.b); ctx.lineTo(GOAL.l, GOAL.t); ctx.lineTo(GOAL.r, GOAL.t); ctx.lineTo(GOAL.r, GOAL.b);
    ctx.stroke();

    // Keeper
    const k = S.keeper;
    const kx = k.x + k.dive;
    const lean = Math.max(-1, Math.min(1, k.dive / 120));
    const reach = keeperReach();
    ctx.save();
    ctx.translate(kx, GOAL.b - 4);
    ctx.rotate(lean * 0.9);
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath(); ctx.ellipse(0, 2, 34, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#10301a";                       // shorts/legs
    ctx.fillRect(-18, -46, 14, 44); ctx.fillRect(4, -46, 14, 44);
    ctx.fillStyle = "#f0559a";                       // jersey
    ctx.beginPath(); ctx.roundRect(-24, -100, 48, 58, 10); ctx.fill();
    ctx.strokeStyle = "#f0559a"; ctx.lineWidth = 12; ctx.lineCap = "round";  // arms
    ctx.beginPath(); ctx.moveTo(-20, -92); ctx.lineTo(-reach + 8, -118); ctx.moveTo(20, -92); ctx.lineTo(reach - 8, -118); ctx.stroke();
    ctx.fillStyle = "#ddeb4a";                       // gloves
    ctx.beginPath(); ctx.arc(-reach + 6, -120, 10, 0, Math.PI * 2); ctx.arc(reach - 6, -120, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#e9b88f";                       // head
    ctx.beginPath(); ctx.arc(0, -114, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#10301a";
    ctx.font = "900 24px 'Big Shoulders Display', Impact, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("1", 0, -60);
    ctx.restore();

    // Aim marker
    if (S.state === "aim") {
      ctx.strokeStyle = "#ddeb4a"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(S.aim.x, S.aim.y, 16, 0, Math.PI * 2);
      ctx.moveTo(S.aim.x - 24, S.aim.y); ctx.lineTo(S.aim.x + 24, S.aim.y);
      ctx.moveTo(S.aim.x, S.aim.y - 24); ctx.lineTo(S.aim.x, S.aim.y + 24);
      ctx.stroke();
      ctx.setLineDash([6, 8]); ctx.strokeStyle = "rgba(221,235,74,.5)";
      ctx.beginPath(); ctx.moveTo(SPOT.x, SPOT.y); ctx.lineTo(S.aim.x, S.aim.y); ctx.stroke();
      ctx.setLineDash([]);
    }

    // Ball
    const b = S.ball;
    ctx.fillStyle = "rgba(0,0,0,.25)";
    ctx.beginPath(); ctx.ellipse(b.x, b.y + b.r * 0.9, b.r * 0.9, b.r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    if (ballImg.complete && ballImg.naturalWidth) {
      ctx.save();
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.clip();
      ctx.translate(b.x, b.y);
      if (S.shot && !motion.matches) ctx.rotate(S.shot.t * 14);
      ctx.drawImage(ballImg, -b.r * 1.08, -b.r * 1.08, b.r * 2.16, b.r * 2.16);
      ctx.restore();
    } else {
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    }

    // Confetti
    S.confetti.forEach(c => { ctx.fillStyle = c.c; ctx.globalAlpha = Math.max(0, c.life); ctx.fillRect(c.x, c.y, 7, 7); });
    ctx.globalAlpha = 1;

    // Result text
    if (S.state === "result" && S.msg) {
      const sc = motion.matches ? 1 : Math.min(1, S.resultT * 5);
      ctx.save();
      ctx.translate(W / 2, 330);
      ctx.scale(sc, sc);
      ctx.font = "900 84px 'Big Shoulders Display', Impact, sans-serif";
      ctx.textAlign = "center";
      ctx.fillStyle = "#10301a"; ctx.fillText(S.msg, 0, 5);
      ctx.fillStyle = S.msgColor; ctx.fillText(S.msg, 0, 0);
      ctx.restore();
    }
  }

  // Older browsers without roundRect
  if (!ctx.roundRect) ctx.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };

  motion.addEventListener("change", () => {
    if (motion.matches) { S.confetti = []; }
    render();
    wake();
  });
  surface.onResize(render);
  ballImg.addEventListener("load", render);
  updateBar();
  render();
  wake();
})();
