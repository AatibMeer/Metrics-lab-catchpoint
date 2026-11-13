const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");

const source = readFileSync(join(__dirname, "../assets/rum-lab.js"), "utf8");
const storageKey = "catchpoint-rum-indicator-lab-v1";

function eventTarget(extra = {}) {
  const listeners = {};
  return Object.assign({
    addEventListener(name, callback) { (listeners[name] ||= []).push(callback); },
    emit(name, event = {}) { (listeners[name] || []).forEach(callback => callback(event)); }
  }, extra);
}

function element(extra = {}) {
  return eventTarget(Object.assign({
    textContent: "", children: [], disabled: true, dataset: {},
    appendChild(child) { this.children.push(child); },
    replaceChildren(fragment) { this.children = fragment.children; }
  }, extra));
}

function lab({ mode = "both", storage = new Map(), blockedStorage = false, nextPage = false, apiError = false } = {}) {
  const nodes = new Map();
  const query = selector => {
    if (!nodes.has(selector)) nodes.set(selector, element());
    return nodes.get(selector);
  };
  const resetButtons = ["rumtesting1", "rumtesting2"].map(token => element({ dataset: { rumReset: token } }));
  const actions = ["submit", "reset", "burst"].map(action => query('[data-rum-action="' + action + '"]'));
  const next = element({ getAttribute: () => nextPage ? "rum-indicators.html" : "rum-indicators-next.html" });
  const document = eventTarget({
    readyState: "loading", visibilityState: "visible", querySelector: query,
    querySelectorAll(selector) {
      if (selector === "[data-rum-action]") return [...resetButtons, ...actions];
      if (selector === "[data-rum-reset]") return resetButtons;
      if (selector === "[data-rum-next]") return [next];
      return [];
    },
    createDocumentFragment: () => element(), createElement: () => element()
  });
  const calls = [];
  const timers = [];
  const pathname = nextPage ? "/pages/rum-indicators-next.html" : "/pages/rum-indicators.html";
  const location = { href: "https://example.test" + pathname + "?initial=" + mode, pathname, search: "?initial=" + mode };
  location.assign = value => { location.assigned = value; };
  let observerCallback;
  class Observer {
    constructor(callback) { observerCallback = callback; }
    observe() {}
  }
  const window = eventTarget({
    location,
    sessionStorage: {
      getItem(key) { if (blockedStorage) throw Error("Storage blocked"); return storage.get(key) || null; },
      setItem(key, value) { if (blockedStorage) throw Error("Storage blocked"); storage.set(key, value); }
    },
    setTimeout(callback) { timers.push(callback); }, PerformanceObserver: Observer
  });
  vm.runInNewContext(source, { window, document, performance: { now: () => 42 }, URLSearchParams, URL, Blob,
    PerformanceObserver: Observer, Math: Object.assign(Object.create(Math), { random: () => 0 }) });
  return {
    storage, calls, window, document, query, resetButtons, actions, timers, next,
    ready() {
      window.RProfiler = { addInfo(...args) { if (apiError) throw Error("Test API failure"); calls.push(args); }, usePageHide() {} };
      window.emit("GlimpseLoaded");
    },
    mount() { document.emit("DOMContentLoaded"); },
    history() { return JSON.parse(storage.get(storageKey)).history; },
    resources(entries) { observerCallback({ getEntries: () => entries }); }
  };
}

test("registers both exact tokens before DOMContentLoaded, once only", () => {
  const app = lab();
  assert.equal(app.calls.length, 0);
  app.ready();
  app.window.emit("GlimpseLoaded");
  assert.deepEqual(app.calls, [["indicator", "rumtesting1", 1000], ["indicator", "rumtesting2", 1000]]);
  app.mount();
  assert.equal(app.query('[data-rum-value="rumtesting1"]').textContent, 1000);
});

test("late modes omit initial calls and can add the second token later", () => {
  for (const mode of ["first", "none"]) {
    const app = lab({ mode });
    app.mount();
    app.ready();
    assert.equal(app.calls.length, mode === "first" ? 1 : 0);
    app.resetButtons[1].emit("click");
    assert.deepEqual(app.calls.at(-1), ["indicator", "rumtesting2", 1001]);
  }
});

test("individual reset changes only that indicator and submits the displayed value", () => {
  const app = lab();
  app.ready();
  app.mount();
  app.resetButtons[0].emit("click");
  assert.equal(app.calls.length, 3);
  assert.deepEqual(app.calls.at(-1), ["indicator", "rumtesting1", 1001]);
  assert.equal(app.query('[data-rum-value="rumtesting1"]').textContent, 1001);
  assert.equal(app.query('[data-rum-value="rumtesting2"]').textContent, 1000);
});

test("burst makes three ordered calls per token without coalescing", () => {
  const app = lab();
  app.ready();
  app.mount();
  app.actions[2].emit("click");
  assert.equal(app.calls.length, 8);
  assert.deepEqual(app.calls.slice(2), [
    ["indicator", "rumtesting1", 1001], ["indicator", "rumtesting2", 1001],
    ["indicator", "rumtesting1", 1000], ["indicator", "rumtesting2", 1000],
    ["indicator", "rumtesting1", 1001], ["indicator", "rumtesting2", 1001]
  ]);
});

test("navigation changes values, preserves history, and bfcache restoration does not re-register", () => {
  const first = lab();
  first.ready();
  first.mount();
  first.window.emit("pagehide", { persisted: true });
  const second = lab({ storage: first.storage, nextPage: true });
  second.ready();
  second.mount();
  assert.deepEqual(second.calls.map(call => call[2]), [1001, 1001]);
  first.window.emit("pageshow", { persisted: true });
  assert.equal(first.calls.length, 2);
  assert.ok(first.history().some(entry => entry.page === "Page 2"));
  assert.ok(first.history().some(entry => entry.event === "pagehide"));
});

test("reset-both and current-value submission each make two calls, not a flush", () => {
  const app = lab({ mode: "none" });
  app.ready();
  app.mount();
  app.actions[0].emit("click");
  assert.deepEqual(app.calls, [["indicator", "rumtesting1", 1000], ["indicator", "rumtesting2", 1000]]);
  app.actions[1].emit("click");
  assert.deepEqual(app.calls.slice(2).map(call => call[2]), [1001, 1001]);
  app.document.visibilityState = "hidden";
  app.document.emit("visibilitychange");
  app.window.emit("pagehide", { persisted: false });
  assert.equal(app.calls.length, 4);
});

test("blocked storage does not stop API calls and unavailable tag disables actions", () => {
  const blocked = lab({ blockedStorage: true });
  blocked.mount();
  blocked.ready();
  assert.equal(blocked.calls.length, 2);
  assert.match(blocked.query("[data-rum-storage]").textContent, /unavailable/);
  const missing = lab();
  missing.mount();
  missing.timers[0]();
  assert.ok(missing.actions.every(button => button.disabled));
  assert.match(missing.query("[data-rum-status]").textContent, /unavailable/);
});

test("records API errors without reporting success", () => {
  const app = lab({ apiError: true });
  app.mount();
  app.ready();
  assert.equal(app.history().filter(entry => entry.event === "addInfo error").length, 2);
  assert.equal(app.history().filter(entry => entry.event === "addInfo returned").length, 0);
});

test("counts only matching collector resources, once per entry", () => {
  const app = lab();
  app.mount();
  const beacon = { name: "https://rjs.3gl.net/hawklogserver/r.p?a=1", startTime: 10, initiatorType: "beacon" };
  app.resources([beacon, beacon, { ...beacon, name: "https://r.3gl.net/hawklogserver/15222/re.p" },
    { ...beacon, name: "https://g.3gl.net/jp/15222/latest/InitialLoadScript.js" }]);
  assert.equal(app.query("[data-rum-requests]").textContent, 1);
});

test("mode selection and next-page link retain the selected initial mode", () => {
  const app = lab({ mode: "first" });
  app.mount();
  assert.match(app.next.href, /rum-indicators-next\.html\?initial=first$/);
  app.query("[data-rum-mode]").value = "none";
  app.query("[data-rum-mode]").emit("change");
  assert.match(app.window.location.assigned, /initial=none$/);
});

test("history is bounded and clearing it does not clear RProfiler values", () => {
  const app = lab();
  app.ready();
  app.mount();
  for (let i = 0; i < 40; i += 1) app.actions[2].emit("click");
  assert.equal(app.history().length, 200);
  const count = app.calls.length;
  app.query("[data-rum-clear]").emit("click");
  assert.equal(app.history().length, 1);
  assert.equal(app.calls.length, count);
});
