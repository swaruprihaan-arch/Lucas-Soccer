/* ============================================================
   arcade.js — the 100-game arcade on the home page.
   • Search bar: describe a game ("shoot past a goalie") and the
     cards narrow to games whose title, description or tags match.
   • Selector: pick any of the 100 games and press Play Now.
   • Grid: one card per game, each with a "Play Now" button.
   Game data lives in games/games.js.
   ============================================================ */
(function () {
  "use strict";
  const GAMES = window.GAMES || [];
  const root = document.getElementById("arcade");
  if (!root) return;

  const input = root.querySelector("#arcade-search");
  const grid = root.querySelector(".arcade-grid");
  const count = root.querySelector("[data-arcade-count]");
  const empty = root.querySelector(".arcade-empty");
  const select = root.querySelector("#arcade-select");
  const go = root.querySelector("[data-arcade-go]");
  const clear = root.querySelector("[data-arcade-clear]");

  const pad = n => String(n).padStart(2, "0");
  const label = g => g.title || "Game " + g.id;

  /* ---------- Selector with all 100 games ---------- */
  select.innerHTML = '<option value="">Choose a game (1–' + GAMES.length + ')…</option>' +
    GAMES.map(g => `<option value="${g.id}">${pad(g.id)} · ${escapeHtml(label(g))}</option>`).join("");
  function selected() { return GAMES.find(g => g.id === +select.value); }
  select.addEventListener("change", () => { go.disabled = !select.value; });
  go.addEventListener("click", () => { const g = selected(); if (g) location.href = g.url; });
  go.disabled = true;

  /* ---------- Cards ---------- */
  grid.innerHTML = GAMES.map(g => `
    <li class="arcade-card${g.title ? "" : " is-untitled"}" data-id="${g.id}">
      <span class="arcade-num" aria-hidden="true">${pad(g.id)}</span>
      ${g.title ? `<h3>${escapeHtml(g.title)}</h3>` : ""}
      ${g.description ? `<p>${escapeHtml(g.description)}</p>` : ""}
      <a class="arcade-play" href="${g.url}" aria-label="Play Now${g.title ? ": " + escapeHtml(g.title) : ", game " + g.id}">Play Now</a>
    </li>`).join("");
  const cards = [...grid.children];

  /* ---------- Search by description ---------- */
  const STOP = new Set("a an the and or of to in on at for with my me i you it is are be game games where that this some like want play playing one who can get your from by".split(" "));
  const SYN = {
    soccer: ["football"], football: ["soccer"], goalie: ["goalkeeper", "keeper"], keeper: ["goalkeeper", "goalie"],
    goalkeeper: ["keeper", "goalie"], shoot: ["shooting", "penalty", "aim"], shooting: ["shoot"], kick: ["shoot", "penalty", "ball"],
    juggle: ["juggling", "keepy"], juggling: ["juggle"], tap: ["tapping"], tapping: ["tap"], race: ["racing"], racing: ["race"],
    fast: ["reflex", "speed"], quick: ["reflex", "fast"]
  };
  const stem = w => { const r = w.replace(/(ing|ers|er|es|s)$/, ""); return r.length >= 5 ? r : w.replace(/s$/, ""); };
  function words(s) {
    return (s.toLowerCase().match(/[a-z0-9]+/g) || []).filter(w => !STOP.has(w));
  }
  const index = GAMES.map(g => {
    const text = [g.title, g.description, (g.tags || []).join(" "), g.title ? "" : ""].join(" ");
    return { title: words(g.title).map(stem), all: new Set(words(text).map(stem)) };
  });

  function score(i, q) {
    let s = 0;
    for (const w of q) {
      const forms = [w, ...(SYN[w] || [])].map(stem);
      if (forms.some(f => index[i].title.includes(f))) s += 3;
      else if (forms.some(f => index[i].all.has(f))) s += 2;
      else if (forms.some(f => f.length > 2 && [...index[i].all].some(x => x.startsWith(f)))) s += 1;
    }
    return s;
  }

  function run() {
    const raw = input.value.trim();
    const num = raw.match(/^#?(\d{1,3})$/);
    const q = words(raw);
    let shown = 0;
    clear.hidden = !raw;
    if (!raw) {
      cards.forEach(c => { c.hidden = false; c.style.order = ""; });
      shown = cards.length;
    } else if (num) {                       // typing a number jumps to that game
      cards.forEach(c => { c.hidden = +c.dataset.id !== +num[1]; c.style.order = ""; if (!c.hidden) shown++; });
    } else {
      const scored = GAMES.map((g, i) => ({ i, s: q.length ? score(i, q) : 0 }));
      scored.forEach(({ i, s }) => {
        cards[i].hidden = s === 0;
        cards[i].style.order = String(1000 - s * 10);   // best matches first
        if (s) shown++;
      });
    }
    count.textContent = raw ? `${shown} matching game${shown === 1 ? "" : "s"}` : `All ${cards.length} games`;
    empty.hidden = shown > 0;
  }
  let t = 0;
  input.addEventListener("input", () => { clearTimeout(t); t = setTimeout(run, 80); });
  root.querySelector(".arcade-search").addEventListener("submit", e => {
    e.preventDefault();
    run();
    const first = cards.find(c => !c.hidden);
    if (first) first.querySelector(".arcade-play").focus();
  });
  clear.addEventListener("click", () => { input.value = ""; run(); input.focus(); });
  root.querySelector("[data-arcade-showall]").addEventListener("click", () => { input.value = ""; run(); });

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  window.arcade = { run, cards };   // for testing
  run();
})();
