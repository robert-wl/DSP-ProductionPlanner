# Tests

The planner's calculation was optimized for speed, not changed in behaviour.
These tests exist to keep it that way.

## How it works

`test/fixtures/referenceWorker.js` is a verbatim copy of `src/Worker.js` as it
stood at commit `6afbc50`, before the optimization. `test/differential.test.js`
runs it and the current `src/Worker.js` side by side over the same scenarios
and requires byte-identical results — node ids, edge quantities, required
power, everything.

The reference worker posts the three list panes as HTML strings it concatenates
itself. The current one posts the data behind them and `lib/resultHtml.mjs`
turns that into markup, so `runWorker.js` renders before comparing. The
differential therefore pins the renderer as well: the HTML it produces has to
match the reference's byte for byte.

`test/runWorker.js` loads either worker into a `vm` context whose `self` is the
context global, which is what a real WebWorker scope gives it. The worker keeps
all of its state on `self`, and `generateTreeList` reads `requestedItems` as a
bare global, so that detail matters.

The production tree pane is left out of the differential on purpose. It is
`components/BuildOrder.jsx` now — the plan read forwards from the ore and
grouped into stages, rather than the reference's backwards nesting — so there
is no upstream markup for it to match. `test/buildOrder.test.js` pins it
instead, on the promise it actually makes: that the stages can be built in the
order given without ever reaching for something that does not exist yet.

`test/panes.test.js` covers the part the differential cannot: it always asks
for every result, so it never exercises a run that builds one. These check that
a result built on demand is identical to the one a full run posts, that a run
builds nothing it was not asked for, and that the graph comes out the same
whichever pane ran first — it used to depend on the order, because the tree
walk tagged merger and splitter nodes the graph then carried.

`test/recipeChoice.test.js` covers the sidebar's per-item recipe choice, which
is a client-side reading of the worker's `altRecipes` list: that the recipe
`lib/plannerState.js` shows as the automatic one is the recipe the worker picks,
and that a choice per item survives being flattened into the one list the worker
takes - including when a by-product recipe would otherwise answer for an item
that chose something else. It runs over the synthetic fixture and the real
`public/data/game.json`, where those cases actually occur.

`test/units.test.js` covers the individual lookups and helpers that were
replaced, including the ones whose contract is easy to get subtly wrong:
"first match wins" in the class-name index, and the belt-speed clamp landing on
exactly the value the original decrement loop reached.

## Running them

```
npm test              # differential + pane + build-order + unit tests
npm run benchmark     # times the current worker against the reference
```

The suite takes a while, most of it spent in the reference implementation.
That is the point.

## Changing the planner's output

If a change to `src/Worker.js` is *meant* to change what the planner produces,
the differential tests will fail by design. Update
`test/fixtures/referenceWorker.js` to the new intended behaviour in the same
commit, and say so in the commit message.

## Fixtures

`test/fixtures/gameData.js` is a synthetic, DSP-shaped dataset rather than a
dump of the real game data: it is small enough to reason about while still
covering ore extraction, smelting, assembling at three tiers, multi-output
refining (by-products), alternative recipes, and a deliberately belt-hungry
recipe that forces the throughput clamp to engage.
