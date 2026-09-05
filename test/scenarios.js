'use strict';

/**
 * Scenarios chosen to cover the paths the optimization touched: recipe and
 * building resolution, by-product reuse, the belt-speed clamp, building
 * merging, manifolds (mergers/splitters), maxLevel truncation, alternative
 * recipes, pre-supplied inputs, and both view modes.
 */
module.exports = [
    {
        name: 'single item, default options',
        formData: {Gear: 120, altRecipes: []}
    },
    {
        name: 'multi item chain with merging and manifolds',
        formData: {Electric_Motor: 600, Circuit_Board: 900, altRecipes: [], mergeBuildings: 1, useManifolds: 1}
    },
    {
        name: 'by-products (refining produces hydrogen)',
        formData: {Plastic: 300, Hydrogen: 60, altRecipes: [], mergeBuildings: 1, useManifolds: 1}
    },
    {
        name: 'quantity above one belt, forcing several main nodes',
        formData: {Iron_Ingot: 5400, altRecipes: [], maxBeltSpeed: 30}
    },
    {
        name: 'slow belts, exercising the belt-speed clamp',
        formData: {Electric_Motor: 240, altRecipes: [], maxBeltSpeed: 6, mergeBuildings: 1, useManifolds: 1}
    },
    {
        name: 'alternative recipe selected',
        formData: {Circuit_Board: 480, altRecipes: ['Recipe_Circuit_Board_Alternative'], mergeBuildings: 1}
    },
    {
        name: 'maxLevel truncation',
        formData: {Electric_Motor: 300, altRecipes: [], maxLevel: 3, mergeBuildings: 1, useManifolds: 1}
    },
    {
        name: 'SIMPLE view mode',
        formData: {Electric_Motor: 600, Plastic: 200, altRecipes: [], view: 'SIMPLE'}
    },
    {
        name: 'no merging, no manifolds',
        formData: {Magnetic_Coil: 360, altRecipes: [], mergeBuildings: 0, useManifolds: 0}
    },
    {
        name: 'assembler tier Mk1',
        formData: {Electric_Motor: 300, altRecipes: [], maxAssemblerSpeed: 'Assembling_Machine_Mk1', mergeBuildings: 1, useManifolds: 1}
    },
    {
        name: 'assembler tier Mk3',
        formData: {Electric_Motor: 300, altRecipes: [], maxAssemblerSpeed: 'Assembling_Machine_Mk3', mergeBuildings: 1, useManifolds: 1}
    },
    {
        name: 'pre-supplied input items',
        formData: {Electric_Motor: 300, altRecipes: [], input: {Iron_Ingot: 240}, mergeBuildings: 1, useManifolds: 1}
    },
    {
        name: 'graph direction and no requested item',
        formData: {altRecipes: [], direction: 'DOWN'}
    },
    {
        name: 'belt-speed clamp engages on a wide fast recipe',
        formData: {Heavy_Frame: 600, altRecipes: [], maxAssemblerSpeed: 'Assembling_Machine_Mk3', mergeBuildings: 1, useManifolds: 1}
    },
    {
        name: 'belt-speed clamp on a very slow belt',
        formData: {Electric_Motor: 300, altRecipes: [], maxBeltSpeed: 1, maxAssemblerSpeed: 'Assembling_Machine_Mk3', mergeBuildings: 1, useManifolds: 1}
    },
    {
        name: 'belt-speed clamp without merging',
        formData: {Heavy_Frame: 360, altRecipes: [], maxAssemblerSpeed: 'Assembling_Machine_Mk3', mergeBuildings: 0, useManifolds: 0}
    },
    {
        name: 'large plan',
        formData: {Electric_Motor: 1800, Circuit_Board: 1800, Plastic: 600, altRecipes: [], mergeBuildings: 1, useManifolds: 1}
    }
];
