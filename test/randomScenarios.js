'use strict';

/**
 * Deterministic pseudo-random scenario generator, used to widen the
 * differential test beyond the hand written cases.
 *
 * Quantities are kept moderate on purpose: this runs against the reference
 * implementation too, whose merge pass is quadratic in the number of nodes, so
 * a big order there costs seconds rather than milliseconds.
 */

const REQUESTABLE = [
    'Gear', 'Iron_Ingot', 'Copper_Ingot', 'Magnetic_Coil',
    'Electric_Motor', 'Circuit_Board', 'Plastic', 'Hydrogen', 'Refined_Oil',
    'Heavy_Frame'
];

function makeRandom(seed)
{
    let state = seed >>> 0;

    return function(){
        // xorshift32, so the same seed always yields the same scenarios
        state ^= state << 13; state >>>= 0;
        state ^= state >>> 17;
        state ^= state << 5;  state >>>= 0;

        return state / 4294967296;
    };
}

function generateScenarios(count, seed)
{
    let random      = makeRandom(seed || 20260905);
    let scenarios   = [];

    for(let i = 0; i < count; i++)
    {
        let formData = {altRecipes: []};
        let itemCount = 1 + Math.floor(random() * 3);

        for(let n = 0; n < itemCount; n++)
        {
            let itemId = REQUESTABLE[Math.floor(random() * REQUESTABLE.length)];

                // Heavy frames pull a whole sub-factory each, so keep them small
                formData[itemId] = Math.ceil(random() * (itemId === 'Heavy_Frame' ? 5 : 20)) * 30;
        }

        formData.mergeBuildings = (random() < 0.5) ? 1 : 0;
        formData.useManifolds   = (random() < 0.5) ? 1 : 0;

        if(random() < 0.4)
        {
            formData.maxBeltSpeed = [6, 12, 30, 60][Math.floor(random() * 4)];
        }
        if(random() < 0.3)
        {
            formData.maxAssemblerSpeed = ['Assembling_Machine_Mk1', 'Assembling_Machine_Mk2', 'Assembling_Machine_Mk3'][Math.floor(random() * 3)];
        }
        if(random() < 0.25)
        {
            formData.maxLevel = 2 + Math.floor(random() * 3);
        }
        if(random() < 0.2)
        {
            formData.altRecipes = ['Recipe_Circuit_Board_Alternative'];
        }
        if(random() < 0.2)
        {
            formData.view = 'SIMPLE';
        }
        if(random() < 0.2)
        {
            formData.input = {Iron_Ingot: Math.ceil(random() * 10) * 60};
        }

        scenarios.push({name: 'random #' + (i + 1) + ' ' + JSON.stringify(formData), formData: formData});
    }

    return scenarios;
}

module.exports = {generateScenarios};
