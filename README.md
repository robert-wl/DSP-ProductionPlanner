# Dyson-Calculator Production Planner aka "DSPCPP"

<!-- ABOUT THE PROJECT -->
## About The Project

The production planner is able to produce factory chains for Dyson Sphere Program.
A game from Youthcat Studio.

This repository is the planner as a standalone [Vite](https://vite.dev) app that
builds to plain static files. Upstream it was only the calculation bundle:
`webpack` built a single script that dyson-calculator.com loaded into a page it
rendered itself, so there was nothing here to deploy — no HTML, no entry point,
and the markup that script drove lived in that site. `index.html` + `src/main.jsx`
supply that missing half, and the embed bundle is gone: this repo builds one thing.

There is no server. The game data is generated at build time, the icons are
files on disk, and the calculation runs in the visitor's browser in a real
WebWorker.

## Reference repositories

Two projects this one is built out of. Neither is vendored wholesale and
neither shares this repository's git history, so they are named here instead:

| Repository | License | What this repo takes from it |
| --- | --- | --- |
| [AnthorNet/DSP-ProductionPlanner](https://github.com/AnthorNet/DSP-ProductionPlanner) | ISC | The planner itself. `src/Worker.js` is that project's calculation, unchanged, and the UI in `components/` is a React rebuild of the page dyson-calculator.com rendered around it. |
| [factoriolab/factoriolab](https://github.com/factoriolab/factoriolab) | MIT | The Dyson Sphere Program dataset and icon sprite in `vendor/factoriolab/`, pinned to one commit, from which `public/data/game.json` and `public/icons/` are generated. |

Full notices, including the game art, are in [THIRD-PARTY.md](THIRD-PARTY.md).

## Deploying

`npm run build` writes `dist/`. Any static host serves it, as long as unknown
paths fall back to `index.html` — share links live under `/json/<payload>`.
`vercel.json` sets that rewrite up for Vercel, where the Vite preset is detected
with no build settings to change.

## Game data

The planner runs on a buildings / items / recipes table keyed by class name,
which `src/Worker.js` has expected since it lived on dyson-calculator.com. That
table is generated, not hand-maintained:

```
vendor/factoriolab/{data.json,defaults.json,icons.webp}   MIT, pinned commit
        │
        │  npm run build-data       (scripts/buildGameData.mjs)
        ▼
public/data/game.json      63 buildings, 111 items, 180 recipes, DSP 0.10.29.21950
public/icons/<id>.webp     174 icons, sliced out of the sprite sheet
```

Both outputs are checked in, so a clone builds without running the generator.
Refreshing the data is a `curl` and a `npm run build-data` — see
[vendor/factoriolab/SOURCE.md](vendor/factoriolab/SOURCE.md).

### What the generator has to reconcile

FactorioLab's schema and the worker's are not the same shape, and the worker is
pinned byte for byte by the test suite, so the adapter absorbs every difference:

| concept | `src/Worker.js` | FactorioLab |
| --- | --- | --- |
| shape | objects keyed by class name | flat arrays with `id` |
| recipe inputs / outputs | `ingredients` / `produce` | `in` / `out` |
| producer | `mProducedIn` | `producers` |
| machine stats | fields on the building | `item.machine.{usage,drain,speed}` |
| icon | `image`, a URL | a sprite offset `{x,y}` |
| alternative recipes | `_Alternative` in the class name | `defaults.excludedRecipes` |

That last row only decides the *default* now, not what the page will plan. The
worker picks a recipe per item on its own and takes an override from the
`altRecipes` list it is sent, so the sidebar offers every recipe for every item
more than one recipe makes - marked alternative or not. It has to: sulfuric acid
and organic crystal each have two ordinary recipes, and neither was reachable
while the page only listed the `_Alternative` half of the table. The list is
read back and written out per item by `lib/plannerState.js`, which also works
out what the worker would have picked so the row can name it.

Judgement calls it makes, all near the top of `scripts/buildGameData.mjs` and
all reversible there:

- **Technologies and upgrades are dropped.** 312 of the 486 upstream items;
  nothing reads them.
- **Newer machine tiers are held back from `mProducedIn`.** The worker picks the
  *last* producer listed, so a Re-composing Assembler or a Quantum Chemical Plant
  would silently become the default with no UI to choose otherwise. They are
  still in the table as buildable items.

  The worker only has one machine-tier option of its own, `maxAssemblerSpeed`,
  which names the three assembler keys outright. Anything else is chosen for the
  page by `recipesForState` in `lib/plannerState.js`, which narrows `mProducedIn`
  to the tier the run is using before the table is handed over - that is what the
  smelter select does, and adding another group is one entry in
  `CLIENT_MACHINE_TIERS`.
- **Orbital collector recipes are dropped.** They are map-capped pseudo-recipes,
  not something you build.
- **Deuterium fractionation keeps its 100:1 ratio.** Upstream states it as
  0.01 in / 0.01 out, which only means anything inside FactorioLab's own belt
  model; taken literally it turns hydrogen into deuterium one for one.
- **Mining machines are assumed to cover 6 veins**, which is not in the upstream
  data and was baked into the old table too.

The generator prints what it dropped and why on every run.

Icons are sliced into one file each rather than inlined as data URIs: the list
panes are markup with `<img src="{item.image}">` in them, so a data URI would
duplicate the bytes into every node of the tree. 174 icons come to ~700 KB, less
than the 850 KB sprite they came from, and each one caches on its own.

## Running locally

```
npm install
npm run dev          # http://localhost:5173
npm run build        # production build into dist/
npm run preview      # serve that build
npm run build-data   # regenerate public/data and public/icons
```

## How it fits together

| Path | What it is |
| --- | --- |
| `src/Worker.js` | The planner itself, untouched. It is one self-contained function so it can be stringified into a Blob and run as a real WebWorker. |
| `src/main.jsx` | Entry point, and the whole router: `/` and `/json/<payload>`. |
| `lib/plannerWorker.js` | Starts that worker, relays its messages, and asks it for a result the page did not need up front. |
| `lib/plannerState.js` | The planner's inputs, and their two shapes: the `formData` the worker expects, and the `/json/<payload>` share URL. |
| `lib/resultHtml.mjs` | The markup for the items and buildings panes, built from what the worker posts. |
| `components/BuildOrder.jsx` | The build order: the plan as staged rows of machines to place, read forwards from the ore. |
| `components/Planner.jsx` | The page: item pickers, options, tabs, loader — the half that used to live in the upstream site's templates. |
| `components/ProductionGraph.jsx` | The factory layout, cytoscape + ELK, with the stylesheet the upstream page used. |
| `scripts/buildGameData.mjs` | The FactorioLab → worker schema adapter, and the sprite slicer. |
| `public/data/game.json`, `public/icons/` | Its output, fetched by the page at runtime. |

Share URLs keep the upstream `/json/<url-encoded JSON>` shape, so links made by
the original planner open here unchanged.

### The worker only builds the tab you are looking at

There are four results — the build order, the layout, the items list and the
buildings list — and every run used to build all four before it said it was
done. Three of them were work nobody had asked to see, and on a large plan that
is most of the run: for 6000 Assembling Machine Mk.II a minute the calculation
is ~320 ms and the results on top of it are the rest.

The page now names the tab it is showing, the worker builds that one, and the
worker stays alive holding the graph it worked out. Opening another tab sends
`requestPanes`, which is answered out of that graph — nothing is recalculated.
The worker is terminated when the next calculation starts.

| Tab open when the plan changes | Worker | Posted |
| --- | ---: | ---: |
| all four, as it used to | 452 ms | 19.40 MB |
| Layout | 350 ms | 12.45 MB |
| Build order | 396 ms | 6.63 MB |
| Items | 334 ms | 9 KB |
| Buildings | 330 ms | 9 KB |

Sending no `panes` at all builds everything, in tab order, which is what the
differential suite relies on.

`lib/resultHtml.mjs` interpolates item names and URLs straight into markup,
exactly as `src/Worker.js` did upstream. That is safe because the table is
generated here from a pinned source; it would not be safe against an arbitrary
feed, which is one reason there is no longer an option to point it at one.

## Tests

`npm test` runs the differential, pane and unit suites over `src/Worker.js` — see
[test/README.md](test/README.md). They diff the current worker against the
reference implementation over fixtures of their own, so they are independent of
whatever dataset ships: the calculation is untouched by this conversion, and
those tests are what pins it that way.

## Attribution

The planner comes from [AnthorNet/DSP-ProductionPlanner](https://github.com/AnthorNet/DSP-ProductionPlanner)
(ISC); the game data and icons come from [FactorioLab](https://github.com/factoriolab/factoriolab)
(MIT); the art is Youthcat Studio's. See [THIRD-PARTY.md](THIRD-PARTY.md).

<!-- ROADMAP -->
## Roadmap

Proliferator, sorter counts, belt stacking, idle drain and the Dark Fog machines
are all carried in the upstream data (`flags: [beltStack, inactiveDrain,
miningSpeed, power, proliferator]`) and modelled by none of `src/Worker.js` yet.
The adapter is the prerequisite for all of them.

See the [open issues](https://github.com/robert-wl/DSP-ProductionPlanner/issues) for a list of proposed features (and known issues).
