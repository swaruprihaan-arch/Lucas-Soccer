const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createBrowser({ game = 'penalty', blockedStorage = false, saved = {}, reducedMotion = false, width = 800, density = 1, canvasSupport = true } = {}) {
  let time = 0, nextId = 1, seed = 9281;
  const frames = new Map(), timers = new Map(), observers = [], resizeObservers = [];
  const stored = new Map(Object.entries(saved));
  const calls = [];
  const context = new Proxy({}, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === 'createLinearGradient') return () => ({ addColorStop() {} });
      return (...args) => calls.push([key, ...args]);
    },
    set(target, key, value) { target[key] = value; return true; }
  });
  let document;
  class Element {
    constructor(name = '') {
      this.name = name; this.style = {}; this.attrs = {}; this.events = new Map(); this.children = [];
      this.dataset = {}; this.textContent = ''; this.hidden = false; this.disabled = false;
      this.width = 800; this.height = game === 'penalty' ? 480 : 520; this._html = '';
    }
    set innerHTML(value) {
      this._html = value;
      const match = value.match(/data-action="([^"]+)"/);
      if (match) { this.button = new Element('overlay-button'); this.button.dataset.action = match[1]; }
    }
    get innerHTML() { return this._html; }
    addEventListener(type, fn) { const list = this.events.get(type) || []; list.push(fn); this.events.set(type, list); }
    emit(type, data = {}) {
      const event = { target: this, button: 0, isPrimary: true, key: '', repeat: false, preventDefault() { this.prevented = true; }, ...data };
      (this.events.get(type) || []).forEach(fn => fn(event));
      return event;
    }
    setAttribute(key, value) { this.attrs[key] = String(value); }
    getAttribute(key) { return this.attrs[key]; }
    focus() { document.activeElement = this; }
    closest(selector) {
      if (selector === '.game-frame') return frame;
      if (selector === 'button') return this.dataset.action ? this : null;
      return selector === `[data-action="${this.dataset.action}"]` ? this : null;
    }
    querySelector(selector) { if (selector === 'button' && this.button) return this.button; return query(selector); }
    querySelectorAll(selector) { return selector === 'button' ? [mute, pause] : []; }
    getBoundingClientRect() { return { left: 0, top: 0, width, height: width * (game === 'penalty' ? 480 : 520) / 800 }; }
    getContext() { return canvasSupport ? context : null; }
  }
  const canvas = new Element('canvas'), section = new Element('section'), frame = new Element('frame'), overlay = new Element('overlay');
  overlay.innerHTML = '<button data-action="play">Kick off</button>';
  const mute = new Element('mute'), pause = new Element('pause');
  mute.dataset.action = 'mute'; pause.dataset.action = 'pause';
  const outputs = {};
  function query(selector) {
    if (selector === '.ball' || selector === '.pitch') return null;
    if (selector === '#game') return section;
    if (selector === 'canvas' || selector === '#keepy') return canvas;
    if (selector === '.game-overlay') return overlay;
    if (selector === '[data-action="mute"]') return mute;
    if (selector === '[data-action="pause"]') return pause;
    const match = selector.match(/^\[data-out="(.+)"\]$/);
    if (match) return outputs[match[1]] ||= new Element(match[1]);
    return null;
  }
  document = new Element('document');
  document.querySelector = query; document.getElementById = id => query(`#${id}`);
  document.hidden = false; document.activeElement = null;
  const window = new Element('window');
  window.devicePixelRatio = density;
  const motion = { matches: reducedMotion, addEventListener() {} };
  window.matchMedia = () => motion;
  function IntersectionObserver(callback) { this.observe = () => observers.push(callback); }
  function ResizeObserver(callback) { this.observe = () => resizeObservers.push(callback); }
  window.IntersectionObserver = IntersectionObserver; window.ResizeObserver = ResizeObserver;
  const math = Object.create(Math); math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const sandbox = {
    window, document, IntersectionObserver, ResizeObserver, Number, Math: math,
    performance: { now: () => time },
    localStorage: {
      getItem(key) { if (blockedStorage) throw Error('Storage denied'); return stored.get(key) ?? null; },
      setItem(key, value) { if (blockedStorage) throw Error('Storage denied'); stored.set(key, String(value)); }
    },
    Image: class extends Element {},
    requestAnimationFrame(fn) { const id = nextId++; frames.set(id, fn); return id; },
    cancelAnimationFrame(id) { frames.delete(id); },
    setTimeout(fn, delay) { const id = nextId++; timers.set(id, { fn, at: time + delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  };
  vm.createContext(sandbox);
  function run(file) { vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), sandbox, { filename: file }); }
  run('site.js'); run(game === 'penalty' ? 'game.js' : 'keepy.js');
  const state = game === 'penalty' ? window.penalty : window.keepy;
  return {
    state, canvas, overlay, mute, pause, outputs, window, document, calls, stored, motion,
    action(action) {
      const target = new Element('action'); target.dataset.action = action;
      overlay.emit('click', { target });
    },
    key(key, options = {}) {
      const target = document.activeElement || document;
      const event = target.emit('keydown', { key, ...options });
      document.emit('keydown', { ...event, target });
      return event;
    },
    tick(milliseconds = 1000, fps = 60) {
      const end = time + milliseconds;
      while (time < end) {
        time = Math.min(end, time + 1000 / fps);
        const ready = [...frames.values()]; frames.clear(); ready.forEach(fn => fn(time));
        for (const [id, timer] of [...timers]) if (timer.at <= time) { timers.delete(id); timer.fn(); }
      }
    },
    visibility(hidden) { document.hidden = hidden; document.emit('visibilitychange'); },
    intersect(visible) { observers.forEach(callback => callback([{ isIntersecting: visible }])); },
    resize(newWidth, newDensity = density) { width = newWidth; window.devicePixelRatio = newDensity; resizeObservers.forEach(callback => callback()); },
    setStored(key, value) { stored.set(key, value); window.emit('storage', { key }); }
  };
}
module.exports = { createBrowser };
