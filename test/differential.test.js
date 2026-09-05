'use strict';

/**
 * The safety net for the calculation optimization: for every scenario, the
 * current worker must post exactly what the pre-optimization reference worker
 * posts. Node ids, edge quantities, generated HTML, required power - all of it.
 */

const test   = require('node:test');
const assert = require('node:assert');

const {outputOf, CURRENT_WORKER, REFERENCE_WORKER} = require('./runWorker.js');
const scenarios         = require('./scenarios.js');
const {generateScenarios} = require('./randomScenarios.js');

function assertSameOutput(scenario)
{
    let expected = outputOf(REFERENCE_WORKER, scenario);
    let actual   = outputOf(CURRENT_WORKER, scenario);

    assert.deepStrictEqual(
        actual.map(function(message){ return message.type; }),
        expected.map(function(message){ return message.type; }),
        'posted a different sequence of messages'
    );

    for(let i = 0; i < expected.length; i++)
    {
        assert.deepStrictEqual(actual[i], expected[i], 'message #' + i + ' (' + expected[i].type + ') differs');
    }
}

test('current worker matches the reference implementation', async function(t){
    for(const scenario of scenarios)
    {
        await t.test(scenario.name, function(){
            assertSameOutput(scenario);
        });
    }
});

test('current worker matches the reference implementation on generated scenarios', async function(t){
    for(const scenario of generateScenarios(30))
    {
        await t.test(scenario.name, function(){
            assertSameOutput(scenario);
        });
    }
});
