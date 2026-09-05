'use strict';

/**
 * Times the current worker against the reference implementation it was
 * optimized from. Not part of the test suite - run it by hand:
 *
 *   node test/benchmark.js
 */

const {outputOf, CURRENT_WORKER, REFERENCE_WORKER} = require('./runWorker.js');

const CASES = [
    {name: 'small chain',            formData: {Gear: 120, altRecipes: []}},
    {name: 'medium plan',            formData: {Electric_Motor: 600, Circuit_Board: 900, altRecipes: [], mergeBuildings: 1, useManifolds: 1}},
    {name: 'large plan',             formData: {Electric_Motor: 1800, Circuit_Board: 1800, Plastic: 600, altRecipes: [], mergeBuildings: 1, useManifolds: 1}},
    {name: 'very large plan',        formData: {Electric_Motor: 3600, Circuit_Board: 3600, Plastic: 1200, Heavy_Frame: 600, altRecipes: [], mergeBuildings: 1, useManifolds: 1}},
    {name: 'slow belts, big order',  formData: {Electric_Motor: 1200, altRecipes: [], maxBeltSpeed: 6, mergeBuildings: 1, useManifolds: 1}}
];

function time(workerSourcePath, scenario)
{
    let startedAt = process.hrtime.bigint();
        outputOf(workerSourcePath, scenario);

    return Number(process.hrtime.bigint() - startedAt) / 1e6;
}

console.log('scenario'.padEnd(24) + 'reference'.padStart(12) + 'current'.padStart(12) + 'speedup'.padStart(10));
console.log('-'.repeat(58));

for(const scenario of CASES)
{
    let reference = time(REFERENCE_WORKER, scenario);
    let current   = time(CURRENT_WORKER, scenario);

    console.log(
        scenario.name.padEnd(24)
        + (reference.toFixed(0) + ' ms').padStart(12)
        + (current.toFixed(0) + ' ms').padStart(12)
        + ((reference / current).toFixed(1) + 'x').padStart(10)
    );
}
