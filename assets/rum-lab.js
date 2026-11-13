(function () {
  "use strict";

  var storageKey = "catchpoint-rum-indicator-lab-v1";
  var tokens = ["rumtesting1", "rumtesting2"];
  var params = new URLSearchParams(window.location.search);
  var mode = params.get("initial") || "both";
  var debugSending = Boolean(params.get("GlimpseDebug"));
  if (["both", "first", "none"].indexOf(mode) === -1) {
    mode = "both";
  }

  var previous = {};
  var storageAvailable = true;
  try {
    previous = JSON.parse(window.sessionStorage.getItem(storageKey) || "{}");
    if (!previous || typeof previous !== "object") {
      previous = {};
    }
  } catch (error) {
    storageAvailable = false;
  }

  var pageName = /rum-indicators-next\.html$/.test(window.location.pathname) ? "Page 2" : "Page 1";
  var visitId = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
  var history = Array.isArray(previous.history) ? previous.history.slice(-200) : [];
  var values = {};
  var calls = {};
  var ready = false;
  var mounted = false;
  var status = "Waiting for RProfiler";
  var requests = 0;
  var seenResources = {};
  var debugHookReady = false;
  var beaconAttempts = 0;
  var sendStatus = debugSending ? "Waiting for debug sendData hook" : "No manual send requested";
  var lastPayload = "No collector payload observed";

  function newNumber(oldValue) {
    var value = Math.floor(Math.random() * 9000) + 1000;
    return value === oldValue ? (value === 9999 ? 1000 : value + 1) : value;
  }

  tokens.forEach(function (token) {
    values[token] = newNumber(previous.values && previous.values[token]);
    calls[token] = "Not called on this page";
  });

  function save() {
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify({ history: history, values: values }));
    } catch (error) {
      storageAvailable = false;
    }
  }

  function log(event, token, value, detail) {
    // A restored bfcache document must pick up events saved by the other page.
    try {
      var stored = JSON.parse(window.sessionStorage.getItem(storageKey) || "{}");
      if (stored && Array.isArray(stored.history)) {
        history = stored.history.slice(-200);
      }
    } catch (error) {
      storageAvailable = false;
    }
    history.push({
      time: new Date().toISOString(),
      elapsedMs: Math.round(performance.now()),
      page: pageName,
      visit: visitId,
      event: event,
      token: token || "",
      value: value === undefined ? null : value,
      detail: detail || ""
    });
    history = history.slice(-200);
    save();
    render();
  }

  function text(selector, value) {
    var element = document.querySelector(selector);
    if (element) {
      element.textContent = value;
    }
  }

  function render() {
    if (!mounted) {
      return;
    }
    text("[data-rum-status]", status);
    text("[data-rum-requests]", requests);
    text("[data-rum-visibility]", document.visibilityState);
    text("[data-rum-storage]", storageAvailable ? "This tab's history" : "History cannot persist: storage unavailable");
    text("[data-rum-send-status]", sendStatus);
    text("[data-rum-last-payload]", lastPayload);
    tokens.forEach(function (token) {
      text('[data-rum-value="' + token + '"]', values[token]);
      text('[data-rum-call="' + token + '"]', calls[token]);
    });
    document.querySelectorAll("[data-rum-action]").forEach(function (button) {
      button.disabled = !ready || (debugSending && button.dataset.rumAction === "submit" && !debugHookReady);
    });

    var body = document.querySelector("[data-rum-history]");
    var fragment = document.createDocumentFragment();
    history.slice().reverse().forEach(function (entry) {
      var row = document.createElement("tr");
      [new Date(entry.time).toLocaleTimeString(), entry.page + " / " + entry.elapsedMs + " ms", entry.event,
        entry.token || "-", entry.value === null ? "-" : entry.value, entry.detail].forEach(function (value) {
        var cell = document.createElement("td");
        cell.textContent = value;
        row.appendChild(cell);
      });
      fragment.appendChild(row);
    });
    body.replaceChildren(fragment);
  }

  function submit(token, reason) {
    var profiler = window.RProfiler;
    if (!ready || !profiler || typeof profiler.addInfo !== "function") {
      log("API unavailable", token, values[token], reason);
      return false;
    }
    try {
      profiler.addInfo("indicator", token, values[token]);
      calls[token] = reason + " at " + Math.round(performance.now()) + " ms: " + values[token];
      log("addInfo returned", token, values[token], reason + "; delivery not confirmed");
      return true;
    } catch (error) {
      calls[token] = "API threw an error";
      log("addInfo error", token, values[token], String(error.message || error));
      return false;
    }
  }

  function isCollectorUrl(value) {
    try {
      var url = new URL(value, window.location.href);
      return /(^|\.)3gl\.net$/i.test(url.hostname) && /\/hawklogserver\/(?:\d+\/)?r\.p$/i.test(url.pathname);
    } catch (error) {
      return false;
    }
  }

  function observeDebugBeacon(body, queued) {
    beaconAttempts += 1;
    var indicators = {};
    try {
      var payload = JSON.parse(body);
      tokens.forEach(function (token) {
        if (payload.ind && typeof payload.ind[token] === "number") {
          indicators[token] = payload.ind[token];
        }
      });
      lastPayload = JSON.stringify(indicators, null, 2);
    } catch (error) {
      lastPayload = "Payload could not be decoded; inspect Network";
    }
    sendStatus = queued ? "Browser queued a collector beacon; delivery not confirmed" : "Browser rejected the beacon queue request";
    log("Debug collector sendBeacon", "", undefined,
      "queued=" + queued + "; ind=" + JSON.stringify(indicators) + "; receipt not confirmed");
  }

  // Debug only: forward the original transport unchanged and expose just our demo indicators.
  if (debugSending) {
    try {
      var nativeSendBeacon = window.navigator && window.navigator.sendBeacon;
      if (typeof nativeSendBeacon === "function") {
        window.navigator.sendBeacon = function (url, body) {
          var queued = nativeSendBeacon.apply(this, arguments);
          try {
            if (isCollectorUrl(url)) {
              observeDebugBeacon(body, queued);
            }
          } catch (error) {
            // Observation must not change the vendor transport's return value.
          }
          return queued;
        };
      } else {
        log("Debug beacon observer unavailable", "", undefined, "Check collector requests in Network");
      }
    } catch (error) {
      log("Debug beacon observer unavailable", "", undefined, String(error.message || error));
    }
  }

  function waitForDebugHook(attemptsRemaining) {
    if (window.RProfiler && typeof window.RProfiler.sendData === "function") {
      debugHookReady = true;
      sendStatus = "Debug sendData ready; no manual send requested";
      log("Debug sendData ready", "", undefined, "Experimental; normal automatic collection is altered");
    } else if (attemptsRemaining > 0) {
      window.setTimeout(function () { waitForDebugHook(attemptsRemaining - 1); }, 250);
    } else {
      sendStatus = "Debug sendData unavailable; no send attempted";
      log("Debug sendData unavailable", "", undefined, "The vendor tag may have changed; reload to retry");
    }
  }

  function submitCurrentValues() {
    var profiler = window.RProfiler;
    if (debugSending && (!profiler || typeof profiler.sendData !== "function")) {
      debugHookReady = false;
      sendStatus = "Debug sendData unavailable; no send attempted";
      log("Debug send blocked", "", undefined, "No sendData hook; no navigation or fallback send");
      return;
    }
    var registered = true;
    tokens.forEach(function (token) {
      if (!submit(token, "Submit current value")) {
        registered = false;
      }
    });
    if (!registered) {
      sendStatus = "Registration failed; no manual send attempted";
      render();
      return;
    }
    if (!debugSending) {
      sendStatus = "Current values registered only; no beacon was forced";
      render();
      return;
    }
    var attemptsBefore = beaconAttempts;
    sendStatus = "Calling debug sendData; delivery not confirmed";
    log("Debug send requested", "", undefined, "Current values: " + JSON.stringify(values));
    try {
      profiler.sendData();
      if (beaconAttempts === attemptsBefore) {
        sendStatus = "Debug hook returned; no sendBeacon call observed. Check Network and app settings";
      }
      log("Debug sendData returned", "", undefined, "No navigation; collection and receipt not guaranteed");
    } catch (error) {
      sendStatus = "Debug sendData failed";
      log("Debug sendData error", "", undefined, String(error.message || error));
    }
  }

  function initializeProfiler() {
    if (ready || !window.RProfiler || typeof window.RProfiler.addInfo !== "function") {
      return;
    }
    ready = true;
    status = "RProfiler ready";
    log("RProfiler ready", "", undefined, "Initial mode: " + mode);
    try {
      if (typeof window.RProfiler.usePageHide === "function") {
        window.RProfiler.usePageHide();
        log("usePageHide enabled");
      } else {
        log("usePageHide unavailable");
      }
    } catch (error) {
      log("usePageHide error", "", undefined, String(error.message || error));
    }
    tokens.forEach(function (token, index) {
      if (mode === "both" || (mode === "first" && index === 0)) {
        submit(token, "Initial registration");
      }
    });
    if (debugSending) {
      waitForDebugHook(80);
    }
  }

  log("New document", "", undefined, window.location.pathname + window.location.search);
  tokens.forEach(function (token) {
    log("Number generated", token, values[token], "Initial display value");
  });

  // Register in the head before the deferred vendor tag can send its first beacon.
  window.addEventListener("GlimpseLoaded", initializeProfiler);
  initializeProfiler();

  document.addEventListener("error", function (event) {
    if (event.target && event.target.matches && event.target.matches("script[data-rum-tag]")) {
      status = "RUM tag failed to load";
      log("RUM tag load error");
    }
  }, true);

  window.setTimeout(function () {
    if (!ready && status === "Waiting for RProfiler") {
      status = "RProfiler unavailable after 10 seconds";
      log("RProfiler still unavailable", "", undefined, "Check the tag request, blockers, and connection");
    }
  }, 10000);

  // Observe completed collector requests without intercepting any vendor transport.
  function observeResource(entry) {
    if (!isCollectorUrl(entry.name)) {
      return;
    }
    var key = entry.name + ":" + entry.startTime;
    if (seenResources[key]) {
      return;
    }
    seenResources[key] = true;
    requests += 1;
    log("Collector resource observed", "", undefined,
      entry.initiatorType + "; started " + Math.round(entry.startTime) + " ms; payload and receipt not verified");
  }

  if (typeof window.PerformanceObserver === "function") {
    try {
      var observer = new PerformanceObserver(function (list) {
        list.getEntries().forEach(observeResource);
      });
      observer.observe({ type: "resource", buffered: true });
    } catch (error) {
      log("Resource observer unavailable");
    }
  }

  document.addEventListener("visibilitychange", function () {
    log("visibilitychange", "", undefined, document.visibilityState);
  });
  window.addEventListener("pagehide", function (event) {
    log("pagehide", "", undefined, "persisted=" + event.persisted);
  });
  window.addEventListener("pageshow", function (event) {
    log("pageshow", "", undefined, "persisted=" + event.persisted);
  });

  function mount() {
    mounted = true;
    text("[data-rum-page]", pageName);
    text("[data-rum-visit]", visitId);
    var deliveryMode = document.querySelector("[data-rum-delivery-mode]");
    deliveryMode.value = debugSending ? "debug" : "normal";
    deliveryMode.addEventListener("change", function () {
      var url = new URL(window.location.href);
      if (deliveryMode.value === "debug") {
        url.searchParams.set("GlimpseDebug", "1");
      } else {
        url.searchParams.delete("GlimpseDebug");
      }
      window.location.assign(url.href);
    });
    document.querySelector("[data-rum-debug-warning]").hidden = !debugSending;
    document.querySelector("[data-rum-debug-payload]").hidden = !debugSending;
    text('[data-rum-action="submit"]', debugSending ? "Send current values (debug)" : "Register current values");
    var initialMode = document.querySelector("[data-rum-mode]");
    initialMode.value = mode;
    initialMode.addEventListener("change", function () {
      var url = new URL(window.location.href);
      url.searchParams.set("initial", initialMode.value);
      window.location.assign(url.href);
    });
    document.querySelectorAll("[data-rum-next]").forEach(function (link) {
      var url = new URL(link.getAttribute("href"), window.location.href);
      url.searchParams.set("initial", mode);
      if (debugSending) {
        url.searchParams.set("GlimpseDebug", params.get("GlimpseDebug"));
      }
      link.href = url.href;
      link.addEventListener("click", function () {
        log("Navigation selected", "", undefined, url.pathname);
      });
    });
    document.querySelectorAll("[data-rum-reset]").forEach(function (button) {
      button.addEventListener("click", function () {
        var token = button.dataset.rumReset;
        values[token] = newNumber(values[token]);
        submit(token, "Reset number");
      });
    });
    document.querySelector('[data-rum-action="submit"]').addEventListener("click", submitCurrentValues);
    document.querySelector('[data-rum-action="reset"]').addEventListener("click", function () {
      tokens.forEach(function (token) {
        values[token] = newNumber(values[token]);
        submit(token, "Reset both");
      });
    });
    document.querySelector('[data-rum-action="burst"]').addEventListener("click", function () {
      for (var round = 1; round <= 3; round += 1) {
        tokens.forEach(function (token) {
          values[token] = newNumber(values[token]);
          submit(token, "Repeated update " + round + "/3");
        });
      }
    });
    document.querySelector("[data-rum-clear]").addEventListener("click", function () {
      history = [];
      save();
      log("Local history cleared", "", undefined, "RProfiler data was not cleared");
    });
    document.querySelector("[data-rum-download]").addEventListener("click", function () {
      var blob = new Blob([JSON.stringify({ visit: visitId, values: values, history: history }, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var link = document.createElement("a");
      link.href = url;
      link.download = "rum-indicator-history-" + visitId + ".json";
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    });
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
