'use strict';

/**
 * The sidebar's per-item recipe choice is a client-side reading of the
 * worker's `altRecipes` list: lib/plannerState.js works out what the worker
 * would pick on its own, and turns "use this recipe for this item" back into
 * the flat list the worker actually consumes.
 *
 * Both halves are mirrors of src/Worker.js, so both are pinned against it here
 * - once on the synthetic fixture, and once on the real built game data, which
 * is where the awkward cases live (sulfuric acid off an ocean, and the
 * by-product recipes that answer for more than one item).
 */

const test   = require('node:test');
const assert = require('node:assert');

const {loadWorker, CURRENT_WORKER} = require('./runWorker.js');
const {altRecipesFrom, autoRecipeFor, recipeChoicesFor, recipeChoicesFrom} = require('../lib/plannerState.js');

const fixture = require('./fixtures/gameData.js');
const built   = require('../public/data/game.json');

const DATA_SETS = [
    {
        name    : 'the synthetic fixture',
        gameData: {itemsData: fixture.items, buildingsData: fixture.buildings, recipesData: fixture.recipes}
    },
    {
        name    : 'the built game data',
        gameData: {itemsData: built.itemsData, buildingsData: built.buildingsData, recipesData: built.recipesData}
    }
];

function primedWorker(gameData, altRecipes)
{
    let worker = loadWorker(CURRENT_WORKER);

        worker.scope.buildings          = structuredClone(gameData.buildingsData);
        worker.scope.items              = Object.assign({}, structuredClone(gameData.itemsData), worker.scope.buildings);
        worker.scope.recipes            = structuredClone(gameData.recipesData);
        worker.scope.options.altRecipes = altRecipes === undefined ? [] : altRecipes;

    return worker.scope;
}

function producedClassNames(gameData)
{
    let produced = new Set();

    for(let recipeId in gameData.recipesData)
    {
        for(let className in gameData.recipesData[recipeId].produce || {})
        {
            produced.add(className);
        }
    }

    return [...produced];
}

for(let set of DATA_SETS)
{
    test('autoRecipeFor picks what the worker picks, on ' + set.name, function(){
        let scope = primedWorker(set.gameData);

        for(let className of producedClassNames(set.gameData))
        {
            if(scope.items[className] === undefined)
            {
                continue;
            }

            assert.strictEqual(
                autoRecipeFor(className, set.gameData.recipesData),
                scope.findRecipeToProduceItemId(className),
                className
            );
        }
    });

    test('every single choice is the recipe the worker then uses, on ' + set.name, function(){
        for(let choice of recipeChoicesFor(set.gameData))
        {
            for(let recipe of choice.recipes)
            {
                let altRecipes = altRecipesFrom({[choice.itemId]: recipe.id}, set.gameData.recipesData);
                let scope      = primedWorker(set.gameData, altRecipes);

                assert.strictEqual(scope.findRecipeToProduceItemId(choice.itemId), recipe.id, choice.itemId);
            }
        }
    });

    test('choices survive each other, on ' + set.name, function(){
        let choices = {};

        // The worst list to order: every item choosing the recipe the planner
        // would not have chosen, by-products and all.
        for(let choice of recipeChoicesFor(set.gameData))
        {
            choices[choice.itemId] = choice.recipes[choice.recipes.length - 1].id;
        }

        let altRecipes = altRecipesFrom(choices, set.gameData.recipesData);
        let scope      = primedWorker(set.gameData, altRecipes);

        for(let itemId in choices)
        {
            assert.strictEqual(scope.findRecipeToProduceItemId(itemId), choices[itemId], itemId);
        }

        assert.deepStrictEqual(recipeChoicesFrom(altRecipes, set.gameData), choices);
    });

    test('a list read back and written out again is the same list, on ' + set.name, function(){
        let choices    = {};

        for(let choice of recipeChoicesFor(set.gameData))
        {
            choices[choice.itemId] = choice.recipes[0].id;
        }

        let altRecipes = altRecipesFrom(choices, set.gameData.recipesData);

        assert.deepStrictEqual(
            altRecipesFrom(recipeChoicesFrom(altRecipes, set.gameData), set.gameData.recipesData),
            altRecipes
        );
    });
}

test('an alternative picked the old way still reads as that item choice', function(){
    let gameData = DATA_SETS[1].gameData;
    let choices  = recipeChoicesFrom(['Recipe_X-Ray_Alternative'], gameData);

    // X-ray cracking makes graphite and hydrogen, and the worker's list has
    // always answered for both, so both rows have to show it.
    assert.strictEqual(choices.Energetic_Graphite, 'Recipe_X-Ray_Alternative');
    assert.strictEqual(choices.Hydrogen, 'Recipe_X-Ray_Alternative');

    assert.deepStrictEqual(altRecipesFrom(choices, gameData.recipesData), ['Recipe_X-Ray_Alternative']);
});

test('a by-product recipe does not shadow another item\'s choice', function(){
    let gameData = DATA_SETS[1].gameData;

    // X-ray cracking for the graphite, mass energy storage for the hydrogen it
    // would otherwise have answered for as well.
    let choices = {
        Energetic_Graphite  : 'Recipe_X-Ray_Alternative',
        Hydrogen            : 'Recipe_Mass_Energy_Storage'
    };

    let scope = primedWorker(gameData, altRecipesFrom(choices, gameData.recipesData));

    assert.strictEqual(scope.findRecipeToProduceItemId('Energetic_Graphite'), 'Recipe_X-Ray_Alternative');
    assert.strictEqual(scope.findRecipeToProduceItemId('Hydrogen'), 'Recipe_Mass_Energy_Storage');
});

test('sulfuric acid can be planned either way', function(){
    let gameData = DATA_SETS[1].gameData;
    let choice   = recipeChoicesFor(gameData).find(function(row){ return row.itemId === 'Sulfuric_Acid'; });

    // Both are ordinary recipes, so neither used to be offered: the planner
    // took the ocean because it is the faster of the two.
    assert.strictEqual(choice.auto, 'Recipe_Sulphuric_Acid_Vein');
    assert.deepStrictEqual(choice.recipes.map(function(recipe){ return recipe.id; }).sort(),
        ['Recipe_Sulfuric_Acid', 'Recipe_Sulphuric_Acid_Vein']);

    let scope = primedWorker(gameData, altRecipesFrom({Sulfuric_Acid: 'Recipe_Sulfuric_Acid'}, gameData.recipesData));

    assert.strictEqual(scope.findRecipeToProduceItemId('Sulfuric_Acid'), 'Recipe_Sulfuric_Acid');
});
