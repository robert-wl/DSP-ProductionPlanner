'use strict';

/**
 * Unit tests for the individual pieces the optimization replaced, pinned
 * against the reference worker's implementation of the same lookups.
 */

const test   = require('node:test');
const assert = require('node:assert');

const {loadWorker, CURRENT_WORKER, REFERENCE_WORKER} = require('./runWorker.js');
const gameData = require('./fixtures/gameData.js');

function primedWorker(workerSourcePath)
{
    let worker = loadWorker(workerSourcePath);

        worker.scope.buildings          = structuredClone(gameData.buildings);
        worker.scope.items              = Object.assign({}, structuredClone(gameData.items), worker.scope.buildings);
        worker.scope.recipes            = structuredClone(gameData.recipes);
        worker.scope.options.altRecipes = [];

    return worker.scope;
}

test('getItemIdFromClassName resolves every known class name like the reference', function(){
    let current   = primedWorker(CURRENT_WORKER);
    let reference = primedWorker(REFERENCE_WORKER);

    for(let itemId in current.items)
    {
        let className = current.items[itemId].className;

        assert.strictEqual(current.getItemIdFromClassName(className), reference.getItemIdFromClassName(className), className);
    }
});

test('getItemIdFromClassName returns null for an unknown class name', function(){
    let current = primedWorker(CURRENT_WORKER);

    assert.strictEqual(current.getItemIdFromClassName('Desc_Nope_C'), null);
});

test('getItemIdFromClassName keeps the first match when two items share a class name', function(){
    function withCollision(workerSourcePath)
    {
        let scope = primedWorker(workerSourcePath);
            // Rebuild items so the duplicate is guaranteed to come second
            scope.items = Object.assign({}, structuredClone(gameData.items), {
                Iron_Ore_Duplicate: {className:'Iron_Ore', name:'Iron Ore (dup)', image:'io.png', url:'/io', category:'ore'}
            });

        return scope;
    }

    let current   = withCollision(CURRENT_WORKER);
    let reference = withCollision(REFERENCE_WORKER);

    assert.strictEqual(reference.getItemIdFromClassName('Iron_Ore'), 'Iron_Ore');
    assert.strictEqual(current.getItemIdFromClassName('Iron_Ore'), reference.getItemIdFromClassName('Iron_Ore'));
});

test('getRecipeToProduceItemId picks the same recipe as the reference', function(){
    let current   = primedWorker(CURRENT_WORKER);
    let reference = primedWorker(REFERENCE_WORKER);

    for(let itemId in gameData.items)
    {
        assert.strictEqual(current.getRecipeToProduceItemId(itemId), reference.getRecipeToProduceItemId(itemId), itemId);
    }
});

test('getRecipeToProduceItemId honours the alternative recipe list', function(){
    let current = primedWorker(CURRENT_WORKER);

    assert.strictEqual(current.getRecipeToProduceItemId('Circuit_Board'), 'Recipe_Circuit_Board');

    let withAlt = primedWorker(CURRENT_WORKER);
        withAlt.options.altRecipes = ['Recipe_Circuit_Board_Alternative'];

    assert.strictEqual(withAlt.getRecipeToProduceItemId('Circuit_Board'), 'Recipe_Circuit_Board_Alternative');
});

test('getRecipeToProduceItemId caches without changing the answer', function(){
    let current = primedWorker(CURRENT_WORKER);
    let first   = current.getRecipeToProduceItemId('Electric_Motor');

    assert.strictEqual(current.getRecipeToProduceItemId('Electric_Motor'), first);
    assert.strictEqual(current.getRecipeToProduceItemId('Electric_Motor'), first);
});

test('getProductionBuildingFromRecipeId matches the reference for every recipe', function(){
    let current   = primedWorker(CURRENT_WORKER);
    let reference = primedWorker(REFERENCE_WORKER);

    for(let recipeId in gameData.recipes)
    {
        assert.strictEqual(current.getProductionBuildingFromRecipeId(recipeId), reference.getProductionBuildingFromRecipeId(recipeId), recipeId);
    }
});

test('getProductionBuildingFromRecipeId returns null when no building is available', function(){
    let current = primedWorker(CURRENT_WORKER);
        current.recipes.Recipe_Orphan = {className:'Recipe_Orphan', name:'Orphan', produce:{Gear:1}, mProducedIn:['Build_Nonexistent_C']};

    assert.strictEqual(current.getProductionBuildingFromRecipeId('Recipe_Orphan'), null);
});

/**
 * The reference clamped a building's throughput by decrementing it a unit at a
 * time; the optimized version solves for the same value directly. This walks
 * the original loop and requires the closed form to land on the same number.
 */
function referenceClamp(productionRecipe, productionCraftingTime, qtyProduced, qtyUsed, maxProductionSpeed)
{
    let isTooFast = true;

        while(isTooFast === true)
        {
            isTooFast = false;

            if(qtyProduced > 0)
            {
                for(let recipeItemClassName in productionRecipe)
                {
                    let requiredQty = (60 / productionCraftingTime * productionRecipe[recipeItemClassName]) * qtyUsed / qtyProduced;

                        if(requiredQty > maxProductionSpeed)
                        {
                            isTooFast = true;
                            qtyUsed--;
                            break;
                        }
                }
            }
        }

    return qtyUsed;
}

test('reduceQtyUsedToBeltSpeed lands on the value the decrement loop reached', function(){
    let current = primedWorker(CURRENT_WORKER);
    let cases   = [];

    for(let recipeId in gameData.recipes)
    {
        let recipe = gameData.recipes[recipeId];

            if(recipe.ingredients === undefined)
            {
                continue;
            }

            for(const craftingTime of [1, 2, 3, 4, 7.5])
            {
                for(const qtyProduced of [15, 30, 60, 120])
                {
                    for(const qtyUsed of [0, 1, 7.5, 30, 120, 600, 1800])
                    {
                        for(const maxSpeed of [360, 1800, 60, 7])
                        {
                            cases.push([recipe.ingredients, craftingTime, qtyProduced, qtyUsed, maxSpeed]);
                        }
                    }
                }
            }
    }

    assert.ok(cases.length > 500, 'expected a decent number of cases, got ' + cases.length);

    for(const args of cases)
    {
        assert.strictEqual(
            current.reduceQtyUsedToBeltSpeed.apply(null, args),
            referenceClamp.apply(null, args),
            'clamp differs for ' + JSON.stringify(args.slice(1))
        );
    }
});

test('reduceQtyUsedToBeltSpeed leaves the quantity alone when nothing is produced', function(){
    let current = primedWorker(CURRENT_WORKER);

    assert.strictEqual(current.reduceQtyUsedToBeltSpeed({Iron_Ingot: 2}, 1, 0, 42, 60), 42);
});

// The worker's arrays come from the vm realm, so copy them out before comparing
function idsOf(nodes)
{
    return Array.from(nodes, function(node){ return node.data.id; });
}

test('addGraphNode indexes by-product, last and main nodes as they are pushed', function(){
    let current = primedWorker(CURRENT_WORKER);

    current.addGraphNode({id:'a', nodeType:'byProductItem',     itemId:'Hydrogen'});
    current.addGraphNode({id:'b', nodeType:'byProductItem',     itemId:'Hydrogen'});
    current.addGraphNode({id:'c', nodeType:'lastNodeItem',      itemId:'Iron_Ore'});
    current.addGraphNode({id:'d', nodeType:'lastNodeItem',      itemId:'Iron_Ore'});
    current.addGraphNode({id:'e', nodeType:'mainNode',          itemId:'Gear'});
    current.addGraphNode({id:'f', nodeType:'productionBuilding', recipe:'Recipe_Gear'});

    assert.strictEqual(current.graphNodes.length, 6);

    // By-products keep every match, in insertion order
    assert.deepStrictEqual(idsOf(current.byProductNodesByItem.Hydrogen), ['a', 'b']);

    // The last-node index keeps the first match, like the scan it replaced
    assert.strictEqual(current.lastNodeByItem.Iron_Ore.data.id, 'c');

    assert.deepStrictEqual(idsOf(current.mainNodesByItem.Gear), ['e']);
});

test('formatNumber reuses one formatter and matches Intl.NumberFormat', function(){
    let current = primedWorker(CURRENT_WORKER);
        current.locale = 'en';

    for(const value of [0, 1, 1.5, 1234, 1234567.891])
    {
        assert.strictEqual(current.formatNumber(value), new Intl.NumberFormat('en').format(value));
    }
});
