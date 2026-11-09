const test = require('node:test');
const assert = require('node:assert/strict');
const { createBrowser } = require('./browser-harness.cjs');

for (const game of ['penalty', 'keepy']) {
  test(`${game}: loads without storage and rejects corrupt best scores`, () => {
    const denied = createBrowser({ game, blockedStorage: true });
    denied.action('play'); denied.tick(100); denied.mute.emit('click');
    assert.equal(denied.state.best, 0);
    for (const value of ['Infinity', 'NaN', '-1', '1.2', '9007199254740992']) {
      const browser = createBrowser({ game, saved: { 'lucas-best': value, 'lucas-keepy-best': value } });
      assert.equal(browser.state.best, 0);
    }
  });
  test(`${game}: high-density resizing keeps game coordinates intact`, () => {
    const b = createBrowser({ game, width: 360, density: 2 });
    assert.equal(b.canvas.width, 720);
    b.action('play'); b.pause.emit('click');
    const position = { x: b.state.ball.x, y: b.state.ball.y };
    b.resize(1000, 2); assert.equal(b.canvas.width, 2000);
    assert.deepEqual({ x: b.state.ball.x, y: b.state.ball.y }, position);
    assert(b.calls.some(call => call[0] === 'setTransform'));
  });
  test(`${game}: pause freezes gameplay and resume returns focus`, () => {
    const b = createBrowser({ game }); b.action('play'); b.tick(100); b.pause.emit('click');
    const snapshot = JSON.stringify(b.state); b.tick(2000);
    assert.equal(JSON.stringify(b.state), snapshot); assert.equal(b.overlay.hidden, false);
    b.action('resume'); assert.equal(b.document.activeElement, b.canvas); assert.equal(b.overlay.hidden, true);
  });
  test(`${game}: leaving the game pauses without stealing focus`, () => {
    const b = createBrowser({ game }); b.action('play'); b.mute.focus(); b.intersect(false);
    assert.equal(b.document.activeElement, b.mute); assert.equal(b.overlay.hidden, false);
    const snapshot = JSON.stringify(b.state); b.tick(2000); assert.equal(JSON.stringify(b.state), snapshot);
    b.intersect(true); assert.equal(b.overlay.hidden, false); b.action('resume');
    b.visibility(true); assert.equal(b.overlay.hidden, false);
  });
  test(`${game}: sound button and unrelated keys do not play`, () => {
    const b = createBrowser({ game }); b.action('play'); b.mute.focus();
    const snapshot = JSON.stringify(b.state); b.key(' '); b.key('ArrowUp');
    assert.equal(JSON.stringify(b.state), snapshot);
    b.canvas.focus(); b.key(' ', { ctrlKey: true }); assert.equal(JSON.stringify(b.state), snapshot);
  });
  test(`${game}: sound preference follows another tab`, () => {
    const b = createBrowser({ game }); b.setStored('lucas-muted', '1');
    assert.equal(b.mute.textContent, 'Sound off'); assert.equal(b.mute.attrs['aria-pressed'], 'false');
  });
  test(`${game}: missing canvas support produces a readable fallback`, () => {
    const b = createBrowser({ game, canvasSupport: false });
    assert.match(b.overlay.innerHTML, /another browser/); assert.equal(b.pause.disabled, true);
  });
}

test('penalty: three misses end the game and replay resets it', () => {
  const b = createBrowser(); b.action('play');
  for (let i = 1; i <= 3; i++) {
    b.state.aim = { x: 120, y: 30 }; b.key(' '); b.tick(2100);
    assert.equal(b.state.misses, i);
  }
  assert.equal(b.state.state, 'over'); assert.equal(b.pause.disabled, true);
  assert.match(b.overlay.innerHTML, /Full time/);
  b.action('play'); assert.equal(b.state.misses, 0); assert.equal(b.state.score, 0);
});

test('keepy: keyboard repeat does not inflate the score', () => {
  const b = createBrowser({ game: 'keepy' }); b.action('play'); b.key(' ');
  assert.equal(b.state.hits, 1); b.tick(150); b.key(' ', { repeat: true });
  assert.equal(b.state.hits, 1);
});

test('keepy: an old end-of-round timer cannot interrupt a fresh game', () => {
  const b = createBrowser({ game: 'keepy' }); b.action('play');
  b.state.ball.y = 500; b.tick(20); assert.equal(b.state.state, 'over');
  b.key(' '); b.tick(350); b.key(' '); b.tick(310);
  assert.equal(b.state.state, 'play'); assert.equal(b.overlay.hidden, true);
});

test('keepy: star bonuses update score, radius and saved best together', () => {
  const b = createBrowser({ game: 'keepy' }); b.action('play');
  b.state.star = { x: b.state.ball.x, y: b.state.ball.y, t: 0 }; b.tick(16);
  assert.equal(b.state.stars, 1); assert.equal(b.state.touches, 3); assert.equal(b.state.hits, 0);
  assert(b.state.ball.r < 42); assert.equal(b.stored.get('lucas-keepy-best'), '3');
});

test('keepy: touch target stays usable on a small screen', () => {
  const b = createBrowser({ game: 'keepy', width: 280 }); b.action('play');
  b.canvas.emit('pointerdown', { clientX: b.state.ball.x * 280 / 800 + 22, clientY: b.state.ball.y * 280 / 800 });
  assert.equal(b.state.hits, 1);
});

test('keepy: reduced-motion mode has no idle bounce or screen shake', () => {
  const b = createBrowser({ game: 'keepy', reducedMotion: true });
  const y = b.state.ball.y; b.tick(1000); assert.equal(b.state.ball.y, y);
  b.action('play'); b.state.ball.y = 500; b.tick(20); assert.equal(b.state.shake, 0); assert.equal(b.state.dust.length, 0);
});
