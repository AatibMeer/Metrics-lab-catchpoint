# Catchpoint Metrics Lab

A plain static multi-page demo site for synthetic monitoring scenarios.

This first version does not use a framework, build system, or Playwright. It is just HTML, CSS, JavaScript, and static assets, so GitHub Pages can host it directly.

## Pages

- `index.html` - dashboard and page directory
- `pages/performance.html` - LCP-style visual target, layout shift, input delay
- `pages/network.html` - waterfall profile, missing asset, burst loading
- `pages/journey.html` - transaction-style form flow and local storage
- `pages/shop.html` - e-commerce dress catalog, size selection, cart, checkout, and order confirmation
- `pages/popups.html` - modal, nested modal, toast, and browser popup scenarios
- `pages/popup-window.html` and `pages/popup-nested-window.html` - helper pages launched from the popup lab
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
/pages/popups.html
/pages/api-errors.html
/pages/visual.html
/pages/visual.html?variant=1
/pages/accessibility.html
```

## Later Testing Ideas

After the website is hosted, it can be used for Catchpoint synthetic checks, browser checks, transaction checks, API-style checks, screenshot comparison, accessibility scans, or Playwright automation.
