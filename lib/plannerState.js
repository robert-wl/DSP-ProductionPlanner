'use strict';

/**
 * The planner's inputs, and the two shapes they have to travel in:
 *
 *  - `formData`, the flat object src/Worker.js expects. Its rules are copied
 *    from the upstream page's updateRequired(): an option is only sent when it
 *    differs from the worker's own default, because the worker treats
 *    "present" as "the user chose this" when it builds the share URL.
 *  - the `/json/<payload>` share URL, whose payload is exactly the object the
 *    worker posts back as `updateUrl`.
 */

export const ASSEMBLER_SPEEDS = [
    {value: 'Assembling_Machine_Mk1', label: 'Assembler Mk.I'},
    {value: 'Assembling_Machine_Mk2', label: 'Assembler Mk.II'},
    {value: 'Assembling_Machine_Mk3', label: 'Assembler Mk.III'}
];

export const SMELTER_SPEEDS = [
    {value: 'Arc_Smelter',   label: 'Arc Smelter'},
    {value: 'Plane_Smelter', label: 'Plane Smelter'}
];

/**
 * Machine tiers the worker has no option for.
 *
 * src/Worker.js only knows `maxAssemblerSpeed`, whose handling names the three
 * assembler keys outright; every other recipe just goes to the last machine
 * listed in its `mProducedIn`, which is the highest tier. The worker is pinned
 * byte for byte by the differential tests, so instead of teaching it a second
 * option, `recipesForState` below narrows `mProducedIn` before the table is
 * handed over - the worker then has nothing to choose between.
 *
 * Adding another group (chemical plants, say) is one entry here plus the
 * matching key in DEFAULT_STATE and OPTION_KEYS.
 */
export const CLIENT_MACHINE_TIERS = [
    {key: 'maxSmelterSpeed', label: 'Smelter', options: SMELTER_SPEEDS}
];

export const DIRECTIONS = [
    {value: 'RIGHT', label: 'Left to right'},
    {value: 'DOWN',  label: 'Top to bottom'},
    {value: 'LEFT',  label: 'Right to left'},
    {value: 'UP',    label: 'Bottom to top'}
];

// Worker defaults, from self.options in src/Worker.js. maxBeltSpeed is held
// here in items/second, the unit the worker multiplies by 60.
export const DEFAULT_STATE = {
    outputs             : {},
    inputs              : {},
    view                : 'REALISTIC',
    direction           : 'RIGHT',
    mergeBuildings      : '1',
    useManifolds        : '1',
    maxLevel            : '',
    maxBeltSpeed        : '30',
    maxAssemblerSpeed   : 'Assembling_Machine_Mk2',
    // The tier the worker would have picked on its own, so the default run is
    // the one this planner has always produced.
    maxSmelterSpeed     : 'Plane_Smelter',
    altRecipes          : []
};

const OPTION_KEYS = [
    'input', 'view', 'direction', 'mergeBuildings', 'useManifolds',
    'maxLevel', 'maxBeltSpeed', 'maxAssemblerSpeed', 'maxSmelterSpeed', 'altRecipes'
];

function positiveQuantities(quantities)
{
    let cleaned = {};

    for(let itemId in quantities)
    {
        let quantity = parseFloat(quantities[itemId]);

            if(isNaN(quantity) === false && quantity > 0)
            {
                cleaned[itemId] = String(quantity);
            }
    }

    return cleaned;
}

/**
 * The recipe table with every tier the run is not using taken out of
 * `mProducedIn`.
 *
 * The worker walks that list backwards and builds in the first machine it
 * still has, so leaving one entry decides the machine. Recipes that do not
 * mention the group are passed through untouched, and so is the table itself
 * when nothing needs narrowing.
 */
export function recipesForState(state, recipesData)
{
    let narrowed = null;

    for(let recipeId in recipesData)
    {
        let recipe      = recipesData[recipeId];
        let producedIn  = recipe.mProducedIn;

            if(Array.isArray(producedIn) === false)
            {
                continue;
            }

        for(let tier of CLIENT_MACHINE_TIERS)
        {
            let chosen  = state[tier.key];
            let known   = tier.options.map(function(option){ return option.value; });
            let present = producedIn.filter(function(building){ return known.includes(building) === true; });

                // Not this group's recipe, or the choice is not one of the
                // machines it can be made in anyway.
                if(present.length < 2 || present.includes(chosen) === false)
                {
                    continue;
                }

            producedIn = producedIn.filter(function(building){
                return known.includes(building) === false || building === chosen;
            });
        }

        if(producedIn !== recipe.mProducedIn)
        {
            if(narrowed === null)
            {
                narrowed = {...recipesData};
            }

            narrowed[recipeId] = {...recipe, mProducedIn: producedIn};
        }
    }

    return narrowed === null ? recipesData : narrowed;
}

/**
 * Everything the pickers can offer, keyed the way the worker keys it.
 *
 * Buildings are craftable, and the worker plans them like anything else - it
 * merges the two tables into one `self.items` the moment it starts - so the
 * page has to offer both or half the game is unreachable. Anything no recipe
 * makes and no recipe uses is left out: that is data with nothing behind it,
 * and picking it would only ever draw a lone node.
 */
export function pickableItems(gameData)
{
    if(gameData === null || gameData === undefined)
    {
        return {};
    }

    let known = {...gameData.itemsData, ...gameData.buildingsData};
    let used  = new Set();

    for(let recipeId in gameData.recipesData)
    {
        let recipe = gameData.recipesData[recipeId];

            for(let className in recipe.produce || {})
            {
                used.add(className);
            }
            for(let className in recipe.ingredients || {})
            {
                used.add(className);
            }
    }

    let pickable = {};

    for(let className in known)
    {
        if(used.has(className) === true)
        {
            pickable[className] = known[className];
        }
    }

    return pickable;
}

/**
 * The recipes an item can be made by, and the one the planner settles on when
 * the page says nothing.
 *
 * src/Worker.js resolves an item in findRecipeToProduceItemId: the first entry
 * of `altRecipes` that produces the item wins outright, and with nothing to go
 * on it sorts the recipes not marked `_Alternative` - fewest outputs, then
 * fastest, then by name - and takes the first. So `altRecipes` is already a
 * "use this one instead" list. It is just not keyed by item, and the page only
 * ever offered the `_Alternative` half of the table, which left the choices
 * between two ordinary recipes (sulfuric acid from a chemical plant or off an
 * ocean, organic crystal grown or mined) made silently and unreachable.
 *
 * These helpers turn that list into a choice per item and back again, which is
 * what the sidebar needs, and leave the worker alone - the same trade
 * CLIENT_MACHINE_TIERS makes above.
 *
 * Item ids and class names are the same string throughout the built game data,
 * so these work in class names and hand them back as item ids.
 */

const ALTERNATIVE_MARKER = '_Alternative';

function recipesByProduct(recipesData)
{
    let byProduct = {};

    for(let recipeId in recipesData)
    {
        for(let className in recipesData[recipeId].produce || {})
        {
            if(byProduct[className] === undefined)
            {
                byProduct[className] = [];
            }

            byProduct[className].push(recipeId);
        }
    }

    return byProduct;
}

/**
 * The recipe the worker picks for a class name on its own, mirroring the
 * fallback half of findRecipeToProduceItemId. Recipes are read in table order,
 * because the worker indexes them that way and its sort is a stable one.
 */
export function autoRecipeFor(className, recipesData, byProduct)
{
    let produced = (byProduct === undefined ? recipesByProduct(recipesData) : byProduct)[className];

        if(produced === undefined)
        {
            return null;
        }

    let candidates = produced.filter(function(recipeId){ return recipeId.indexOf(ALTERNATIVE_MARKER) === -1; });

        if(candidates.length === 0)
        {
            return null;
        }

        // The worker's own special case, ahead of any sorting.
        if(className === 'Hydrogen')
        {
            return 'Recipe_Plasma_Refining';
        }

    let sorted = candidates.slice().sort(function(a, b){
        let recipeA = recipesData[a];
        let recipeB = recipesData[b];
        let lengthA = Object.keys(recipeA.produce || {}).length;
        let lengthB = Object.keys(recipeB.produce || {}).length;

            if(lengthA === lengthB)
            {
                let rateA = 60 / recipeA.mManufactoringDuration * recipeA.produce[className];
                let rateB = 60 / recipeB.mManufactoringDuration * recipeB.produce[className];

                    if(rateA === rateB)
                    {
                        return (recipeA.name || a).localeCompare(recipeB.name || b);
                    }

                return rateB - rateA;
            }

        return lengthA - lengthB;
    });

    return sorted[0];
}

function recipeDetail(recipe, known)
{
    let producedIn  = recipe.mProducedIn || [];
    // The worker walks that list backwards and builds in the first machine it
    // still has, so the last entry is the one it lands on.
    let machine     = known[producedIn[producedIn.length - 1]];
    let inputs      = Object.keys(recipe.ingredients || {}).map(function(className){
        let item = known[className];

        return recipe.ingredients[className] + ' \u00d7 ' + (item === undefined ? className : (item.name || className));
    });

    return [
        machine === undefined ? null : machine.name,
        inputs.length === 0 ? 'no inputs' : inputs.join(', ')
    ].filter(function(part){ return part !== null && part !== undefined; }).join(' \u00b7 ');
}

/**
 * One row per item that more than one recipe makes, which is the only place a
 * choice exists to offer.
 */
export function recipeChoicesFor(gameData)
{
    if(gameData === null || gameData === undefined)
    {
        return [];
    }

    let recipesData = gameData.recipesData || {};
    let byProduct   = recipesByProduct(recipesData);
    let known       = {...gameData.itemsData, ...gameData.buildingsData};
    let rows        = [];

    for(let className in byProduct)
    {
        if(byProduct[className].length < 2)
        {
            continue;
        }

        let item = known[className];

        rows.push({
            itemId  : className,
            name    : item === undefined ? className : (item.name || className),
            image   : item === undefined ? null : (item.image || null),
            auto    : autoRecipeFor(className, recipesData, byProduct),
            recipes : byProduct[className].map(function(recipeId){
                return {
                    id      : recipeId,
                    name    : recipesData[recipeId].name || recipeId,
                    detail  : recipeDetail(recipesData[recipeId], known)
                };
            })
        });
    }

    return rows.sort(function(a, b){ return a.name.localeCompare(b.name); });
}

/**
 * Which recipe an `altRecipes` list is choosing for each item: the first entry
 * that produces it, the same way the worker reads the list. Items with only
 * one recipe are left out - nothing was chosen there.
 */
export function recipeChoicesFrom(altRecipes, gameData)
{
    let choices = {};

    if(Array.isArray(altRecipes) === false || gameData === null || gameData === undefined)
    {
        return choices;
    }

    let byProduct = recipesByProduct(gameData.recipesData || {});

    for(let className in byProduct)
    {
        if(byProduct[className].length < 2)
        {
            continue;
        }

        for(let recipeId of altRecipes)
        {
            if(byProduct[className].includes(recipeId) === true)
            {
                choices[className] = recipeId;
                break;
            }
        }
    }

    return choices;
}

/**
 * The `altRecipes` list those choices need, ordered so each one is found for
 * its own item first.
 *
 * A recipe with by-products answers for all of them, so a list that names one
 * can shadow a choice made further down it: picking mass energy storage for
 * hydrogen means nothing if X-ray cracking, picked for graphite, is read
 * first. Anything that also produces an item comes after the recipe chosen for
 * that item.
 */
export function altRecipesFrom(choices, recipesData)
{
    let nodes  = [];
    let owners = {};

    for(let className in choices)
    {
        let recipeId = choices[className];

            if(recipeId === undefined || recipeId === null || recipeId === '')
            {
                continue;
            }

            if(owners[recipeId] === undefined)
            {
                owners[recipeId] = [];
                nodes.push(recipeId);
            }

            owners[recipeId].push(className);
    }

    // Sorted, so the list a set of choices produces depends on the choices and
    // nothing else: the same picks share the same URL however they were made.
    nodes.sort();

    let blocked = {};
    let waiting = {};

    for(let recipeId of nodes)
    {
        blocked[recipeId] = [];
        waiting[recipeId] = 0;
    }

    for(let recipeId of nodes)
    {
        for(let className of owners[recipeId])
        {
            for(let other of nodes)
            {
                if(other === recipeId || blocked[recipeId].includes(other) === true)
                {
                    continue;
                }

                if(((recipesData[other] || {}).produce || {})[className] === undefined)
                {
                    continue;
                }

                blocked[recipeId].push(other);
                waiting[other] = waiting[other] + 1;
            }
        }
    }

    let ordered = [];
    let placed  = {};

    while(ordered.length < nodes.length)
    {
        let next = nodes.find(function(recipeId){ return placed[recipeId] !== true && waiting[recipeId] === 0; });

            // Two items each asking for a recipe the other's would shadow.
            // No order satisfies both, so keep the one they were made in.
            if(next === undefined)
            {
                next = nodes.find(function(recipeId){ return placed[recipeId] !== true; });
            }

        placed[next] = true;
        ordered.push(next);

        for(let other of blocked[next])
        {
            waiting[other] = waiting[other] - 1;
        }
    }

    return ordered;
}

export function buildFormData(state)
{
    let formData = positiveQuantities(state.outputs);
    let inputs   = positiveQuantities(state.inputs);

        if(Object.keys(inputs).length > 0)
        {
            formData.input = inputs;
        }

        formData.view       = state.view;
        formData.direction  = state.direction;
        formData.altRecipes = state.altRecipes.slice();

        // Only sent when switched away from the worker's default of 1, which
        // is what the original page's select did.
        if(state.mergeBuildings !== '1')
        {
            formData.mergeBuildings = state.mergeBuildings;
        }
        if(state.useManifolds !== '1')
        {
            formData.useManifolds = state.useManifolds;
        }

        if(state.maxLevel !== '' && state.maxLevel !== null)
        {
            formData.maxLevel = String(state.maxLevel);
        }
        if(state.maxBeltSpeed !== '' && state.maxBeltSpeed !== null)
        {
            formData.maxBeltSpeed = String(state.maxBeltSpeed);
        }

        formData.maxAssemblerSpeed = state.maxAssemblerSpeed;

    return formData;
}

/**
 * Turns the worker's `updateUrl` payload back into planner state. Anything
 * that is not one of the known option keys is a requested output item.
 */
export function stateFromPayload(payload, items)
{
    let state = {
        ...DEFAULT_STATE,
        outputs : {},
        inputs  : {},
        altRecipes : []
    };

    if(payload === null || typeof payload !== 'object')
    {
        return state;
    }

    for(let key in payload)
    {
        if(OPTION_KEYS.includes(key) === true)
        {
            continue;
        }

        // Ignore items the current game data no longer knows about.
        if(items !== undefined && items !== null && items[key] === undefined)
        {
            continue;
        }

        state.outputs[key] = String(payload[key]);
    }

    if(payload.input !== null && typeof payload.input === 'object')
    {
        for(let key in payload.input)
        {
            if(items === undefined || items === null || items[key] !== undefined)
            {
                state.inputs[key] = String(payload.input[key]);
            }
        }
    }

    if(payload.view === 'SIMPLE' || payload.view === 'REALISTIC')
    {
        state.view = payload.view;
    }
    if(DIRECTIONS.some(function(direction){ return direction.value === payload.direction; }) === true)
    {
        state.direction = payload.direction;
    }
    if(payload.mergeBuildings !== undefined)
    {
        state.mergeBuildings = String(payload.mergeBuildings);
    }
    if(payload.useManifolds !== undefined)
    {
        state.useManifolds = String(payload.useManifolds);
    }
    if(payload.maxLevel !== undefined)
    {
        state.maxLevel = String(payload.maxLevel);
    }
    if(payload.maxBeltSpeed !== undefined)
    {
        state.maxBeltSpeed = String(payload.maxBeltSpeed);
    }
    if(ASSEMBLER_SPEEDS.some(function(speed){ return speed.value === payload.maxAssemblerSpeed; }) === true)
    {
        state.maxAssemblerSpeed = payload.maxAssemblerSpeed;
    }
    for(let tier of CLIENT_MACHINE_TIERS)
    {
        if(tier.options.some(function(option){ return option.value === payload[tier.key]; }) === true)
        {
            state[tier.key] = payload[tier.key];
        }
    }
    if(Array.isArray(payload.altRecipes) === true)
    {
        state.altRecipes = payload.altRecipes.map(String);
    }

    return state;
}

export function parsePayload(encoded)
{
    if(encoded === undefined || encoded === null || encoded === '')
    {
        return null;
    }

    try
    {
        return JSON.parse(decodeURIComponent(encoded));
    }
    catch(error)
    {
        return null;
    }
}

/**
 * The worker posts back the state it ran with, which is what the share URL is
 * made of - but it only reports options it knows about, so the client-side
 * tiers have to be folded back in. Same rule the worker uses: an option is
 * only in the URL when it differs from the default.
 */
export function shareUrlFor(payload, state)
{
    let shared = payload;

        if(state !== undefined && state !== null)
        {
            for(let tier of CLIENT_MACHINE_TIERS)
            {
                if(state[tier.key] !== DEFAULT_STATE[tier.key])
                {
                    shared = {...shared, [tier.key]: state[tier.key]};
                }
            }
        }

    return '/json/' + encodeURIComponent(JSON.stringify(shared));
}
