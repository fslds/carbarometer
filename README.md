# Car Barometer

A crawler for the [GOCA Barometer](https://gocabarometer.gocavlaanderen.be/) (vehicle inspection defect
rates per car model in Flanders, July 2025 – June 2026), plus a static, client-side dashboard to rank and
compare models across brands, segments and age classes. The dashboard is available in EN / FR / NL / DE / PL.

## Crawl

```sh
uv run carbarometer              # crawl (uses data/raw/ cache) + parse
uv run carbarometer --refresh    # force re-download of every page
uv run carbarometer --parse-only # re-parse the cache only
```

The source is plain static HTML (robots.txt allows everything): one start page plus one page per model
(253 in total). The crawler uses `httpx2` async with 4 concurrent requests, retries and a short delay. It
writes:

- `data/barometer.json` – full, readable dataset (per model × age class: % with defects, class average,
  average mileage, top-10 defect rubrics with model and class %)
- `site/data/barometer.json` – compact version for the website, merged with the editorial classification
  in `src/carbarometer/segments.py` (segment A–F, body type, powertrain), which is **not** GOCA data.

## Website

Static files in `site/`: vanilla JS (source in `site/js/` as ES modules) plus vendored ECharts.
Just open `site/index.html` in a browser; `file://` works. A local server works too:

```sh
python3 -m http.server -d site 8000   # open http://localhost:8000
```

Browsers block ES modules and `fetch()` on `file://`, so the page loads a generated bundle instead:
`site/app.bundle.js` (all modules) and `site/data/barometer.js` (embedded data). **After editing anything
in `site/js/`, rebuild:**

```sh
uv run carbarometer-build   # also runs automatically at the end of every crawl
```

To deploy, put the `site/` folder on any static host (GitHub Pages, Netlify, S3…). Routing uses the URL
hash, so the host needs no rewrite rules.

Views: **Ranking** (filter/sort all models, pick to compare), **Compare** (up to 8 models across age
classes and rubrics), **Model** detail, **Brands**, **Defects** (per rubric), **Explore** (mileage vs
defects), **About** (methodology).

All state except the language lives in the URL, e.g.
`#/compare?m=volkswagen-golf,ford-focus,toyota-auris&age=8-9&y=idx`. The language is saved per browser.
`?lang=fr` forces a language.

### Metrics

- **Index** = model % with defects ÷ class average (same age class) × 100. Lower is better.
- **Score** = mean index over the age classes in which the model has ≥ 500 inspections.
- Only each model's top-10 rubrics are published. Any other rubric is shown as "≤ x", where x is the
  model's 10th value. These values are left uncoloured because they are unknown.

## Deploy (GitHub Pages)

The site is deployed from your machine to the `gh-pages` branch, with no CI involved:

```sh
uv run carbarometer-deploy             # build, then push site/ to origin/gh-pages
uv run carbarometer-deploy --no-push   # dry run: update the local gh-pages branch only
uv run carbarometer-deploy --cname barometer.example.org   # optional custom domain
```

This builds the bundle and publishes the contents of `site/`, including the generated files, with
[ghp-import](https://github.com/c-w/ghp-import). It adds a `.nojekyll` file so Pages serves the files as-is and
doesn't run them through Jekyll. `gh-pages` is kept as a single commit that each deploy replaces, so the repo
doesn't grow with every deploy.

One-time setup: push the repo to GitHub, run the deploy once, then set **Settings → Pages → Build and
deployment → Source: Deploy from a branch**, branch **gh-pages**, folder **/ (root)**. Pages is free on public
repos; a private repo needs a paid plan. The site is served from `https://<user>.github.io/<repo>/`. Its paths
are relative and it uses hash routing, so that subpath needs no configuration.

To refresh the data: `uv run carbarometer --refresh`, commit, then `uv run carbarometer-deploy`.

`site/app.bundle.js` and `site/data/barometer.js` are generated and not committed. In a fresh clone, run
`uv run carbarometer-build` before opening `site/index.html` from disk.

`uv run carbarometer-build --artifact` additionally writes `dist/car-barometer.html`, a single self-contained page
used for the claude.ai artifact.

## Tests

```sh
uv run python tests/smoke.py   # loads every view in 3 languages/themes, fails on JS errors or overflow
```
