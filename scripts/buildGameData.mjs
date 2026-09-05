/**
 * Turns the vendored FactorioLab DSP dataset into the table src/Worker.js
 * expects, and slices the sprite sheet into one icon per item.
 *
 *   node scripts/buildGameData.mjs
 *
 * Inputs  : vendor/factoriolab/{data.json,defaults.json,icons.webp}
 * Outputs : public/data/game.json, public/icons/<id>.webp
 *
 * This runs as a checked-in generator, not at request time - the app is fully
 * static and has no runtime dependency on anything upstream.
 *
 * The two schemas, side by side:
 *
 *   concept          | src/Worker.js            | FactorioLab
 *   -----------------|--------------------------|--------------------------
 *   shape            | objects keyed by class   | flat arrays with `id`
 *   recipe inputs    | ingredients              | in:  {id: qty}
 *   recipe outputs   | produce                  | out: {id: qty}
 *   producer         | mProducedIn              | producers: [machineId]
 *   machine stats    | fields on the building   | item.machine.{usage,drain,speed}
 *   icon             | image (URL string)       | sprite {id,x,y,color}
 *   alternatives     | _Alternative class name  | defaults.excludedRecipes
 */

import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

import sharp from 'sharp';

const ROOT          = join(dirname(fileURLToPath(import.meta.url)), '..');
const VENDOR_DIR    = join(ROOT, 'vendor', 'factoriolab');
const DATA_OUT      = join(ROOT, 'public', 'data', 'game.json');
const ICONS_OUT     = join(ROOT, 'public', 'icons');

// The sprite is a 23x23 grid of 64px cells; every icon carries its own
// pixel offset into it.
const ICON_SIZE = 64;

// Item categories worth carrying. `technologies`, `upgrades` and `effects`
// are 312 of the 486 entries and nothing in the planner reads them.
const KEPT_ITEM_CATEGORIES      = new Set(['components', 'buildings', 'buildings-alt']);
const KEPT_RECIPE_CATEGORIES    = new Set(['components', 'buildings']);
const BUILDING_CATEGORIES       = new Set(['buildings', 'buildings-alt']);

/**
 * Machines kept out of every `mProducedIn` list.
 *
 * src/Worker.js picks the LAST available producer of a recipe, so any machine
 * left in the list silently becomes the default. These are all newer tiers the
 * planner has no UI to choose between - the assembler select in
 * lib/plannerState.js only knows Mk.I/II/III - and the Dark Fog machines carry
 * mechanics (proliferator, drain) the worker does not model yet. Phase 2:
 * teach the worker about them and shorten this list.
 *
 * They stay in the dataset as buildable items; this only stops them being
 * chosen to produce something.
 */
const EXCLUDED_PRODUCERS = new Set([
    'df-recomposing-assembler',
    'df-negentropy-smelter',
    'df-self-evolution-lab',
    'quantum-chemical-plant',
    'advanced-mining-machine',
    'ray-receiver-pro'
]);

/**
 * Buildings whose output the worker reads off the building instead of off a
 * recipe (`extractionRate`), which makes their recipes leaves of the tree.
 */
const EXTRACTION_MACHINES = new Set([
    'mining-machine',
    'advanced-mining-machine',
    'water-pump',
    'oil-extractor',
    'orbital-collector',
    'ray-receiver',
    'ray-receiver-pro'
]);

// Veins a mining machine is assumed to cover. Not in the upstream data, and
// the worker multiplies extractionRate by it for 'Mining_Machine' only.
const MINING_VEINS = 6;

/**
 * Recipes dropped outright.
 *
 * The orbital collector's are map-capped pseudo-recipes (a gas giant is not
 * something you build), and the old bundled table did not have them either.
 */
const DROPPED_PRODUCERS = new Set(['orbital-collector']);

/**
 * Class names the worker or the UI refers to by literal.
 *
 * src/Worker.js is pinned byte for byte by the differential tests, so the data
 * bends to it: it deletes `Assembling_Machine_Mk1/2/3` when the assembler
 * select is used, reads `buildings.ConveyorBeltMk1` and `buildings.Splitter`
 * for merge/split nodes, special-cases the `Mining_Machine` key, and skips
 * `Recipe_X-Ray_Alternative` when looking for a way to make something.
 */
const CLASS_NAME_OVERRIDES = {
    'assembling-machine-1'  : 'Assembling_Machine_Mk1',
    'assembling-machine-2'  : 'Assembling_Machine_Mk2',
    'assembling-machine-3'  : 'Assembling_Machine_Mk3',
    'conveyor-belt-1'       : 'ConveyorBeltMk1',
    'conveyor-belt-2'       : 'ConveyorBeltMk2',
    'conveyor-belt-3'       : 'ConveyorBeltMk3'
};

const RECIPE_NAME_OVERRIDES = {
    'x-ray-cracking'        : 'Recipe_X-Ray_Alternative'
};

/**
 * Recipes treated as alternatives on top of `defaults.excludedRecipes`.
 *
 * Deuterium fractionation is a primary recipe upstream, but the worker would
 * then have to choose between it and the particle collider by raw throughput;
 * the old bundled table shipped it as an alternative and this keeps that.
 */
const EXTRA_ALTERNATIVES = new Set(['deuterium-fractionation']);

/**
 * Recipes upstream calls alternatives that have to stay primary here.
 *
 * Fire ice is normally collected off an ice giant, so FactorioLab excludes the
 * vein; the orbital collector's recipes are dropped below, which would leave
 * fire ice with no default way to make it at all.
 */
const FORCED_PRIMARIES = new Set(['fire-ice-vein']);

/**
 * Work power for machines the upstream data leaves out, in kW.
 *
 * FactorioLab omits `usage` where the game scales it (a mining machine's draw
 * follows its vein count and mining speed). These are the flat numbers the old
 * bundled table used, and they match the in-game description.
 */
const POWER_FALLBACK_KW = {
    'mining-machine'    : 420,
    'orbital-collector' : 30000
};

/**
 * The fractionator converts roughly 1% of the hydrogen passing through it,
 * which the upstream recipe expresses as a per-item 0.01 in / 0.01 out pair
 * that only makes sense with FactorioLab's own belt model. Taken literally it
 * would turn hydrogen into deuterium one for one. The old bundled table's
 * 100:1 is the number to keep.
 */
const RECIPE_FIXUPS = {
    'deuterium-fractionation': {in: {hydrogen: 100}, out: {deuterium: 1}, time: 1}
};

// Categories. Only three of these mean anything to src/Worker.js: `ore` stops
// the "max levels" cut from folding a raw resource into a leaf node, and
// `liquid`/`gas` divide the requested quantity by 1000. The rest group the
// item picker, and follow the names the old bundled table used.
const LIQUIDS = new Set(['water', 'crude-oil', 'refined-oil', 'sulfuric-acid']);
const FUELS   = new Set([
    'plant-fuel', 'log', 'energetic-graphite',
    'hydrogen-fuel-rod', 'deuteron-fuel-rod', 'antimatter-fuel-rod',
    'df-strange-annihilation-fuel-rod'
]);
const SPECIAL_ITEMS = new Set([
    'solar-sail', 'dyson-sphere-component', 'small-carrier-rocket', 'foundation',
    'logistics-bot', 'logistics-drone', 'logistics-vessel',
    'proliferator-1', 'proliferator-2', 'proliferator-3'
]);

const BUILDING_CATEGORY_BY_ID = {
    'mining-machine'                : 'extraction',
    'advanced-mining-machine'       : 'extraction',
    'oil-extractor'                 : 'extraction',
    'water-pump'                    : 'extraction',
    'orbital-collector'             : 'extraction',

    'arc-smelter'                   : 'production',
    'plane-smelter'                 : 'production',
    'df-negentropy-smelter'         : 'production',
    'assembling-machine-1'          : 'production',
    'assembling-machine-2'          : 'production',
    'assembling-machine-3'          : 'production',
    'df-recomposing-assembler'      : 'production',
    'chemical-plant'                : 'production',
    'quantum-chemical-plant'        : 'production',
    'oil-refinery'                  : 'production',
    'miniature-particle-collider'   : 'production',
    'fractionator'                  : 'production',
    'matrix-lab'                    : 'production',
    'df-self-evolution-lab'         : 'production',
    'spray-coater'                  : 'production',

    'wind-turbine'                  : 'generator',
    'solar-panel'                   : 'generator',
    'thermal-power-plant'           : 'generator',
    'geothermal-power-station'      : 'generator',
    'mini-fusion-power-plant'       : 'generator',
    'artificial-star'               : 'generator',
    'ray-receiver'                  : 'generator',
    'ray-receiver-pro'              : 'generator',

    'storage-1'                     : 'storage',
    'storage-2'                     : 'storage',
    'storage-tank'                  : 'storage',
    'accumulator'                   : 'storage',
    'accumulator-full'              : 'storage',

    'conveyor-belt-1'               : 'logistic',
    'conveyor-belt-2'               : 'logistic',
    'conveyor-belt-3'               : 'logistic',
    'splitter'                      : 'logistic',
    'automatic-piler'               : 'logistic',
    'traffic-monitor'               : 'logistic',
    'logistics-distributor'         : 'logistic',
    'sorter-1'                      : 'logistic',
    'sorter-2'                      : 'logistic',
    'sorter-3'                      : 'logistic',
    'sorter-4'                      : 'logistic',

    'tesla-tower'                   : 'powerTransmission',
    'wireless-power-tower'          : 'powerTransmission',
    'satellite-substation'          : 'powerTransmission',
    'energy-exchanger'              : 'powerTransmission',

    'planetary-logistics-station'   : 'planetaryLogistic',
    'interstellar-logistics-station': 'interstellarLogistic',

    'em-rail-ejector'               : 'special',
    'vertical-launching-silo'       : 'special',
    'holo-beacon'                   : 'special'
};

const WIKI_BASE = 'https://dsp-wiki.com/';

function classNameFor(id)
{
    if(CLASS_NAME_OVERRIDES[id] !== undefined)
    {
        return CLASS_NAME_OVERRIDES[id];
    }

    return id.split('-')
             .map(function(part){ return part.charAt(0).toUpperCase() + part.slice(1); })
             .join('_');
}

function recipeClassNameFor(id, isAlternative)
{
    if(RECIPE_NAME_OVERRIDES[id] !== undefined)
    {
        return RECIPE_NAME_OVERRIDES[id];
    }

    return 'Recipe_' + classNameFor(id) + (isAlternative === true ? '_Alternative' : '');
}

function wikiUrlFor(name)
{
    return WIKI_BASE + encodeURIComponent(name.replace(/ /g, '_'));
}

function itemCategoryFor(item, oreIds)
{
    if(LIQUIDS.has(item.id) === true)
    {
        return 'liquid';
    }

    if(oreIds.has(item.id) === true)
    {
        return 'ore';
    }

    if(item.id.endsWith('-matrix') === true)
    {
        return item.id.startsWith('df-') === true ? 'dark-fog' : 'science-matrix';
    }

    if(FUELS.has(item.id) === true)
    {
        return 'fuel';
    }

    if(item.id.startsWith('df-') === true)
    {
        return 'dark-fog';
    }

    if(SPECIAL_ITEMS.has(item.id) === true)
    {
        return 'special';
    }

    // Everything left splits the way the old table split it: assembled things
    // are components, anything a smelter / chemical plant / refinery / collider
    // turns out is a material.
    return item.assembled === true ? 'component' : 'material';
}

/**
 * How much a building pulls out of the ground per minute, read off the
 * recipes it is the producer of: the worker holds this on the building, not
 * on the recipe.
 */
function extractionRateFor(machineId, recipes, speed, warnings)
{
    let rates = new Set();

    for(let recipe of recipes)
    {
        if((recipe.producers || []).includes(machineId) === false)
        {
            continue;
        }

        let produced = Object.values(recipe.out || {}).reduce(function(sum, qty){ return sum + qty; }, 0);

            if(produced > 0 && recipe.time > 0)
            {
                rates.add(Math.round(60 / recipe.time * produced * (speed || 1) * 1000) / 1000);
            }
    }

    if(rates.size === 0)
    {
        return undefined;
    }

    if(rates.size > 1)
    {
        warnings.push(machineId + ' has recipes of differing rates (' + [...rates].join(', ')
                    + '/min); the worker can only hold one on the building, using the first.');
    }

    return [...rates][0];
}

async function main()
{
    let data     = JSON.parse(await readFile(join(VENDOR_DIR, 'data.json'), 'utf8'));
    let defaults = JSON.parse(await readFile(join(VENDOR_DIR, 'defaults.json'), 'utf8'));

    let warnings = [];

    let iconById = new Map(data.icons.map(function(icon){ return [icon.id, icon]; }));

    let keptItems = data.items.filter(function(item){ return KEPT_ITEM_CATEGORIES.has(item.category); });

    // Which recipes survive, and how they are named ------------------------
    let alternatives = new Set([...defaults.excludedRecipes, ...EXTRA_ALTERNATIVES]);

        for(let id of FORCED_PRIMARIES)
        {
            alternatives.delete(id);
        }

    let keptRecipes = data.recipes.filter(function(recipe){
        if(KEPT_RECIPE_CATEGORIES.has(recipe.category) === false)
        {
            return false;
        }

        let producers = recipe.producers || [];

            // Map-capped pseudo-recipes.
            if(producers.length > 0 && producers.every(function(id){ return DROPPED_PRODUCERS.has(id); }) === true)
            {
                return false;
            }

            // Nothing left to build it in once the newer tiers are held back.
            if(producers.length > 0 && producers.every(function(id){ return EXCLUDED_PRODUCERS.has(id); }) === true)
            {
                warnings.push('recipe ' + recipe.id + ' has no producer left after the exclusions; dropped.');
                return false;
            }

        return true;
    });

    // The two things a category depends on: what comes out of the ground,
    // and what comes out of an assembler.
    let oreIds      = new Set();
    let assembled   = new Set();

    for(let recipe of keptRecipes)
    {
        let producers = recipe.producers || [];

        if((recipe.flags || []).includes('mining') === true)
        {
            for(let id of Object.keys(recipe.out || {}))
            {
                if(LIQUIDS.has(id) === false)
                {
                    oreIds.add(id);
                }
            }
        }

        if(producers.some(function(id){ return id.startsWith('assembling-machine') === true; }) === true)
        {
            for(let id of Object.keys(recipe.out || {}))
            {
                assembled.add(id);
            }
        }
    }

    for(let item of keptItems)
    {
        item.assembled = assembled.has(item.id);
    }

    let machineSpeedById = new Map(keptItems
        .filter(function(item){ return item.machine !== undefined; })
        .map(function(item){ return [item.id, item.machine.speed]; }));

    // Buildings ------------------------------------------------------------
    let buildingsData   = {};
    let classNameById   = {};

    for(let item of keptItems)
    {
        let className = classNameFor(item.id);
            classNameById[item.id] = className;

        if(BUILDING_CATEGORIES.has(item.category) === false)
        {
            continue;
        }

        let entry = {
            className   : className,
            name        : item.name,
            category    : BUILDING_CATEGORY_BY_ID[item.id] || 'special',
            image       : '/icons/' + item.id + '.webp',
            url         : wikiUrlFor(item.name)
        };

        let machine = item.machine;

            if(machine !== undefined)
            {
                // Worker multiplies this by a percentage and divides by 1000
                // for the MW readout, so it always has to be a number.
                entry.powerUsed = machine.usage || POWER_FALLBACK_KW[item.id] || 0;

                if(machine.drain !== undefined)
                {
                    entry.idlePower = machine.drain;
                }

                if(EXTRACTION_MACHINES.has(item.id) === true)
                {
                    let rate = extractionRateFor(item.id, keptRecipes, machine.speed, warnings);

                        if(rate !== undefined)
                        {
                            // Machine speed is already folded in here; leaving
                            // productionSpeed on as well would count it twice.
                            entry.extractionRate = rate;

                            if(item.id.endsWith('mining-machine') === true)
                            {
                                entry.input = MINING_VEINS;
                            }
                        }
                }
                else if(machine.speed !== undefined)
                {
                    entry.productionSpeed = machine.speed;
                }
            }

            if(item.belt !== undefined)
            {
                entry.beltSpeed = item.belt.speed;
            }

            if(item.stack !== undefined)
            {
                entry.stack = item.stack;
            }

        let icon = iconById.get(item.icon || item.id);

            if(icon !== undefined && icon.color !== undefined)
            {
                entry.color = icon.color;
            }

        buildingsData[className] = entry;
    }

    // Items ----------------------------------------------------------------
    let itemsData = {};

    for(let item of keptItems)
    {
        if(BUILDING_CATEGORIES.has(item.category) === true)
        {
            continue;
        }

        let className = classNameById[item.id];
        let icon      = iconById.get(item.icon || item.id);

        let entry = {
            className   : className,
            name        : item.name,
            category    : itemCategoryFor(item, oreIds),
            image       : '/icons/' + item.id + '.webp',
            url         : wikiUrlFor(item.name)
        };

            if(icon !== undefined && icon.color !== undefined)
            {
                entry.color = icon.color;
            }

            if(item.stack !== undefined)
            {
                entry.stack = item.stack;
            }

            if(item.fuel !== undefined)
            {
                entry.energy = item.fuel.value;
            }

        itemsData[className] = entry;
    }

    // Recipes --------------------------------------------------------------
    let recipesData = {};

    for(let recipe of keptRecipes)
    {
        let fixup           = RECIPE_FIXUPS[recipe.id];
        let inputs          = (fixup !== undefined ? fixup.in : recipe.in) || {};
        let outputs         = (fixup !== undefined ? fixup.out : recipe.out) || {};
        let time            = fixup !== undefined ? fixup.time : recipe.time;

        let isAlternative   = alternatives.has(recipe.id);
        let className       = recipeClassNameFor(recipe.id, isAlternative);

        let producedIn      = (recipe.producers || [])
            .filter(function(id){ return EXCLUDED_PRODUCERS.has(id) === false && DROPPED_PRODUCERS.has(id) === false; })
            .map(function(id){ return classNameById[id]; })
            .filter(function(name){ return name !== undefined; });

        let ingredients     = {};
        let produce         = {};
        let unknown         = false;

            for(let [id, qty] of Object.entries(inputs))
            {
                if(classNameById[id] === undefined)
                {
                    unknown = true;
                    continue;
                }

                ingredients[classNameById[id]] = qty;
            }

            for(let [id, qty] of Object.entries(outputs))
            {
                if(classNameById[id] === undefined)
                {
                    unknown = true;
                    continue;
                }

                produce[classNameById[id]] = qty;
            }

            if(unknown === true)
            {
                warnings.push('recipe ' + recipe.id + ' refers to an item outside the kept categories.');
            }

            if(Object.keys(produce).length === 0)
            {
                continue;
            }

            if(recipesData[className] !== undefined)
            {
                warnings.push('recipe class name collision on ' + className + ' (' + recipe.id + ').');
            }

        recipesData[className] = {
            className                       : className,
            name                            : recipe.name,
            ingredients                     : ingredients,
            produce                         : produce,
            // The worker walks this list backwards and takes the first
            // building it still has, so the highest tier has to come last -
            // which is the order upstream already uses.
            mProducedIn                     : producedIn,
            mManufactoringDuration          : time,
            mManualManufacturingMultiplier  : 1
        };
    }

    // Icons ----------------------------------------------------------------
    await rm(ICONS_OUT, {recursive: true, force: true});
    await mkdir(ICONS_OUT, {recursive: true});

    let sprite      = sharp(join(VENDOR_DIR, 'icons.webp'));
    let spriteMeta  = await sprite.metadata();
    let sliced      = 0;

    for(let item of keptItems)
    {
        let icon = iconById.get(item.icon || item.id);

            if(icon === undefined)
            {
                warnings.push('no icon for ' + item.id + '.');
                continue;
            }

            if(icon.x + ICON_SIZE > spriteMeta.width || icon.y + ICON_SIZE > spriteMeta.height)
            {
                warnings.push('icon for ' + item.id + ' falls outside the sprite.');
                continue;
            }

        await sharp(join(VENDOR_DIR, 'icons.webp'))
            .extract({left: icon.x, top: icon.y, width: ICON_SIZE, height: ICON_SIZE})
            .webp({quality: 80, effort: 6})
            .toFile(join(ICONS_OUT, item.id + '.webp'));

        sliced++;
    }

    // Write ----------------------------------------------------------------
    let payload = {
        branch          : 'Stable',
        language        : 'en',
        gameVersion     : data.version.DSP,
        source          : 'FactorioLab (vendor/factoriolab, see SOURCE.md)',
        buildingsData   : buildingsData,
        itemsData       : itemsData,
        recipesData     : recipesData
    };

    await mkdir(dirname(DATA_OUT), {recursive: true});
    await writeFile(DATA_OUT, JSON.stringify(payload, null, 4) + '\n');

    console.log('DSP ' + data.version.DSP);
    console.log('  buildings : ' + Object.keys(buildingsData).length);
    console.log('  items     : ' + Object.keys(itemsData).length);
    console.log('  recipes   : ' + Object.keys(recipesData).length
              + ' (' + Object.keys(recipesData).filter(function(k){ return k.includes('_Alternative'); }).length + ' alternative)');
    console.log('  icons     : ' + sliced);

    for(let warning of warnings)
    {
        console.warn('  ! ' + warning);
    }
}

await main();
