# Catchpoint Metrics Lab

A plain static multi-page demo site for synthetic monitoring scenarios.

This first version does not use a framework, build system, or Playwright. It is just HTML, CSS, JavaScript, and static assets, so GitHub Pages can host it directly.

## Pages

- `index.html` - dashboard and page directory
- `pages/performance.html` - LCP-style visual target, layout shift, input delay
- `pages/network.html` - waterfall profile, missing asset, burst loading
- `pages/journey.html` - transaction-style form flow and local storage
- `pages/shop.html` - e-commerce dress catalog, size selection, and cart popup
- `pages/checkout.html` - checkout details, order summary, and order confirmation
- `pages/popups.html` - modal, nested modal, toast, and browser popup scenarios
- `pages/popup-window.html` and `pages/popup-nested-window.html` - helper pages launched from the popup lab
- `pages/images-links.html` - working images, one broken image, working links, and one broken link
- `pages/rum-indicators.html` and `pages/rum-indicators-next.html` - RUM indicator updates, late registration, navigation, and lifecycle history
- `pages/api-errors.html` - JSON fetch, missing JSON, console warning, JavaScript error
- `pages/visual.html` - stable visual board and variant layout
- `pages/accessibility.html` - labels, focus states, contrast samples
- `404.html` - static not-found page

## Run Locally

Open `index.html` in a browser.

For a local server, run this from the project folder:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Publish On GitHub Pages

1. Create a new GitHub repository, for example `catchpoint-metrics-lab`.
2. Add these files to the repository.
3. Push to the `main` branch.
4. In GitHub, open the repository.
5. Go to `Settings`.
6. Go to `Pages`.
7. Under `Build and deployment`, set:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/ (root)`
8. Save.

Your site will be available at:

```text
https://YOUR_USERNAME.github.io/catchpoint-metrics-lab/
```

## Useful Scenario URLs

```text
/pages/performance.html
/pages/performance.html?slow=1
/pages/performance.html?shift=1
/pages/network.html
/pages/network.html?burst=1
/pages/journey.html
/pages/shop.html
/pages/checkout.html
/pages/popups.html
/pages/images-links.html
/pages/rum-indicators.html
/pages/rum-indicators.html?initial=first
/pages/rum-indicators.html?initial=none
/pages/api-errors.html
/pages/visual.html
/pages/visual.html?variant=1
/pages/accessibility.html
```

## Later Testing Ideas

After the website is hosted, it can be used for Catchpoint synthetic checks, browser checks, transaction checks, API-style checks, screenshot comparison, accessibility scans, or Playwright automation.

## RUM Indicator Lab

The RUM menu opens a two-document scenario using the existing site ID `15222` and the exact indicator tokens `rumtesting1` and `rumtesting2`. Values are random integers, not request durations. Both tokens must be enabled for the RUM app in Catchpoint. No changes are made to the portal's sampling, domains, or collection settings.

1. Open the RUM page with browser DevTools Network open. Enable **Preserve log** and filter for `hawklogserver` (or `3gl.net`). Current tags can use `rjs.3gl.net`, not only `r.3gl.net`.
2. In the default **Both indicators** mode, each number is registered once as soon as `RProfiler.addInfo` becomes available, using `GlimpseLoaded` before initial collection. Wait for an actual initial collector request before testing a later update; neither the load event nor elapsed time proves a beacon was sent.
3. Compare the visible numbers with the request's decoded indicator payload (`ind`) and Catchpoint's individual RUM record. An aggregate chart can average multiple records and need not match one displayed value.
4. Click **Reset number** or **Reset both numbers**. Each generates a different number and calls `RProfiler.addInfo('indicator', token, value)` immediately. Check whether a later collector request includes it.
5. Click **Update both 3 times** for three synchronous updates per token. The history records all six calls and their order. Compare the next actual payload with those values to establish which one is retained.
6. Click **Continue to Page 2**. This is a real document navigation, not an SPA route. Page 1 may send an exit beacon; Page 2 generates different numbers and registers them for its own initial collection. The history retains both pages' events and document visit IDs in this tab. Browser Back may restore the old document from bfcache (`pageshow persisted=true`); that is not a new document or new initial registration.
7. For a genuinely new indicator after load, select **rumtesting1 only** (reloads the page). Verify the initial collector payload, then click **Reset number** for `rumtesting2`. **Neither indicator** skips both initial calls; **Submit current values** registers the displayed values on demand. It does not flush or force a beacon. The selected mode is retained when continuing between the two pages.
8. On a real phone, compare normal navigation, switching tabs, switching apps, returning, and closing the browser from the app manager. `visibilitychange`, `pagehide`, and `pageshow` are logged when delivered. Use remote Network inspection and Catchpoint records to verify delivery. A mobile app kill may prevent both an exit beacon and the final log entry.

`addInfo returned` only means the API call did not throw. It does not confirm network delivery or ingestion. The collector-resource count passively observes completed Resource Timing entries; it does not inspect their bodies, establish successful receipt, or guarantee every exit request is observable. Requests finishing after the document is gone may be missing from the local count.

The lab enables the existing `usePageHide()` behavior but does not wrap vendor APIs, synthesize lifecycle events, post custom data to the collector, or call undocumented flush methods. No supported manual-flush API was established from the public documentation reviewed. Confirm any such API with Catchpoint for the deployed tag version before using it.

History is limited to the last 200 events in this tab's `sessionStorage`; **Download history** exports it as JSON. **Clear history** clears only the local log, not RProfiler's collected values. When storage is blocked the current page still works, but history and previous-number comparisons cannot persist across navigation.

References: [Catchpoint tag tokens and GlimpseLoaded](https://docs.catchpoint.com/docs/common-rum-app-settings), [RUM payload fields](https://docs.catchpoint.com/docs/rum-json-payload-definitions), [mobile exit limitations](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon).

Optional local regression checks use Node's built-in test runner with a mocked RUM API, no browser or dependencies required:

```bash
node --test tests/rum-lab.test.cjs
```

These checks verify the site's calls and state, not Catchpoint beacon contents or ingestion.
