(function () {
  var page = document.body.dataset.page || "";
  var params = new URLSearchParams(window.location.search);

  document.querySelectorAll("[data-page-link]").forEach(function (link) {
    if (link.dataset.pageLink === page) {
      link.setAttribute("aria-current", "page");
    }
  });

  function busyWait(durationMs) {
    var end = performance.now() + durationMs;
    while (performance.now() < end) {
      Math.sqrt(Math.random() * 1000);
    }
  }

  function setText(selector, text) {
    var target = document.querySelector(selector);
    if (target) {
      target.textContent = text;
    }
  }

  if (page === "home") {
    setText("[data-build-time]", new Date().toLocaleString());
  }

  if (page === "performance") {
    var longTaskButton = document.querySelector("[data-run-long-task]");
    var layoutShiftButton = document.querySelector("[data-run-layout-shift]");

    function setBar(width, tone) {
      var bar = document.querySelector("[data-vital-bar]");
      if (bar) {
        bar.style.width = width + "%";
        bar.className = "bar" + (tone ? " " + tone : "");
      }
    }

    function runLongTask(durationMs) {
      setText("[data-scenario-status]", "Long task starting. The page will pause briefly, then report the measured delay.");
      setText("[data-vital-state]", "Starting");
      setText("[data-vital-time]", "0 ms");
      setText("[data-longtask-status]", "Running");
      setText("[data-longtask-copy]", "Main thread work is intentionally blocking the page.");
      setBar(22, "amber");

      window.setTimeout(function () {
        var start = performance.now();
        setText("[data-vital-state]", "Blocked");
        setBar(58, "coral");

        window.requestAnimationFrame(function () {
          busyWait(durationMs);
          var measured = Math.round(performance.now() - start);
          setText("[data-scenario-status]", "Long task completed and measured on the page.");
          setText("[data-vital-state]", "Completed");
          setText("[data-vital-time]", measured + " ms");
          setText("[data-longtask-status]", measured + " ms");
          setText("[data-longtask-copy]", "A controlled main-thread delay was completed.");
          setBar(100, "coral");
        });
      }, 180);
    }

    function insertLayoutShift() {
      var target = document.querySelector("[data-shift-target]");
      if (!target || document.querySelector("[data-shift-banner]")) {
        return;
      }

      setText("[data-scenario-status]", "Layout shift scenario active. Late content was inserted above the status panel.");
      setText("[data-vital-state]", "Shift inserted");
      setText("[data-vital-time]", "1100 ms");
      setText("[data-layout-status]", "Inserted");
      setText("[data-layout-copy]", "A late banner moved the content below it.");
      setBar(76, "amber");

      var alert = document.createElement("div");
      alert.className = "layout-shift-alert";
      alert.setAttribute("data-shift-banner", "true");
      alert.innerHTML = "<strong>Late synthetic banner</strong><span>This content was inserted after the page was already visible, so the status panel moves down.</span>";
      target.prepend(alert);
    }

    if (longTaskButton) {
      longTaskButton.addEventListener("click", function () {
        runLongTask(1600);
      });
    }

    if (layoutShiftButton) {
      layoutShiftButton.addEventListener("click", function () {
        window.setTimeout(insertLayoutShift, 650);
        setText("[data-scenario-status]", "Layout shift scheduled. Watch the status area move.");
        setText("[data-vital-state]", "Waiting");
        setText("[data-layout-status]", "Scheduled");
        setBar(34, "amber");
      });
    }

    if (params.get("slow") === "1") {
      runLongTask(1600);
    }

    if (params.get("shift") === "1") {
      window.setTimeout(function () {
        insertLayoutShift();
      }, 1100);
    }

    var inputButton = document.querySelector("[data-input-delay]");
    if (inputButton) {
      inputButton.addEventListener("click", function () {
        setText("[data-input-output]", "Processing input delay sample...");
        busyWait(520);
        setText("[data-input-output]", "Input processed after a controlled delay.");
      });
    }
  }

  if (page === "network") {
    var waterfall = document.querySelector("[data-waterfall]");
    var rows = [
      ["document", 210, "teal"],
      ["styles.css", 84, "blue"],
      ["network-map.svg", 132, "green"],
      ["app.js", 118, "amber"],
      ["missing-probe.png", 404, "coral"],
      ["lazy-asset-1", 280, "teal"],
      ["lazy-asset-2", 330, "blue"],
      ["third-party-slot", 460, "amber"]
    ];

    if (waterfall) {
      rows.forEach(function (row) {
        var item = document.createElement("div");
        var width = Math.min(100, Math.max(12, row[1] / 5));
        item.className = "waterfall-row";
        item.innerHTML =
          "<strong>" + row[0] + "</strong>" +
          "<span class=\"bar-track\"><span class=\"bar " + row[2] + "\" style=\"width:" + width + "%\"></span></span>" +
          "<span>" + row[1] + " ms</span>";
        waterfall.appendChild(item);
      });
    }

    if (params.get("burst") === "1") {
      var burst = document.querySelector("[data-burst-target]");
      if (burst) {
        for (var i = 0; i < 8; i += 1) {
          var img = document.createElement("img");
          img.src = "../assets/network-map.svg?burst=" + i;
          img.alt = "";
          img.loading = "eager";
          img.width = 80;
          img.height = 60;
          burst.appendChild(img);
        }
      }
    }
  }

  if (page === "journey") {
    var form = document.querySelector("[data-journey-form]");
    if (form) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        var data = new FormData(form);
        var payload = {
          name: data.get("name"),
          region: data.get("region"),
          journey: data.get("journey"),
          timestamp: new Date().toISOString()
        };
        window.localStorage.setItem("catchpoint-demo-journey", JSON.stringify(payload));
        setText("[data-journey-output]", "Journey saved for " + payload.name + " in " + payload.region + ".");
      });
    }
  }

  if (page === "shop") {
    var cart = [];
    var orderCounter = Number(window.localStorage.getItem("catchpoint-shop-order-count") || "1000");
    var money = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD"
    });
    var cartItems = document.querySelector("[data-cart-items]");
    var cartCount = document.querySelector("[data-cart-count]");
    var startCheckoutButton = document.querySelector("[data-start-checkout]");
    var checkoutForm = document.querySelector("[data-checkout-form]");
    var shippingMethod = document.querySelector("[data-shipping-method]");
    var orderConfirmation = document.querySelector("[data-order-confirmation]");

    function setShopStep(step) {
      document.querySelectorAll("[data-shop-step]").forEach(function (item) {
        item.dataset.active = item.dataset.shopStep === step ? "true" : "false";
      });
    }

    function getShipping() {
      if (!cart.length || !shippingMethod) {
        return 0;
      }

      var selectedOption = shippingMethod.options[shippingMethod.selectedIndex];
      return Number(selectedOption.dataset.price || 0);
    }

    function getTotals() {
      var subtotal = cart.reduce(function (sum, item) {
        return sum + item.price * item.quantity;
      }, 0);
      var shipping = getShipping();
      var tax = subtotal ? subtotal * 0.08 : 0;
      return {
        subtotal: subtotal,
        shipping: shipping,
        tax: tax,
        total: subtotal + shipping + tax
      };
    }

    function updateTotals() {
      var totals = getTotals();
      setText("[data-subtotal]", money.format(totals.subtotal));
      setText("[data-shipping]", money.format(totals.shipping));
      setText("[data-tax]", money.format(totals.tax));
      setText("[data-total]", money.format(totals.total));
    }

    function renderCart() {
      if (!cartItems) {
        return;
      }

      if (!cart.length) {
        cartItems.innerHTML = '<p class="empty-state">Your cart is empty.</p>';
        setText("[data-cart-count]", "0 items");
        if (startCheckoutButton) {
          startCheckoutButton.disabled = true;
        }
        if (checkoutForm) {
          checkoutForm.hidden = true;
        }
        if (orderConfirmation) {
          orderConfirmation.hidden = true;
        }
        setShopStep("browse");
        updateTotals();
        return;
      }

      cartItems.innerHTML = "";
      cart.forEach(function (item) {
        var row = document.createElement("div");
        row.className = "cart-item";
        row.innerHTML =
          '<div><strong>' + item.name + '</strong><span>Size ' + item.size + ' · ' + item.sku + '</span></div>' +
          '<div class="cart-item-actions">' +
          '<button type="button" data-qty-action="decrease" data-cart-key="' + item.key + '" aria-label="Decrease ' + item.name + ' quantity">-</button>' +
          '<span>' + item.quantity + '</span>' +
          '<button type="button" data-qty-action="increase" data-cart-key="' + item.key + '" aria-label="Increase ' + item.name + ' quantity">+</button>' +
          '<button type="button" data-qty-action="remove" data-cart-key="' + item.key + '" aria-label="Remove ' + item.name + '">Remove</button>' +
          '</div>' +
          '<strong>' + money.format(item.price * item.quantity) + '</strong>';
        cartItems.appendChild(row);
      });

      var itemCount = cart.reduce(function (sum, item) {
        return sum + item.quantity;
      }, 0);
      if (cartCount) {
        cartCount.textContent = itemCount + (itemCount === 1 ? " item" : " items");
      }
      if (startCheckoutButton) {
        startCheckoutButton.disabled = false;
      }
      updateTotals();
      setShopStep(checkoutForm && !checkoutForm.hidden ? "checkout" : "cart");
    }

    function addToCart(card) {
      var selectedSize = card.querySelector("input[type='radio']:checked");
      var message = card.querySelector("[data-product-message]");

      if (!selectedSize) {
        if (message) {
          message.textContent = "Select a size before adding to cart.";
          message.dataset.state = "warn";
        }
        setShopStep("browse");
        return;
      }

      var product = {
        id: card.dataset.productId,
        sku: card.dataset.productSku,
        name: card.dataset.productName,
        price: Number(card.dataset.productPrice),
        size: selectedSize.value
      };
      var key = product.id + "-" + product.size;
      var existing = cart.find(function (item) {
        return item.key === key;
      });

      if (existing) {
        existing.quantity += 1;
      } else {
        product.key = key;
        product.quantity = 1;
        cart.push(product);
      }

      if (message) {
        message.textContent = product.name + " size " + product.size + " added to cart.";
        message.dataset.state = "ok";
      }
      if (orderConfirmation) {
        orderConfirmation.hidden = true;
      }
      renderCart();
    }

    document.querySelectorAll("[data-product-card]").forEach(function (card) {
      card.querySelectorAll("input[type='radio']").forEach(function (radio) {
        radio.addEventListener("change", function () {
          var message = card.querySelector("[data-product-message]");
          if (message) {
            message.textContent = "Size " + radio.value + " selected.";
            message.dataset.state = "ok";
          }
          setShopStep("browse");
        });
      });

      var button = card.querySelector("[data-add-cart]");
      if (button) {
        button.addEventListener("click", function () {
          addToCart(card);
        });
      }
    });

    if (cartItems) {
      cartItems.addEventListener("click", function (event) {
        var button = event.target.closest("[data-qty-action]");

        if (!button) {
          return;
        }

        var item = cart.find(function (cartItem) {
          return cartItem.key === button.dataset.cartKey;
        });

        if (!item) {
          return;
        }

        if (button.dataset.qtyAction === "increase") {
          item.quantity += 1;
        }

        if (button.dataset.qtyAction === "decrease") {
          item.quantity -= 1;
        }

        if (button.dataset.qtyAction === "remove" || item.quantity <= 0) {
          cart = cart.filter(function (cartItem) {
            return cartItem.key !== item.key;
          });
        }

        renderCart();
      });
    }

    if (startCheckoutButton) {
      startCheckoutButton.addEventListener("click", function () {
        if (!cart.length || !checkoutForm) {
          return;
        }

        checkoutForm.hidden = false;
        if (orderConfirmation) {
          orderConfirmation.hidden = true;
        }
        setShopStep("checkout");
        checkoutForm.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    if (shippingMethod) {
      shippingMethod.addEventListener("change", function () {
        updateTotals();
      });
    }

    if (checkoutForm) {
      checkoutForm.addEventListener("submit", function (event) {
        event.preventDefault();

        if (!cart.length) {
          return;
        }

        if (!checkoutForm.checkValidity()) {
          checkoutForm.reportValidity();
          return;
        }

        var data = new FormData(checkoutForm);
        var totals = getTotals();
        orderCounter += 1;
        window.localStorage.setItem("catchpoint-shop-order-count", String(orderCounter));
        var orderId = "CP-SHOP-" + orderCounter;
        var itemCount = cart.reduce(function (sum, item) {
          return sum + item.quantity;
        }, 0);
        var order = {
          id: orderId,
          customer: data.get("customerName"),
          email: data.get("email"),
          city: data.get("city"),
          itemCount: itemCount,
          total: totals.total,
          placedAt: new Date().toISOString()
        };

        window.localStorage.setItem("catchpoint-shop-last-order", JSON.stringify(order));

        if (orderConfirmation) {
          orderConfirmation.hidden = false;
        }

        setText("[data-order-title]", "Order " + orderId + " confirmed");
        setText("[data-order-copy]", "Thank you, " + order.customer + ". A demo confirmation was sent to " + order.email + ".");
        setText("[data-order-summary]", itemCount + " item(s) shipping to " + order.city + ". Total " + money.format(order.total) + ".");
        checkoutForm.hidden = true;
        setShopStep("complete");
      });
    }

    document.querySelectorAll("[data-new-order], [data-reset-shop]").forEach(function (button) {
      button.addEventListener("click", function () {
        cart = [];
        document.querySelectorAll("[data-product-card] input[type='radio']").forEach(function (radio) {
          radio.checked = false;
        });
        document.querySelectorAll("[data-product-message]").forEach(function (message) {
          message.textContent = "Choose a size to add this dress.";
          message.dataset.state = "";
        });
        if (checkoutForm) {
          checkoutForm.hidden = true;
          checkoutForm.reset();
          var terms = checkoutForm.querySelector('input[name="terms"]');
          if (terms) {
            terms.checked = false;
          }
        }
        if (orderConfirmation) {
          orderConfirmation.hidden = true;
        }
        renderCart();
      });
    });

    renderCart();
  }

  if (page === "api") {
    var output = document.querySelector("[data-api-output]");
    var log = document.querySelector("[data-api-log]");
    var statusGrid = document.querySelector("[data-status-code-grid]");
    var clearLogButton = document.querySelector("[data-clear-status-log]");
    var externalStatusBase = "https://httpbin.org/status/";
    var eventCount = 0;
    var commonStatuses = [
      { code: 400, title: "Bad Request", family: "4xx", state: "warn", meaning: "Client sent invalid input or malformed request data." },
      { code: 401, title: "Unauthorized", family: "4xx", state: "warn", meaning: "Authentication is missing, expired, or invalid." },
      { code: 403, title: "Forbidden", family: "4xx", state: "warn", meaning: "Authenticated user or token is not allowed to access the resource." },
      { code: 404, title: "Not Found", family: "4xx", state: "warn", meaning: "The endpoint or resource does not exist." },
      { code: 405, title: "Method Not Allowed", family: "4xx", state: "warn", meaning: "Endpoint exists but does not allow this HTTP method." },
      { code: 408, title: "Request Timeout", family: "4xx", state: "warn", meaning: "The server timed out waiting for the request." },
      { code: 409, title: "Conflict", family: "4xx", state: "warn", meaning: "Request conflicts with current resource state." },
      { code: 410, title: "Gone", family: "4xx", state: "warn", meaning: "Resource used to exist but is no longer available." },
      { code: 413, title: "Payload Too Large", family: "4xx", state: "warn", meaning: "Request body is larger than the server allows." },
      { code: 415, title: "Unsupported Media Type", family: "4xx", state: "warn", meaning: "Request content type is not supported by the endpoint." },
      { code: 422, title: "Unprocessable Content", family: "4xx", state: "warn", meaning: "Request is valid JSON or form data but fails business validation." },
      { code: 429, title: "Too Many Requests", family: "4xx", state: "warn", meaning: "Rate limit or quota threshold has been exceeded." },
      { code: 500, title: "Internal Server Error", family: "5xx", state: "error", meaning: "Generic server-side failure." },
      { code: 501, title: "Not Implemented", family: "5xx", state: "error", meaning: "Server does not support the requested functionality." },
      { code: 502, title: "Bad Gateway", family: "5xx", state: "error", meaning: "Gateway received an invalid response from an upstream service." },
      { code: 503, title: "Service Unavailable", family: "5xx", state: "error", meaning: "Service is overloaded, unavailable, or down for maintenance." },
      { code: 504, title: "Gateway Timeout", family: "5xx", state: "error", meaning: "Gateway timed out waiting for an upstream service." }
    ];

    function writeOutput(text, state) {
      if (output) {
        output.textContent = text;
        output.classList.remove("status-ok", "status-warn", "status-error", "status-pending");
        if (state) {
          output.classList.add("status-" + state);
        }
      }
    }

    function setCard(cardName, value, copy, state) {
      var card = document.querySelector('[data-api-card="' + cardName + '"]');
      var valueTarget = document.querySelector("[data-api-" + cardName + "]");
      var copyTarget = document.querySelector("[data-api-" + cardName + "-copy]");

      if (valueTarget) {
        valueTarget.textContent = value;
      }

      if (copyTarget) {
        copyTarget.textContent = copy;
      }

      if (card) {
        card.dataset.state = state || "idle";
      }
    }

    function addLog(kind, title, detail) {
      if (!log) {
        return;
      }

      eventCount += 1;

      if (eventCount === 1) {
        log.textContent = "";
      }

      var item = document.createElement("li");
      var stamp = new Date().toLocaleTimeString();
      item.dataset.kind = kind;

      var heading = document.createElement("strong");
      heading.textContent = title;

      var body = document.createElement("span");
      body.textContent = stamp + " - " + detail;

      item.appendChild(heading);
      item.appendChild(body);
      log.prepend(item);

      while (log.children.length > 6) {
        log.removeChild(log.lastElementChild);
      }
    }

    function resetLog() {
      eventCount = 0;

      if (log) {
        log.innerHTML = "<li>No events yet.</li>";
      }
    }

    function selectStatus(status) {
      var local404 = status.code === 404;
      var source = local404 ? "Local static request" : "External httpbin request";

      document.querySelectorAll("[data-status-code]").forEach(function (button) {
        button.dataset.active = button.dataset.statusCode === String(status.code) ? "true" : "false";
      });

      setCard("event", "Request started", "Requesting " + status.code + " " + status.title + ".", "pending");
      setCard("http", "Pending", source + " in progress.", "pending");
      writeOutput("Requesting HTTP " + status.code + " from " + source + "...", "pending");
      addLog("pending", "Status request started", source + " for HTTP " + status.code + ".");

      if (local404) {
        fetch("../assets/missing-api.json")
          .then(function (response) {
            setCard("http", String(response.status), "Real missing-file response from GitHub Pages/static hosting.", "warn");
            setCard("event", response.status + " " + status.title, status.meaning, status.state);
            writeOutput("Real local request returned HTTP " + response.status + ". " + status.meaning, "warn");
            addLog("warn", "Real 404 fetch", "GET ../assets/missing-api.json returned HTTP " + response.status + ".");
          })
          .catch(function (error) {
            setCard("event", "404 fetch failed", error.message, "error");
            writeOutput("404 fetch failed: " + error.message, "error");
            addLog("error", "404 fetch failed", error.message);
          });

        return;
      }

      fetch(externalStatusBase + status.code + "?t=" + Date.now(), { cache: "no-store" })
        .then(function (response) {
          var state = response.status >= 500 ? "error" : "warn";
          setCard("event", response.status + " " + status.title, "Real external response received.", state);
          setCard("http", String(response.status), status.meaning, state);
          writeOutput("Real external request returned HTTP " + response.status + ". " + status.meaning, state);
          addLog(state, "Real HTTP " + response.status, "GET " + externalStatusBase + status.code + " returned " + response.status + ".");
        })
        .catch(function (error) {
          setCard("event", "External request failed", error.message, "error");
          setCard("http", "Failed", "The external status endpoint did not return a readable response.", "error");
          writeOutput("External status request failed: " + error.message, "error");
          addLog("error", "External status request failed", error.message);
        });
    }

    if (statusGrid) {
      commonStatuses.forEach(function (status) {
        var button = document.createElement("button");
        button.className = "status-code-button";
        button.type = "button";
        button.dataset.statusCode = String(status.code);
        button.dataset.family = status.family;
        button.dataset.state = status.state;
        button.innerHTML =
          "<strong>" + status.code + "</strong>" +
          "<span>" + status.title + "</span>" +
          "<small>" + status.family + " " + (status.code === 404 ? "local" : "external") + "</small>";
        button.addEventListener("click", function () {
          selectStatus(status);
        });
        statusGrid.appendChild(button);
      });
    }

    if (clearLogButton) {
      clearLogButton.addEventListener("click", function () {
        resetLog();
        setCard("event", "Idle", "Log cleared. Choose a status code or action.", "idle");
        writeOutput("Event log cleared.", "pending");
      });
    }

    window.addEventListener("error", function (event) {
      var message = event.message || "Unknown JavaScript error";
      setCard("error", "Captured", message, "error");
      setCard("event", "JS error", "The page emitted a browser error event.", "error");
      writeOutput("JavaScript error captured: " + message, "error");
      addLog("error", "JavaScript error captured", message);
    });

    window.addEventListener("unhandledrejection", function (event) {
      var message = event.reason && event.reason.message ? event.reason.message : "Unhandled promise rejection";
      setCard("error", "Promise rejection", message, "error");
      setCard("event", "Promise rejection", "An unhandled promise rejection was captured.", "error");
      writeOutput("Unhandled promise rejection captured: " + message, "error");
      addLog("error", "Unhandled promise rejection", message);
    });

    document.querySelectorAll("[data-api-action]").forEach(function (button) {
      button.addEventListener("click", function () {
        var action = button.dataset.apiAction;

        if (action === "success") {
          setCard("event", "Request started", "Fetching local sample-api.json.", "pending");
          setCard("http", "Pending", "Waiting for JSON response.", "pending");
          writeOutput("Fetching healthy JSON sample...", "pending");
          addLog("pending", "Request started", "GET ../assets/sample-api.json");

          fetch("../assets/sample-api.json")
            .then(function (response) {
              setCard("http", String(response.status), response.ok ? "Healthy JSON returned successfully." : "JSON request returned an unexpected status.", response.ok ? "ok" : "warn");
              return response.json();
            })
            .then(function (data) {
              setCard("event", "Success", "Static JSON responded from " + data.region + ".", "ok");
              writeOutput("API success: " + data.status + " from " + data.region + ".", "ok");
              addLog("ok", "API success", "HTTP 200 from " + data.region + " in sample-api.json");
            })
            .catch(function (error) {
              setCard("event", "Fetch failed", error.message, "error");
              setCard("http", "Failed", "The healthy JSON request failed.", "error");
              writeOutput("Unexpected API error: " + error.message, "error");
              addLog("error", "Unexpected API error", error.message);
            });
        }

        if (action === "missing") {
          setCard("event", "Request started", "Fetching a missing JSON file.", "pending");
          setCard("http", "Pending", "Waiting for missing resource response.", "pending");
          writeOutput("Fetching missing JSON sample...", "pending");
          addLog("pending", "Request started", "GET ../assets/missing-api.json");

          fetch("../assets/missing-api.json")
            .then(function (response) {
              setCard("event", "Missing resource", "The missing JSON request completed.", "warn");
              setCard("http", String(response.status), "Intentional missing file response.", "warn");
              writeOutput("Missing API returned HTTP " + response.status + ".", "warn");
              addLog("warn", "Missing API response", "HTTP " + response.status + " for missing-api.json");
            })
            .catch(function (error) {
              setCard("event", "Missing fetch failed", error.message, "error");
              setCard("http", "Failed", "The missing JSON request failed before a response.", "error");
              writeOutput("Missing API failed: " + error.message, "error");
              addLog("error", "Missing API failed", error.message);
            });
        }

        if (action === "console") {
          console.warn("Catchpoint demo console warning");
          setCard("event", "Console warning", "A warning was written to the browser console.", "warn");
          setCard("console", "Warning", "Catchpoint demo console warning", "warn");
          writeOutput("Console warning emitted.", "warn");
          addLog("warn", "Console warning emitted", "Catchpoint demo console warning");
        }

        if (action === "error") {
          setCard("event", "Error scheduled", "A JavaScript error will be thrown shortly.", "pending");
          setCard("error", "Scheduled", "Waiting for the browser error event.", "pending");
          writeOutput("A JavaScript error will be thrown and captured on this page.", "pending");
          addLog("pending", "JavaScript error scheduled", "Throwing demo error in 200 ms");

          window.setTimeout(function () {
            throw new Error("Catchpoint demo JavaScript error");
          }, 200);
        }
      });
    });
  }

  if (page === "popups") {
    var primaryModal = document.querySelector("[data-primary-modal]");
    var nestedModal = document.querySelector("[data-nested-modal]");
    var popupOutput = document.querySelector("[data-popup-output]");
    var popupLog = document.querySelector("[data-popup-log]");
    var toast = document.querySelector("[data-toast]");
    var popupEventCount = 0;
    var toastTimer = null;

    function setPopupCard(cardName, value, copy, state) {
      var card = document.querySelector('[data-popup-card="' + cardName + '"]');
      var valueTarget = document.querySelector("[data-popup-" + cardName + "]");
      var copyTarget = document.querySelector("[data-popup-" + cardName + "-copy]");

      if (valueTarget) {
        valueTarget.textContent = value;
      }

      if (copyTarget) {
        copyTarget.textContent = copy;
      }

      if (card) {
        card.dataset.state = state || "idle";
      }
    }

    function writePopupOutput(text, state) {
      if (!popupOutput) {
        return;
      }

      popupOutput.textContent = text;
      popupOutput.classList.remove("status-ok", "status-warn", "status-error", "status-pending");

      if (state) {
        popupOutput.classList.add("status-" + state);
      }
    }

    function addPopupLog(kind, title, detail) {
      if (!popupLog) {
        return;
      }

      popupEventCount += 1;

      if (popupEventCount === 1) {
        popupLog.textContent = "";
      }

      var item = document.createElement("li");
      var stamp = new Date().toLocaleTimeString();
      item.dataset.kind = kind;

      var heading = document.createElement("strong");
      heading.textContent = title;

      var body = document.createElement("span");
      body.textContent = stamp + " - " + detail;

      item.appendChild(heading);
      item.appendChild(body);
      popupLog.prepend(item);

      while (popupLog.children.length > 8) {
        popupLog.removeChild(popupLog.lastElementChild);
      }
    }

    function openDialog(dialog) {
      if (!dialog) {
        return;
      }

      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }
    }

    function closeDialog(dialog) {
      if (!dialog) {
        return;
      }

      if (typeof dialog.close === "function" && dialog.open) {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    }

    document.querySelectorAll("[data-open-modal]").forEach(function (button) {
      button.addEventListener("click", function () {
        openDialog(primaryModal);
        setPopupCard("last", "Modal opened", "Primary in-page dialog is visible.", "pending");
        setPopupCard("modal", "Open", "Primary modal dialog is active.", "pending");
        writePopupOutput("Primary modal opened.", "pending");
        addPopupLog("pending", "Primary modal opened", "Dialog shown with form controls.");
      });
    });

    document.querySelectorAll("[data-close-primary]").forEach(function (button) {
      button.addEventListener("click", function () {
        closeDialog(primaryModal);
        setPopupCard("modal", "Closed", "Primary modal was closed.", "idle");
        addPopupLog("ok", "Primary modal closed", "Close control used.");
      });
    });

    document.querySelectorAll("[data-complete-modal-step]").forEach(function (button) {
      button.addEventListener("click", function () {
        var name = document.querySelector("#popup-check-name");
        var severity = document.querySelector("#popup-severity");
        var nameValue = name && name.value ? name.value : "Popup transaction check";
        var severityValue = severity && severity.value ? severity.value : "Info";
        setText("[data-modal-result]", "Completed " + nameValue + " with " + severityValue + " severity.");
        setPopupCard("last", "Modal step done", nameValue + " completed.", "ok");
        setPopupCard("modal", "Completed", "Form step completed inside the modal.", "ok");
        writePopupOutput("Modal step completed for " + nameValue + ".", "ok");
        addPopupLog("ok", "Modal step completed", nameValue + " with " + severityValue + " severity.");
      });
    });

    document.querySelectorAll("[data-open-nested-modal]").forEach(function (button) {
      button.addEventListener("click", function () {
        openDialog(nestedModal);
        setPopupCard("last", "Nested opened", "Nested dialog launched from the modal.", "pending");
        setPopupCard("nested", "Open", "Nested modal is active.", "pending");
        addPopupLog("pending", "Nested modal opened", "Nested dialog launched from primary modal.");
      });
    });

    document.querySelectorAll("[data-close-nested]").forEach(function (button) {
      button.addEventListener("click", function () {
        closeDialog(nestedModal);
        setPopupCard("nested", "Closed", "Nested modal was closed.", "idle");
        addPopupLog("warn", "Nested modal closed", "Nested modal closed without confirmation.");
      });
    });

    document.querySelectorAll("[data-confirm-nested]").forEach(function (button) {
      button.addEventListener("click", function () {
        var checkbox = document.querySelector("[data-nested-checkbox]");

        if (!checkbox || !checkbox.checked) {
          setText("[data-nested-result]", "Check the acknowledgement box before confirming.");
          setPopupCard("nested", "Waiting", "Acknowledgement is required.", "warn");
          writePopupOutput("Nested modal needs acknowledgement before it can complete.", "warn");
          addPopupLog("warn", "Nested confirmation blocked", "Acknowledgement checkbox was not checked.");
          return;
        }

        setText("[data-nested-result]", "Nested popup step confirmed.");
        setPopupCard("last", "Nested complete", "Nested dialog confirmation succeeded.", "ok");
        setPopupCard("nested", "Completed", "Nested modal step confirmed.", "ok");
        writePopupOutput("Nested modal confirmation completed.", "ok");
        addPopupLog("ok", "Nested modal completed", "Acknowledgement was checked and confirmed.");
        closeDialog(nestedModal);
      });
    });

    document.querySelectorAll("[data-open-toast]").forEach(function (button) {
      button.addEventListener("click", function () {
        if (!toast) {
          return;
        }

        window.clearTimeout(toastTimer);
        toast.textContent = "Toast popup fired at " + new Date().toLocaleTimeString();
        toast.classList.add("show");
        setPopupCard("last", "Toast shown", "Temporary toast popup is visible.", "pending");
        writePopupOutput("Toast popup displayed.", "pending");
        addPopupLog("pending", "Toast popup shown", "Temporary notification appeared.");

        toastTimer = window.setTimeout(function () {
          toast.classList.remove("show");
          addPopupLog("ok", "Toast popup hidden", "Temporary notification disappeared.");
        }, 3600);
      });
    });

    document.querySelectorAll("[data-open-window-popup]").forEach(function (button) {
      button.addEventListener("click", function () {
        setPopupCard("last", "Window requested", "Browser popup link was activated.", "pending");
        setPopupCard("window", "Opening", "A child popup/tab should open from the link.", "pending");
        writePopupOutput("Browser popup requested. Interact in the child window to send a signal back.", "pending");
        addPopupLog("pending", "Browser popup requested", "Link target opened popup-window.html.");
      });
    });

    document.querySelectorAll("[data-reset-popups]").forEach(function (button) {
      button.addEventListener("click", function () {
        closeDialog(nestedModal);
        closeDialog(primaryModal);
        window.clearTimeout(toastTimer);

        if (toast) {
          toast.classList.remove("show");
        }

        popupEventCount = 0;

        if (popupLog) {
          popupLog.innerHTML = "<li>No events yet.</li>";
        }

        setPopupCard("last", "Idle", "Popup lab reset.", "idle");
        setPopupCard("modal", "Closed", "Open the in-page modal.", "idle");
        setPopupCard("nested", "Closed", "Launch the nested dialog from inside the first modal.", "idle");
        setPopupCard("window", "Closed", "Open a real popup window from a click.", "idle");
        writePopupOutput("Popup lab reset.", "pending");
      });
    });

    window.addEventListener("message", function (event) {
      if (!event.data || event.data.source !== "popup-lab") {
        return;
      }

      if (event.data.type === "window-complete") {
        setPopupCard("last", "Window complete", "Child popup returned a completion message.", "ok");
        setPopupCard("window", "Completed", event.data.detail + " completed in child window.", "ok");
        writePopupOutput("Child browser popup completed: " + event.data.detail + ".", "ok");
        addPopupLog("ok", "Child popup completed", event.data.detail + " sent through postMessage.");
      }

      if (event.data.type === "window-loaded") {
        setPopupCard("last", "Window loaded", "Child popup page loaded successfully.", "pending");
        setPopupCard("window", "Open", "Child popup page is ready for interaction.", "pending");
        writePopupOutput("Child browser popup loaded and is ready.", "pending");
        addPopupLog("pending", "Child popup loaded", event.data.detail);
      }

      if (event.data.type === "nested-window-opened") {
        setPopupCard("last", "Second window opened", "Child popup launched another popup.", "pending");
        setPopupCard("window", "Nested open", "Second browser popup is active.", "pending");
        writePopupOutput("Second browser popup launched from the first popup.", "pending");
        addPopupLog("pending", "Second browser popup opened", event.data.detail);
      }

      if (event.data.type === "nested-window-complete") {
        setPopupCard("last", "Second window complete", "Nested browser popup returned a completion message.", "ok");
        setPopupCard("window", "Nested complete", "Second browser popup completed.", "ok");
        writePopupOutput("Nested browser popup completed.", "ok");
        addPopupLog("ok", "Second browser popup completed", event.data.detail);
      }

      if (event.data.type === "nested-window-blocked") {
        setPopupCard("last", "Second window blocked", "Browser blocked the nested popup.", "error");
        setPopupCard("window", "Nested blocked", "Allow popups and retry the nested window step.", "error");
        writePopupOutput("Nested browser popup was blocked.", "error");
        addPopupLog("error", "Second browser popup blocked", event.data.detail);
      }
    });
  }

  if (page === "visual") {
    var board = document.querySelector("[data-visual-board]");
    if (params.get("variant") === "1" && board) {
      board.classList.add("variant");
      setText("[data-visual-label]", "Variant layout active");
    }
  }
})();
