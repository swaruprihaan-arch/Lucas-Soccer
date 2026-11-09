/* games/game-page.js — shared helper for every game page in games/.
   Fills in the title/description from games.js and wires Previous/Next. */
(function () {
  "use strict";
  const list = window.GAMES || [];
  const id = +document.body.dataset.gameId;
  const i = list.findIndex(g => g.id === id);
  const game = list[i] || { id, title: "", description: "" };

  const t = document.querySelector("[data-game-title]");
  const d = document.querySelector("[data-game-desc]");
  if (t) { t.textContent = game.title; t.hidden = !game.title; }
  if (d) { d.textContent = game.description; d.hidden = !game.description; }
  document.title = (game.title || "Game " + id) + " — The Kickabout";

  // Links in games.js are written from the site root; make them work from games/
  const href = g => /^(https?:)?\/\//.test(g.url) ? g.url : "../" + g.url;
  const prev = document.querySelector("[data-prev]");
  const next = document.querySelector("[data-next]");
  if (list.length && i >= 0) {
    if (prev) prev.href = href(list[(i - 1 + list.length) % list.length]);
    if (next) next.href = href(list[(i + 1) % list.length]);
  }

  // Empty stage? Show the game number on a pitch so the page isn't blank.
  const stage = document.getElementById("stage");
  if (stage && !stage.children.length && !stage.textContent.trim()) {
    stage.classList.add("is-empty");
    stage.innerHTML = '<span class="stage-number" aria-hidden="true">' + String(id).padStart(2, "0") + "</span>";
  }
})();
