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
    // The graph is left out here: the production tree tags merger and splitter
    // nodes as it walks them, and those nodes go out with the graph, so the two
    // are only equal when the tree ran first. Pinned separately below.
    const LATE = ['tree', 'items', 'buildings'];

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

test('the graph asked for before the tree is missing the tree walk\'s tag', function(){
    // Upstream tagged merger and splitter nodes with a buildingType while
    // building the production tree, and those same node objects are what the
    // graph message carries. Nothing reads the field off the graph - the
    // stylesheet in components/ProductionGraph.jsx goes by nodeType - but the
    // dependency is real, so it is pinned rather than left to be discovered.
    const graphFirst = run(FORM, ['graph']);
    const whole      = run(FORM, undefined);

    function countTagged(worker)
    {
        let tagged   = 0;
        let untagged = 0;

        for(const node of payloadsOf(worker, 'updateGraphNetwork')[0].nodes)
        {
            if(node.data.nodeType !== 'merger' && node.data.nodeType !== 'splitter')
            {
                continue;
            }

            if(node.data.buildingType === undefined) { untagged++; } else { tagged++; }
        }

        return {tagged, untagged};
    }

    const before = countTagged(graphFirst);
    const after  = countTagged(whole);

    assert.ok(after.tagged > 0, 'the scenario should have mergers or splitters to tag');
    assert.strictEqual(before.tagged, 0, 'nothing should be tagged when the tree never ran');
    assert.strictEqual(before.untagged, after.tagged, 'the same nodes, just untagged');
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
