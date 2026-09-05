'use strict';

/**
 * The worker builds only the results the page has somewhere to show, and
 * answers for the rest later out of the graph it kept rather than
 * recalculating. These check that a result is the same whichever way it was
 * asked for, and that asking for less really does less.
 */

const test   = require('node:test');
const assert = require('node:assert');

const {runScenario, CURRENT_WORKER} = require('./runWorker.js');
const scenarios = require('./scenarios.js');

const PANE_MESSAGE = {
    tree        : 'updateTreeList',
    items       : 'updateItemsList',
    buildings   : 'updateBuildingsList',
    graph       : 'updateGraphNetwork'
};

function run(formData, panes)
{
    return runScenario(CURRENT_WORKER, {formData: formData, panes: panes});
}

function requestPanes(worker, panes)
{
    worker.scope.onmessage({data: {type: 'requestPanes', panes: panes}});
}

/** Every posted message except the progress chatter, as plain host objects. */
function resultsOf(worker)
{
    return JSON.parse(JSON.stringify(worker.messages.filter(function(message){
        return message.type !== 'updateLoaderText' && message.type !== 'showLoader';
    })));
}

function payloadsOf(worker, type)
{
    return resultsOf(worker).filter(function(message){ return message.type === type; });
}

const FORM = {Electric_Motor: 600, Circuit_Board: 900, altRecipes: [], mergeBuildings: 1, useManifolds: 1};

test('a run with no pane list still builds all four, in tab order', function(){
    assert.deepStrictEqual(
        resultsOf(run(FORM, undefined)).map(function(message){ return message.type; }),
        ['updateUrl', 'updateRequiredPower', 'updateTreeList', 'updateItemsList', 'updateBuildingsList', 'updateGraphNetwork', 'done']
    );
});

test('a run builds only the panes it was asked for', async function(t){
    for(const pane of Object.keys(PANE_MESSAGE))
    {
        await t.test(pane, function(){
            assert.deepStrictEqual(
                resultsOf(run(FORM, [pane])).map(function(message){ return message.type; }),
                ['updateUrl', 'updateRequiredPower', PANE_MESSAGE[pane], 'done']
            );
        });
    }
});

test('asking for no panes at all runs the calculation and posts no results', function(){
    assert.deepStrictEqual(
        resultsOf(run(FORM, [])).map(function(message){ return message.type; }),
        ['updateUrl', 'updateRequiredPower', 'done']
    );
});

test('a pane asked for later matches the one a full run posts', async function(t){
    const LATE = ['tree', 'items', 'buildings', 'graph'];

    for(const scenario of scenarios)
    {
        await t.test(scenario.name, function(){
            const whole = run(scenario.formData, undefined);

            for(const pane of LATE)
            {
                // Started on some other pane, so this one is genuinely being
                // built after the fact
                const lazy = run(scenario.formData, [pane === 'items' ? 'buildings' : 'items']);
                    requestPanes(lazy, [pane]);

                assert.deepStrictEqual(
                    payloadsOf(lazy, PANE_MESSAGE[pane]),
                    payloadsOf(whole, PANE_MESSAGE[pane]),
                    pane + ' built on demand differs from the one a full run posts'
                );
            }
        });
    }
});

test('the graph asked for after the tree matches a full run', async function(t){
    for(const scenario of scenarios)
    {
        await t.test(scenario.name, function(){
            const whole = run(scenario.formData, undefined);
            const lazy  = run(scenario.formData, ['tree']);
                requestPanes(lazy, ['graph']);

            assert.deepStrictEqual(
                payloadsOf(lazy, 'updateGraphNetwork'),
                payloadsOf(whole, 'updateGraphNetwork')
            );
        });
    }
});

test('the graph says the same thing whichever pane ran first', function(){
    // Upstream tagged merger and splitter nodes with a buildingType while
    // walking the production tree, and those same node objects are what the
    // graph message carries - so the graph came out different depending on
    // which pane had been asked for. Nothing read the field, and the build
    // order does not walk the graph that way, so the coupling is gone. Pinned
    // rather than left to be reintroduced.
    const graphFirst = run(FORM, ['graph']);
    const treeFirst  = run(FORM, ['tree']);
        requestPanes(treeFirst, ['graph']);

    assert.deepStrictEqual(
        payloadsOf(graphFirst, 'updateGraphNetwork'),
        payloadsOf(treeFirst, 'updateGraphNetwork')
    );

    for(const node of payloadsOf(graphFirst, 'updateGraphNetwork')[0].nodes)
    {
        if(node.data.nodeType === 'merger' || node.data.nodeType === 'splitter')
        {
            assert.strictEqual(node.data.buildingType, undefined, 'belt plumbing should not carry a buildingType');
        }
    }
});

test('asking for a pane twice posts the same thing twice', function(){
    const worker = run(FORM, ['items']);
        requestPanes(worker, ['tree']);
        requestPanes(worker, ['tree']);

    const posted = payloadsOf(worker, 'updateTreeList');

    assert.strictEqual(posted.length, 2);
    assert.deepStrictEqual(posted[0], posted[1]);
});

test('the panes a run does not build cost it nothing', function(){
    // The three list panes are the ones with work behind them; the graph is
    // posted as it stands. Compare against what the same run builds in full.
    const started = process.hrtime.bigint();
        run(FORM, ['items']);
    const lean = Number(process.hrtime.bigint() - started) / 1e6;

    const startedFull = process.hrtime.bigint();
        run(FORM, undefined);
    const whole = Number(process.hrtime.bigint() - startedFull) / 1e6;

    assert.ok(lean < whole, 'an items-only run (' + lean.toFixed(0) + 'ms) should beat a full one (' + whole.toFixed(0) + 'ms)');
});
