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
