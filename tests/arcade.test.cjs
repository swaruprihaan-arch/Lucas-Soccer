const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

function arcade() {
  let focused, timerId = 0;
  const timers = new Map();
  class Element {
    constructor() { this.children = []; this.handlers = {}; this.value = ''; this.style = {}; this.hidden = false; }
    addEventListener(type, fn) { this.handlers[type] = fn; }
    focus() { focused = this; }
    set innerHTML(html) {
      if (!html.includes('arcade-card')) return;
      this.children = [...html.matchAll(/data-id="(\d+)"/g)].map(match => {
        const card = new Element(); card.dataset = { id: match[1] }; card.link = new Element();
        card.querySelector = () => card.link; return card;
      });
    }
    appendChild(child) { this.children = this.children.filter(item => item !== child); this.children.push(child); }
  }
  const elements = new Map();
  const root = { querySelector(selector) { if (!elements.has(selector)) elements.set(selector, new Element()); return elements.get(selector); } };
  const sandbox = { window: {}, document: { getElementById: () => root }, location: {}, setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } };
  vm.createContext(sandbox);
  for (const file of ['games/games.js', 'arcade.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox);
  const input = elements.get('#arcade-search');
  return {
    search(value) { input.value = value; sandbox.window.arcade.run(); },
    visible() { return elements.get('.arcade-grid').children.filter(card => !card.hidden).map(card => +card.dataset.id); },
    submit() { elements.get('.arcade-search').handlers.submit({ preventDefault() {} }); },
    focusedId() { return elements.get('.arcade-grid').children.find(card => card.link === focused)?.dataset.id; },
    get pendingTimers() { return timers.size; },
    elements, input, get focused() { return focused; }
  };
}

test('arcade: description search understands common football terms', () => {
  const a = arcade(); a.search('shoot past the goalie'); assert.deepEqual(a.visible(), [1]);
  a.search('juggle the ball'); assert.equal(a.visible()[0], 2);
  a.submit(); assert.equal(a.focusedId(), '2');
});

test('arcade: numeric searches work with game prefixes and padding', () => {
  const a = arcade();
  for (const query of ['100', '#100', 'game 100', 'GAME #100']) { a.search(query); assert.deepEqual(a.visible(), [100]); }
  a.search('003'); assert.deepEqual(a.visible(), [3]);
  a.search('101'); assert.deepEqual(a.visible(), []);
});

test('arcade: clearing an empty result restores the games and focus', () => {
  const a = arcade(); a.search('nonexistent unicorn adventure'); assert.deepEqual(a.visible(), []);
  assert.equal(a.elements.get('.arcade-empty').hidden, false);
  a.elements.get('[data-arcade-showall]').handlers.click(); assert.equal(a.visible().length, 100);
  assert.equal(a.focused, a.input);
});

test('arcade: visual and tab order use the same ranked result', () => {
  const a = arcade(); a.search('keepy football'); assert.equal(a.visible()[0], 2);
  a.submit(); assert.equal(a.focusedId(), '2');
  a.search(''); assert.deepEqual(a.visible().slice(0, 3), [1, 2, 3]);
});

test('arcade: generic wording and Escape produce a useful default', () => {
  const a = arcade(); a.search('I want to play a game'); assert.equal(a.visible().length, 100);
  a.search('goalie'); a.input.handlers.keydown({ key: 'Escape', preventDefault() {} });
  assert.equal(a.visible().length, 100); assert.equal(a.input.value, '');
});


test('arcade: submitting immediately cancels the delayed search and preserves focus', () => {
  const a = arcade();
  a.input.value = 'keepy'; a.input.handlers.input();
  assert.equal(a.pendingTimers, 1);
  a.submit();
  assert.equal(a.pendingTimers, 0); assert.equal(a.focusedId(), '2');
});
