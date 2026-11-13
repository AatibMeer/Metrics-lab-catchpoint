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

function lab({ mode = "both", storage = new Map(), blockedStorage = false, nextPage = false, apiError = false,
  debug = false, queued = true, sendError = false, suppressSend = false } = {}) {
  const nodes = new Map();
  const query = selector => {
    if (!nodes.has(selector)) nodes.set(selector, element());
    return nodes.get(selector);
  };
  const resetButtons = ["rumtesting1", "rumtesting2"].map(token => element({ dataset: { rumReset: token } }));
  const actions = ["submit", "reset", "burst"].map(action => {
    const button = query('[data-rum-action="' + action + '"]');
    button.dataset.rumAction = action;
    return button;
  });
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
  const sendCalls = [];
  const beaconCalls = [];
  let pendingIndicators = {};
  const timers = [];
  const pathname = nextPage ? "/pages/rum-indicators-next.html" : "/pages/rum-indicators.html";
  const search = "?initial=" + mode + (debug ? "&GlimpseDebug=1" : "");
  const location = { href: "https://example.test" + pathname + search, pathname, search };
  location.assign = value => { location.assigned = value; };
  let observerCallback;
  class Observer {
    constructor(callback) { observerCallback = callback; }
    observe() {}
  }
  const nativeBeacon = function (...args) { beaconCalls.push(args); return queued; };
  const window = eventTarget({
    location,
    navigator: { sendBeacon: nativeBeacon },
    sessionStorage: {
      getItem(key) { if (blockedStorage) throw Error("Storage blocked"); return storage.get(key) || null; },
      setItem(key, value) { if (blockedStorage) throw Error("Storage blocked"); storage.set(key, value); }
    },
    setTimeout(callback) { timers.push(callback); }, PerformanceObserver: Observer
  });
  vm.runInNewContext(source, { window, document, performance: { now: () => 42 }, URLSearchParams, URL, Blob,
    PerformanceObserver: Observer, Math: Object.assign(Object.create(Math), { random: () => 0 }) });
  function installHook() {
    window.RProfiler.sendData = function () {
      sendCalls.push("sendData");
      if (sendError) throw Error("Test debug send failure");
      if (suppressSend) return;
      window.navigator.sendBeacon("https://rjs.3gl.net/hawklogserver/r.p?a_s=1",
        JSON.stringify({ ind: pendingIndicators, ui: "do-not-log-user-id" }));
      pendingIndicators = {};
    };
  }
  return {
    storage, calls, sendCalls, beaconCalls, nativeBeacon, installHook, window, document, query, resetButtons, actions, timers, next,
    ready({ hook = true } = {}) {
      window.RProfiler = {
        addInfo(...args) {
          if (apiError) throw Error("Test API failure");
          calls.push(args);
          pendingIndicators[args[1]] = args[2];
        }, usePageHide() {}
      };
      if (hook) installHook();
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

test("normal mode never installs transport observation or calls an available debug hook", () => {
  const app = lab();
  app.ready();
  app.mount();
  app.actions[0].emit("click");
  assert.equal(app.window.navigator.sendBeacon, app.nativeBeacon);
  assert.equal(app.sendCalls.length, 0);
  assert.equal(app.beaconCalls.length, 0);
  assert.equal(app.query("[data-rum-debug-warning]").hidden, true);
  assert.match(app.query("[data-rum-send-status]").textContent, /registered only/);
});

test("debug submit sends the current reset values once, without navigation", () => {
  const app = lab({ debug: true });
  app.ready();
  app.mount();
  const href = app.window.location.href;
  app.actions[1].emit("click");
  assert.equal(app.sendCalls.length, 0);
  app.actions[0].emit("click");
  assert.equal(app.sendCalls.length, 1);
  assert.equal(app.beaconCalls.length, 1);
  assert.deepEqual(JSON.parse(app.beaconCalls[0][1]).ind, { rumtesting1: 1001, rumtesting2: 1001 });
  assert.deepEqual(JSON.parse(app.query("[data-rum-last-payload]").textContent), { rumtesting1: 1001, rumtesting2: 1001 });
  assert.match(app.query("[data-rum-send-status]").textContent, /Browser queued/);
  assert.doesNotMatch(JSON.stringify(app.history()), /do-not-log-user-id/);
  assert.equal(app.window.location.href, href);
  assert.equal(app.window.location.assigned, undefined);
});

test("every debug click re-registers both values after the SDK clears collected data", () => {
  const app = lab({ debug: true });
  app.ready();
  app.mount();
  app.actions[0].emit("click");
  app.resetButtons[0].emit("click");
  app.actions[0].emit("click");
  assert.equal(app.beaconCalls.length, 2);
  assert.deepEqual(JSON.parse(app.beaconCalls[1][1]).ind, { rumtesting1: 1001, rumtesting2: 1000 });
});

test("debug submit waits for a delayed hook and blocks a missing or removed hook", () => {
  const app = lab({ debug: true });
  app.ready({ hook: false });
  app.mount();
  assert.equal(app.actions[0].disabled, true);
  app.installHook();
  app.timers[1]();
  assert.equal(app.actions[0].disabled, false);
  delete app.window.RProfiler.sendData;
  const callsBefore = app.calls.length;
  app.actions[0].emit("click");
  assert.equal(app.calls.length, callsBefore);
  assert.equal(app.sendCalls.length, 0);
  assert.match(app.query("[data-rum-send-status]").textContent, /unavailable/);
});

test("debug hook timeout remains disabled without a fallback send", () => {
  const app = lab({ debug: true });
  app.ready({ hook: false });
  app.mount();
  for (let index = 0; index < app.timers.length; index += 1) app.timers[index]();
  assert.equal(app.actions[0].disabled, true);
  assert.match(app.query("[data-rum-send-status]").textContent, /unavailable/);
  assert.equal(app.sendCalls.length, 0);
});

test("a failed registration prevents a partial debug send", () => {
  const app = lab({ debug: true, apiError: true });
  app.ready();
  app.mount();
  app.actions[0].emit("click");
  assert.equal(app.sendCalls.length, 0);
  assert.match(app.query("[data-rum-send-status]").textContent, /Registration failed/);
});

test("debug transport rejection and hook errors are not reported as success", () => {
  const rejected = lab({ debug: true, queued: false });
  rejected.ready();
  rejected.mount();
  rejected.actions[0].emit("click");
  assert.match(rejected.query("[data-rum-send-status]").textContent, /rejected/);
  assert.equal(rejected.window.navigator.sendBeacon("https://example.test/other", "x"), false);
  const failed = lab({ debug: true, sendError: true });
  failed.ready();
  failed.mount();
  failed.actions[0].emit("click");
  assert.match(failed.query("[data-rum-send-status]").textContent, /failed/);
});

test("a debug hook that sends nothing reports no observed send instead of success", () => {
  const app = lab({ debug: true, suppressSend: true });
  app.ready();
  app.mount();
  app.actions[0].emit("click");
  assert.equal(app.beaconCalls.length, 0);
  assert.match(app.query("[data-rum-send-status]").textContent, /no sendBeacon call observed/);
});

test("debug mode is preserved across pages and can be disabled by reloading normally", () => {
  const app = lab({ debug: true, mode: "first" });
  app.mount();
  assert.match(app.next.href, /initial=first&GlimpseDebug=1$/);
  assert.equal(app.query("[data-rum-debug-warning]").hidden, false);
  app.query("[data-rum-delivery-mode]").value = "normal";
  app.query("[data-rum-delivery-mode]").emit("change");
  assert.equal(new URL(app.window.location.assigned).searchParams.has("GlimpseDebug"), false);
  assert.equal(new URL(app.window.location.assigned).searchParams.get("initial"), "first");
});

test("debug beacon observation forwards unrelated and undecodable payloads without changing them", () => {
  const app = lab({ debug: true });
  app.mount();
  assert.equal(app.window.navigator.sendBeacon("https://example.test/other", "secret"), true);
  assert.equal(app.query("[data-rum-last-payload]").textContent, "No collector payload observed");
  assert.equal(app.window.navigator.sendBeacon("https://rjs.3gl.net/hawklogserver/r.p", "not-json"), true);
  assert.deepEqual(app.beaconCalls.at(-1), ["https://rjs.3gl.net/hawklogserver/r.p", "not-json"]);
  assert.match(app.query("[data-rum-last-payload]").textContent, /could not be decoded/);
});
