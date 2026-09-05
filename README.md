# Dyson-Calculator Production Planner aka "DSPCPP"

<!-- ABOUT THE PROJECT -->
## About The Project

The production planner is able to produce factory chains for Dyson Sphere Program.
A game from Youthcat Studio.

[![DSPCPP](./img/readmeImage.jpg)](https://dyson-calculator.com/en/production-planner)

This repository is the planner as a standalone [Next.js](https://nextjs.org) app
that deploys to Vercel as-is. Upstream it was only the calculation bundle:
`webpack` built a single script that dyson-calculator.com loaded into a page it
rendered itself, so there was nothing here to deploy — no HTML, no entry point,
and the markup that script drove lived in that site. The app in `app/` supplies
that missing half, and the embed bundle is gone: this repo builds one thing.

## Deploying to Vercel

1. Import the repository on Vercel. The Next.js preset is detected — no build
   settings to change.
2. Deploy.

Nothing else is required: there is no database, no server state, and the whole
calculation runs in the visitor's browser.

## Game data

The planner runs on a buildings / items / recipes table. A snapshot of the real
one (`Stable` branch: 45 buildings, 74 items, 130 recipes) is bundled at
`lib/gameData.json`, so a fresh deploy works with no configuration.

`app/api/game/route.js` serves it. It goes through a route handler rather than
being imported into the page so the ~100KB of JSON is fetched once and cached,
instead of riding along in the client bundle on every load.

| Variable | Default | Meaning |
| --- | --- | --- |
| `ASSET_BASE_URL` | `https://www.dyson-calculator.com` | Origin for item and building artwork. The data stores these as site-relative paths (`/img/gameUI/iron-ore.png`), which the upstream page could use as-is because it was served from that origin; here they need one. Icons that fail to load fall back to a placeholder. |
| `GAME_DATA_URL` | *(unset)* | Optional. Set it to fetch a newer table from the upstream API instead of the bundled one; `{lang}` is replaced with the requested language. If the fetch fails the bundled copy still answers, and the page says so. |

To refresh the bundled data, replace `lib/gameData.json` with a new response,
keeping `buildingsData`, `itemsData` and `recipesData` (the `technologiesData`
and `upgradesData` the endpoint also returns are unused, and are half its size).

If you point `GAME_DATA_URL` somewhere, point it at an origin you trust:
`src/Worker.js` interpolates item names and URLs straight into the HTML it
generates, exactly as it did upstream, so a hostile feed could inject markup
into the results panels.

## Running locally

```
npm install
npm run dev          # http://localhost:3000
npm run build        # production build
npm start            # serve the production build
```

## How it fits together

| Path | What it is |
| --- | --- |
| `src/Worker.js` | The planner itself, untouched. It is one self-contained function so it can be stringified into a Blob and run as a real WebWorker. |
| `lib/plannerWorker.js` | Starts that worker and relays its messages. |
| `lib/plannerState.js` | The planner's inputs, and their two shapes: the `formData` the worker expects, and the `/json/<payload>` share URL. |
| `components/Planner.jsx` | The page: item pickers, options, tabs, loader — the half that used to live in the upstream site's templates. |
| `components/ProductionGraph.jsx` | The factory layout, cytoscape + ELK, with the stylesheet the upstream page used. |
| `lib/gameData.json` | The bundled buildings / items / recipes table. |
| `app/api/game/route.js` | Serves that table, resolving relative asset paths against `ASSET_BASE_URL`. |

Share URLs keep the upstream `/json/<url-encoded JSON>` shape, so links made by
the original planner open here unchanged.

## Tests

`npm test` runs the differential and unit suites over `src/Worker.js` — see
[test/README.md](test/README.md). The calculation is untouched by this
conversion, and those tests are what pins it that way.

<!-- ROADMAP -->
## Roadmap

See the [open issues](https://github.com/AnthorNet/DSP-ProductionPlanner/issues) for a list of proposed features (and known issues).
