'use strict';

/**
 * A small, self-contained dataset in the exact shape the planner's worker
 * consumes, used when the upstream game-data API cannot be reached.
 *
 * It is NOT a dump of the real Dyson Sphere Program data - the real recipe
 * table lives behind the API configured by GAME_DATA_URL. This one exists so a
 * fresh deployment renders and can be clicked through, and so local
 * development works offline. The UI labels it as sample data whenever it is
 * served.
 *
 * It mirrors test/fixtures/gameData.js, which is what the differential test
 * suite pins the calculation against, so what you can plan here is exactly
 * what the tests cover: ore extraction, smelting, three assembler tiers,
 * multi-output refining (by-products), an alternative recipe, and a
 * belt-hungry recipe that forces the throughput clamp to engage.
 */

function icon(label, color)
{
    return '/api/icon?label=' + encodeURIComponent(label) + '&color=' + encodeURIComponent(color);
}

export const buildingsData = {
    Mining_Machine          : {className: 'Build_MinerMk1_C',       name: 'Mining Machine',   image: icon('MI', '#8d6e4a'), url: '#', powerUsed: 420, extractionRate: 30, input: 6},
    Water_Pump              : {className: 'Build_WaterPump_C',      name: 'Water Pump',       image: icon('WP', '#2f6f8f'), url: '#', powerUsed: 300, extractionRate: 50},
    Smelter                 : {className: 'Build_Smelter_C',        name: 'Smelter',          image: icon('SM', '#a4552c'), url: '#', powerUsed: 360, productionSpeed: 1},
    Assembling_Machine_Mk1  : {className: 'Build_AssemblerMk1_C',   name: 'Assembler Mk.I',   image: icon('A1', '#3f7f5f'), url: '#', powerUsed: 270, productionSpeed: 0.75},
    Assembling_Machine_Mk2  : {className: 'Build_AssemblerMk2_C',   name: 'Assembler Mk.II',  image: icon('A2', '#3f7f7f'), url: '#', powerUsed: 380, productionSpeed: 1},
    Assembling_Machine_Mk3  : {className: 'Build_AssemblerMk3_C',   name: 'Assembler Mk.III', image: icon('A3', '#3f5f9f'), url: '#', powerUsed: 780, productionSpeed: 1.5},
    Refinery                : {className: 'Build_Refinery_C',       name: 'Oil Refinery',     image: icon('RE', '#7a4a8f'), url: '#', powerUsed: 960, productionSpeed: 1},
    ConveyorBeltMk1         : {className: 'Build_ConveyorBeltMk1_C', name: 'Conveyor Belt',   image: icon('BE', '#6b6b6b'), url: '#', powerUsed: 0},
    Splitter                : {className: 'Build_Splitter_C',       name: 'Splitter',         image: icon('SP', '#6b6b6b'), url: '#', powerUsed: 0}
};

export const itemsData = {
    Iron_Ore        : {className: 'Iron_Ore',       name: 'Iron Ore',       image: icon('IO', '#9a9a9a'), url: '#', category: 'ore',       color: '#a1a1a1'},
    Copper_Ore      : {className: 'Copper_Ore',     name: 'Copper Ore',     image: icon('CO', '#c07040'), url: '#', category: 'ore',       color: '#c07040'},
    Coal            : {className: 'Coal',           name: 'Coal',           image: icon('CL', '#3d3d3d'), url: '#', category: 'ore'},
    Crude_Oil       : {className: 'Crude_Oil',      name: 'Crude Oil',      image: icon('CR', '#2b2b3d'), url: '#', category: 'liquid'},
    Water           : {className: 'Water',          name: 'Water',          image: icon('WA', '#2f6f8f'), url: '#', category: 'liquid'},
    Hydrogen        : {className: 'Hydrogen',       name: 'Hydrogen',       image: icon('HY', '#4f8fbf'), url: '#', category: 'gas'},
    Refined_Oil     : {className: 'Refined_Oil',    name: 'Refined Oil',    image: icon('RO', '#8f5f2f'), url: '#', category: 'liquid'},
    Iron_Ingot      : {className: 'Iron_Ingot',     name: 'Iron Ingot',     image: icon('II', '#b0b0b0'), url: '#', category: 'material'},
    Copper_Ingot    : {className: 'Copper_Ingot',   name: 'Copper Ingot',   image: icon('CI', '#c78a52'), url: '#', category: 'material'},
    Magnetic_Coil   : {className: 'Magnetic_Coil',  name: 'Magnetic Coil',  image: icon('MC', '#8f4f6f'), url: '#', category: 'component'},
    Gear            : {className: 'Gear',           name: 'Gear',           image: icon('GE', '#7f7f5f'), url: '#', category: 'component'},
    Electric_Motor  : {className: 'Electric_Motor', name: 'Electric Motor', image: icon('EM', '#5f7f9f'), url: '#', category: 'component'},
    Circuit_Board   : {className: 'Circuit_Board',  name: 'Circuit Board',  image: icon('CB', '#3f8f5f'), url: '#', category: 'component'},
    Plastic         : {className: 'Plastic',        name: 'Plastic',        image: icon('PL', '#9f9f6f'), url: '#', category: 'material'},
    Heavy_Frame     : {className: 'Heavy_Frame',    name: 'Heavy Frame',    image: icon('HF', '#6f6f8f'), url: '#', category: 'component'}
};

export const recipesData = {
    Recipe_Iron_Ore         : {className: 'Recipe_Iron_Ore',        name: 'Iron Ore',       produce: {Iron_Ore: 1},     mManufactoringDuration: 1, mProducedIn: ['Build_MinerMk1_C']},
    Recipe_Copper_Ore       : {className: 'Recipe_Copper_Ore',      name: 'Copper Ore',     produce: {Copper_Ore: 1},   mManufactoringDuration: 1, mProducedIn: ['Build_MinerMk1_C']},
    Recipe_Coal             : {className: 'Recipe_Coal',            name: 'Coal',           produce: {Coal: 1},         mManufactoringDuration: 1, mProducedIn: ['Build_MinerMk1_C']},
    Recipe_Crude_Oil        : {className: 'Recipe_Crude_Oil',       name: 'Crude Oil',      produce: {Crude_Oil: 1},    mManufactoringDuration: 1, mProducedIn: ['Build_MinerMk1_C']},
    Recipe_Water            : {className: 'Recipe_Water',           name: 'Water',          produce: {Water: 1},        mManufactoringDuration: 1, mProducedIn: ['Build_WaterPump_C']},

    Recipe_Plasma_Refining  : {className: 'Recipe_Plasma_Refining', name: 'Plasma Refining', produce: {Refined_Oil: 2, Hydrogen: 1}, ingredients: {Crude_Oil: 2}, mManufactoringDuration: 4, mProducedIn: ['Build_Refinery_C']},
    Recipe_X_Ray_Cracking   : {className: 'Recipe_X_Ray_Cracking',  name: 'X-Ray Cracking',  produce: {Hydrogen: 3},    ingredients: {Refined_Oil: 1}, mManufactoringDuration: 4, mProducedIn: ['Build_Refinery_C']},

    Recipe_Iron_Ingot       : {className: 'Recipe_Iron_Ingot',      name: 'Iron Ingot',     produce: {Iron_Ingot: 1},   ingredients: {Iron_Ore: 1},   mManufactoringDuration: 1, mProducedIn: ['Build_Smelter_C']},
    Recipe_Copper_Ingot     : {className: 'Recipe_Copper_Ingot',    name: 'Copper Ingot',   produce: {Copper_Ingot: 1}, ingredients: {Copper_Ore: 1}, mManufactoringDuration: 1, mProducedIn: ['Build_Smelter_C']},
    Recipe_Gear             : {className: 'Recipe_Gear',            name: 'Gear',           produce: {Gear: 1},         ingredients: {Iron_Ingot: 1}, mManufactoringDuration: 1, mProducedIn: ['Build_AssemblerMk1_C', 'Build_AssemblerMk2_C', 'Build_AssemblerMk3_C']},
    Recipe_Magnetic_Coil    : {className: 'Recipe_Magnetic_Coil',   name: 'Magnetic Coil',  produce: {Magnetic_Coil: 2}, ingredients: {Iron_Ingot: 2, Copper_Ingot: 1}, mManufactoringDuration: 1, mProducedIn: ['Build_AssemblerMk1_C', 'Build_AssemblerMk2_C', 'Build_AssemblerMk3_C']},
    Recipe_Electric_Motor   : {className: 'Recipe_Electric_Motor',  name: 'Electric Motor', produce: {Electric_Motor: 1}, ingredients: {Iron_Ingot: 2, Gear: 1, Magnetic_Coil: 1}, mManufactoringDuration: 2, mProducedIn: ['Build_AssemblerMk1_C', 'Build_AssemblerMk2_C', 'Build_AssemblerMk3_C']},
    Recipe_Plastic          : {className: 'Recipe_Plastic',         name: 'Plastic',        produce: {Plastic: 1},      ingredients: {Refined_Oil: 2, Coal: 1}, mManufactoringDuration: 3, mProducedIn: ['Build_AssemblerMk1_C', 'Build_AssemblerMk2_C', 'Build_AssemblerMk3_C']},
    Recipe_Circuit_Board    : {className: 'Recipe_Circuit_Board',   name: 'Circuit Board',  produce: {Circuit_Board: 2}, ingredients: {Iron_Ingot: 2, Copper_Ingot: 1}, mManufactoringDuration: 1, mProducedIn: ['Build_AssemblerMk1_C', 'Build_AssemblerMk2_C', 'Build_AssemblerMk3_C']},
    Recipe_Circuit_Board_Alternative : {className: 'Recipe_Circuit_Board_Alternative', name: 'Circuit Board (Alt)', produce: {Circuit_Board: 2}, ingredients: {Copper_Ingot: 2}, mManufactoringDuration: 1, mProducedIn: ['Build_AssemblerMk1_C', 'Build_AssemblerMk2_C', 'Build_AssemblerMk3_C']},

    Recipe_Heavy_Frame      : {className: 'Recipe_Heavy_Frame',     name: 'Heavy Frame',    produce: {Heavy_Frame: 1},  ingredients: {Iron_Ingot: 12, Gear: 8}, mManufactoringDuration: 0.5, mProducedIn: ['Build_AssemblerMk1_C', 'Build_AssemblerMk2_C', 'Build_AssemblerMk3_C']},

    Recipe_Desc_Smelter     : {className: 'Recipe_Desc_Smelter',    name: 'Smelter',        produce: {Desc_Smelter_C: 1},      ingredients: {Iron_Ingot: 4, Gear: 2}, mManufactoringDuration: 3, mProducedIn: ['Build_AssemblerMk1_C']},
    Recipe_Desc_Assembler   : {className: 'Recipe_Desc_Assembler',  name: 'Assembler Mk.II', produce: {Desc_AssemblerMk2_C: 1}, ingredients: {Iron_Ingot: 8, Gear: 8, Circuit_Board: 4}, mManufactoringDuration: 3, mProducedIn: ['Build_AssemblerMk1_C']},
    Recipe_Desc_Miner       : {className: 'Recipe_Desc_Miner',      name: 'Mining Machine', produce: {Desc_MinerMk1_C: 1},     ingredients: {Iron_Ingot: 4, Magnetic_Coil: 2, Gear: 2}, mManufactoringDuration: 3, mProducedIn: ['Build_AssemblerMk1_C']}
};

export const sampleGameData = {buildingsData, itemsData, recipesData};
