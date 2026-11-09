# The Kickabout

A football playground built with HTML, CSS and vanilla JavaScript.

[Open the website](https://swaruprihaan-arch.github.io/Lucas-Soccer/)

## Run locally

No build step or dependencies are required. From the repository root:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000`. The main pages also work when opened directly from disk. Google Fonts are optional; system fonts are used if they cannot load.

## Play

- **Warm-up ball:** drag and release, or focus the ball and press Enter. Use Reset ball or Escape to return it to the centre.
- **Penalty Shootout:** aim with the pointer or arrow keys; click, tap, Space or Enter to shoot. Three misses end the round.
- **Keepy-Uppy:** tap the ball or press Space to keep it up. Left/right arrows steer. Touches earn one point and stars earn three.
- **Both games:** Escape pauses, the sound button toggles audio, and leaving the game or browser tab pauses the round. Best scores and sound preferences are saved locally when browser storage is available.

## Project structure

- `index.html`, `style.css`: homepage, navigation and shared styling.
- `game.js`: warm-up ball and Penalty Shootout.
- `keepy-uppy.html`, `keepy.js`: Keepy-Uppy.
- `404.html`: a standalone recovery page for missing GitHub Pages URLs.
- `site.js`: resilient storage, sound, canvas scaling and browser fallbacks.
- `arcade.js`, `arcade.css`: arcade search, selector and game cards.
- `games/games.js`: metadata for all 100 arcade slots. Slots 1 and 2 are playable; slots 3–100 are reserved pages for future games.
- `games/game-page.js`, `games/game-page.css`: shared layout and navigation for reserved game pages.

To fill a reserved slot, update its title, description and tags in `games/games.js`, add the game to its numbered HTML page, and keep asset paths relative to that page.

## Check changes

Use Node.js 18 or newer and Python 3.9 or newer:

```sh
node --test tests/*.test.cjs
python3 tests/check_site.py
```

The automated checks cover game state, keyboard controls, pause/resume, scoring, storage failures, reduced motion, canvas scaling, search, and local page links/assets. They use a lightweight browser harness; also review changes in a real browser at mobile and desktop widths.

## Publish

GitHub Pages serves the repository root from `main`. Commit and push changes to `origin/main`, then wait for the Pages build to finish. There is no generated build output to upload.
