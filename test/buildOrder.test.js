'use strict';

/**
 * The build order pane.
 *
 * It is a rewrite rather than a port, so the differential suite deliberately
 * leaves it out and these stand in its place. What matters about it is not the
 * numbers - those come from the same graph everything else is derived from -
 * but the promise it makes: that you can build the stages in the order given,
 * top to bottom, and never reach for something that does not exist yet.
 */

const test   = require('node:test');
const assert = require('node:assert');

const {runScenario, CURRENT_WORKER} = require('./runWorker.js');
const scenarios = require('./scenarios.js');
const {generateScenarios} = require('./randomScenarios.js');

function buildOrderOf(formData)
{
    let worker  = runScenario(CURRENT_WORKER, {formData: formData, panes: ['tree']});
    let posted  = worker.messages.filter(function(message){ return message.type === 'updateTreeList'; });

    assert.strictEqual(posted.length, 1, 'the tree pane should be posted exactly once');

    return JSON.parse(JSON.stringify(posted[0]));
}

function groupsOf(order)
{
    return order.stages.flatMap(function(stage, index){
        return stage.groups.map(function(group){ return {group: group, stage: index}; });
    });
}

/** The item a row puts on the belt, whether it makes it or brings it in. */
function producedItemOf(group)
{
    return (group.kind === 'machine') ? group.produces.itemId : group.itemId;
}

const ALL_SCENARIOS = scenarios.concat(generateScenarios(15));

test('every stage can be built with only what the stages above it made', async function(t){
    for(const scenario of ALL_SCENARIOS)
    {
        await t.test(scenario.name, function(){
            const order = buildOrderOf(scenario.formData);

            // What is on the belts by the time a given stage is reached
            let available = new Set();

            for(let i = 0; i < order.stages.length; i++)
            {
                for(const group of order.stages[i].groups)
                {
                    for(const input of group.inputs)
                    {
                        assert.ok(
                            available.has(input.itemId),
                            'stage ' + (i + 1) + ' needs ' + input.name + ', which nothing above it produces'
                        );
                    }
                }

                // Added after the whole stage is checked: a stage may not feed
                // itself, or its rows would have to go down in an order of
                // their own and the staging would be saying nothing.
                for(const group of order.stages[i].groups)
                {
                    available.add(producedItemOf(group));
                }
            }
        });
    }
});

test('the first stage is things you can build with nothing', async function(t){
    for(const scenario of ALL_SCENARIOS)
    {
        await t.test(scenario.name, function(){
            const order = buildOrderOf(scenario.formData);

            if(order.stages.length === 0)
            {
                return;
            }

            for(const group of order.stages[0].groups)
            {
                assert.deepStrictEqual(group.inputs, [], group.name + ' is in stage 1 but needs feeding');
            }
        });
    }
});

test('a machine on a recipe is one row, in one stage', async function(t){
    for(const scenario of ALL_SCENARIOS)
    {
        await t.test(scenario.name, function(){
            const seen = new Map();

            for(const {group, stage} of groupsOf(buildOrderOf(scenario.formData)))
            {
                const key = group.kind + '|' + (group.buildingId || '') + '|' + (group.recipe || '') + '|' + producedItemOf(group);

                assert.strictEqual(
                    seen.has(key),
                    false,
                    key + ' appears in stage ' + (stage + 1) + ' and again in stage ' + (seen.get(key) + 1)
                );

                seen.set(key, stage);
            }
        });
    }
});

test('belt plumbing and the goal marker are not things to place', async function(t){
    for(const scenario of ALL_SCENARIOS)
    {
        await t.test(scenario.name, function(){
            for(const {group} of groupsOf(buildOrderOf(scenario.formData)))
            {
                assert.ok(
                    group.kind === 'machine' || group.kind === 'supplied' || group.kind === 'byproduct',
                    'unexpected row kind ' + group.kind
                );

                // Mergers and splitters resolve to these two, so a leak shows up
                // as a row you would go and place
                assert.notStrictEqual(group.buildingId, 'Splitter');
                assert.notStrictEqual(group.buildingId, 'ConveyorBeltMk1');
            }
        });
    }
});

test('no stage is posted empty', async function(t){
    for(const scenario of ALL_SCENARIOS)
    {
        await t.test(scenario.name, function(){
            for(const stage of buildOrderOf(scenario.formData).stages)
            {
                assert.ok(stage.groups.length > 0, 'a stage was posted with nothing in it');
            }
        });
    }
});

test('the machines add up to the buildings pane', async function(t){
    // Same plan counted two independent ways: the buildings pane tallies nodes
    // as the graph is walked, the build order tallies them per stage. A
    // disagreement means one of them is dropping machines.
    for(const scenario of scenarios)
    {
        await t.test(scenario.name, function(){
            const worker = runScenario(CURRENT_WORKER, {formData: scenario.formData});
            const posted = JSON.parse(JSON.stringify(worker.messages));

            const order    = posted.find(function(m){ return m.type === 'updateTreeList'; });
            const pane     = posted.find(function(m){ return m.type === 'updateBuildingsList'; });
            const isSimple = scenario.formData.view === 'SIMPLE';

            // The simple view packs a whole recipe into one node and carries the
            // machine count as a percentage, which the buildings pane does not
            // unpack - so there is nothing to agree with there.
            if(isSimple)
            {
                return;
            }

            let staged = new Map();

            for(const {group} of groupsOf(order))
            {
                if(group.kind === 'machine')
                {
                    staged.set(group.buildingId, (staged.get(group.buildingId) || 0) + group.count);
                }
            }

            for(const building of pane.buildings)
            {
                // The buildings pane counts splitters, which are plumbing the
                // build order leaves out on purpose
                if(building.buildingId === 'Splitter')
                {
                    continue;
                }

                assert.strictEqual(
                    staged.get(building.buildingId),
                    building.qty,
                    building.name + ': build order says ' + staged.get(building.buildingId) + ', buildings pane says ' + building.qty
                );
            }
        });
    }
});

test('the goal is what was asked for', function(){
    const order = buildOrderOf({Electric_Motor: 600, Plastic: 200, altRecipes: []});

    assert.deepStrictEqual(
        order.outputs.map(function(output){ return output.itemId + ':' + output.qty; }),
        ['Electric_Motor:600', 'Plastic:200']
    );
});

test('an empty production list has nothing to build', function(){
    const order = buildOrderOf({altRecipes: []});

    assert.deepStrictEqual(order.stages, []);
    assert.deepStrictEqual(order.outputs, []);
});

test('machines held below full speed are reported, not rounded away', function(){
    // A slow belt starves part of the row. The count is still whole machines -
    // you place all of them - so the shortfall has to be said separately or the
    // row reads as more throughput than it has.
    const order = buildOrderOf({Electric_Motor: 600, altRecipes: [], mergeBuildings: 1, useManifolds: 1});

    let partial = 0;

    for(const {group} of groupsOf(order))
    {
        if(group.kind !== 'machine')
        {
            continue;
        }

        assert.strictEqual(group.count, Math.round(group.count), 'realistic view should count whole machines');

        let counted = group.full;

        for(const bucket of group.partial)
        {
            assert.ok(bucket.performance < 100, 'a full machine should not be in the shortfall list');
            counted += bucket.count;
            partial += bucket.count;
        }

        assert.strictEqual(counted, group.count, group.name + ': the buckets should account for every machine');
    }

    assert.ok(partial > 0, 'this scenario should have machines running below full speed');
});

test('the simple view counts the machines a node stands for', function(){
    // One node per recipe there, with the machine count carried as a percentage
    // rather than by there being that many nodes.
    const order = buildOrderOf({Electric_Motor: 600, altRecipes: [], view: 'SIMPLE'});

    let fractional = 0;

    for(const {group} of groupsOf(order))
    {
        if(group.kind !== 'machine')
        {
            continue;
        }

        assert.ok(group.count > 0, group.name + ' should stand for at least one machine');
        assert.deepStrictEqual(group.partial, [], 'the simple view has no individual machines to be short of');

        if(group.count !== Math.round(group.count))
        {
            fractional++;
        }
    }

    assert.ok(fractional > 0, 'the simple view should be able to ask for a fraction of a machine');
});
