'use strict';

/**
 * The planner's inputs, and the two shapes they have to travel in:
 *
 *  - `formData`, the flat object src/Worker.js expects. Its rules are copied
 *    from src/DSPCPP.js's updateRequired(): an option is only sent when it
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
    altRecipes          : []
};

const OPTION_KEYS = [
    'input', 'view', 'direction', 'mergeBuildings', 'useManifolds',
    'maxLevel', 'maxBeltSpeed', 'maxAssemblerSpeed', 'altRecipes'
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

export function shareUrlFor(payload)
{
    return '/json/' + encodeURIComponent(JSON.stringify(payload));
}
