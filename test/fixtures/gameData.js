// Synthetic DSP-shaped dataset, matching the structures the worker consumes.
const buildings = {
    Mining_Machine          : {className:'Build_MinerMk1_C',     name:'Mining Machine',   image:'mine.png',  url:'/mine',   powerUsed:420, extractionRate:30, input:6},
    Water_Pump              : {className:'Build_WaterPump_C',    name:'Water Pump',       image:'pump.png',  url:'/pump',   powerUsed:300, extractionRate:50},
    Smelter                 : {className:'Build_Smelter_C',      name:'Smelter',          image:'smelt.png', url:'/smelt',  powerUsed:360, productionSpeed:1},
    Assembling_Machine_Mk1  : {className:'Build_AssemblerMk1_C', name:'Assembler Mk.I',   image:'a1.png',    url:'/a1',     powerUsed:270, productionSpeed:0.75},
    Assembling_Machine_Mk2  : {className:'Build_AssemblerMk2_C', name:'Assembler Mk.II',  image:'a2.png',    url:'/a2',     powerUsed:380, productionSpeed:1},
    Assembling_Machine_Mk3  : {className:'Build_AssemblerMk3_C', name:'Assembler Mk.III', image:'a3.png',    url:'/a3',     powerUsed:780, productionSpeed:1.5},
    Refinery                : {className:'Build_Refinery_C',     name:'Oil Refinery',     image:'ref.png',   url:'/ref',    powerUsed:960, productionSpeed:1},
    ConveyorBeltMk1         : {className:'Build_ConveyorBeltMk1_C', name:'Conveyor Belt', image:'belt.png',  url:'/belt',   powerUsed:0},
    Splitter                : {className:'Build_Splitter_C',     name:'Splitter',         image:'split.png', url:'/split',  powerUsed:0}
};

const items = {
    Iron_Ore        : {className:'Iron_Ore',        name:'Iron Ore',       image:'io.png',  url:'/io',  category:'ore',      color:'#a1a1a1'},
    Copper_Ore      : {className:'Copper_Ore',      name:'Copper Ore',     image:'co.png',  url:'/co',  category:'ore',      color:'#c07040'},
    Coal            : {className:'Coal',            name:'Coal',           image:'cl.png',  url:'/cl',  category:'ore'},
    Crude_Oil       : {className:'Crude_Oil',       name:'Crude Oil',      image:'cr.png',  url:'/cr',  category:'liquid'},
    Water           : {className:'Water',           name:'Water',          image:'wa.png',  url:'/wa',  category:'liquid'},
    Hydrogen        : {className:'Hydrogen',        name:'Hydrogen',       image:'hy.png',  url:'/hy',  category:'gas'},
    Refined_Oil     : {className:'Refined_Oil',     name:'Refined Oil',    image:'ro.png',  url:'/ro',  category:'liquid'},
    Iron_Ingot      : {className:'Iron_Ingot',      name:'Iron Ingot',     image:'ii.png',  url:'/ii',  category:'material'},
    Copper_Ingot    : {className:'Copper_Ingot',    name:'Copper Ingot',   image:'ci.png',  url:'/ci',  category:'material'},
    Magnetic_Coil   : {className:'Magnetic_Coil',   name:'Magnetic Coil',  image:'mc.png',  url:'/mc',  category:'component'},
    Gear            : {className:'Gear',            name:'Gear',           image:'ge.png',  url:'/ge',  category:'component'},
    Electric_Motor  : {className:'Electric_Motor',  name:'Electric Motor', image:'em.png',  url:'/em',  category:'component'},
    Circuit_Board   : {className:'Circuit_Board',   name:'Circuit Board',  image:'cb.png',  url:'/cb',  category:'component'},
    Plastic         : {className:'Plastic',         name:'Plastic',        image:'pl.png',  url:'/pl',  category:'material'},
    Heavy_Frame     : {className:'Heavy_Frame',     name:'Heavy Frame',    image:'hf.png',  url:'/hf',  category:'component'}
};

const recipes = {
    Recipe_Iron_Ore         : {className:'Recipe_Iron_Ore',        name:'Iron Ore',        produce:{Iron_Ore:1},     mManufactoringDuration:1, mProducedIn:['Build_MinerMk1_C']},
    Recipe_Copper_Ore       : {className:'Recipe_Copper_Ore',      name:'Copper Ore',      produce:{Copper_Ore:1},   mManufactoringDuration:1, mProducedIn:['Build_MinerMk1_C']},
    Recipe_Coal             : {className:'Recipe_Coal',            name:'Coal',            produce:{Coal:1},         mManufactoringDuration:1, mProducedIn:['Build_MinerMk1_C']},
    Recipe_Crude_Oil        : {className:'Recipe_Crude_Oil',       name:'Crude Oil',       produce:{Crude_Oil:1},    mManufactoringDuration:1, mProducedIn:['Build_MinerMk1_C']},
    Recipe_Water            : {className:'Recipe_Water',           name:'Water',           produce:{Water:1},        mManufactoringDuration:1, mProducedIn:['Build_WaterPump_C']},

    Recipe_Plasma_Refining  : {className:'Recipe_Plasma_Refining', name:'Plasma Refining', produce:{Refined_Oil:2, Hydrogen:1}, ingredients:{Crude_Oil:2}, mManufactoringDuration:4, mProducedIn:['Build_Refinery_C']},
    Recipe_X_Ray_Cracking   : {className:'Recipe_X_Ray_Cracking',  name:'X-Ray Cracking',  produce:{Hydrogen:3},     ingredients:{Refined_Oil:1}, mManufactoringDuration:4, mProducedIn:['Build_Refinery_C']},

    Recipe_Iron_Ingot       : {className:'Recipe_Iron_Ingot',      name:'Iron Ingot',      produce:{Iron_Ingot:1},   ingredients:{Iron_Ore:1},    mManufactoringDuration:1, mProducedIn:['Build_Smelter_C']},
    Recipe_Copper_Ingot     : {className:'Recipe_Copper_Ingot',    name:'Copper Ingot',    produce:{Copper_Ingot:1}, ingredients:{Copper_Ore:1},  mManufactoringDuration:1, mProducedIn:['Build_Smelter_C']},
    Recipe_Gear             : {className:'Recipe_Gear',            name:'Gear',            produce:{Gear:1},         ingredients:{Iron_Ingot:1},  mManufactoringDuration:1, mProducedIn:['Build_AssemblerMk1_C','Build_AssemblerMk2_C','Build_AssemblerMk3_C']},
    Recipe_Magnetic_Coil    : {className:'Recipe_Magnetic_Coil',   name:'Magnetic Coil',   produce:{Magnetic_Coil:2},ingredients:{Iron_Ingot:2, Copper_Ingot:1}, mManufactoringDuration:1, mProducedIn:['Build_AssemblerMk1_C','Build_AssemblerMk2_C','Build_AssemblerMk3_C']},
    Recipe_Electric_Motor   : {className:'Recipe_Electric_Motor',  name:'Electric Motor',  produce:{Electric_Motor:1},ingredients:{Iron_Ingot:2, Gear:1, Magnetic_Coil:1}, mManufactoringDuration:2, mProducedIn:['Build_AssemblerMk1_C','Build_AssemblerMk2_C','Build_AssemblerMk3_C']},
    Recipe_Plastic          : {className:'Recipe_Plastic',         name:'Plastic',         produce:{Plastic:1},      ingredients:{Refined_Oil:2, Coal:1}, mManufactoringDuration:3, mProducedIn:['Build_AssemblerMk1_C','Build_AssemblerMk2_C','Build_AssemblerMk3_C']},
    Recipe_Circuit_Board    : {className:'Recipe_Circuit_Board',   name:'Circuit Board',   produce:{Circuit_Board:2},ingredients:{Iron_Ingot:2, Copper_Ingot:1}, mManufactoringDuration:1, mProducedIn:['Build_AssemblerMk1_C','Build_AssemblerMk2_C','Build_AssemblerMk3_C']},
    Recipe_Circuit_Board_Alternative : {className:'Recipe_Circuit_Board_Alternative', name:'Circuit Board (Alt)', produce:{Circuit_Board:2}, ingredients:{Copper_Ingot:2}, mManufactoringDuration:1, mProducedIn:['Build_AssemblerMk1_C','Build_AssemblerMk2_C','Build_AssemblerMk3_C']},

    // Fast enough, and hungry enough, to outrun a belt: exercises the clamp
    Recipe_Heavy_Frame      : {className:'Recipe_Heavy_Frame',     name:'Heavy Frame',     produce:{Heavy_Frame:1},  ingredients:{Iron_Ingot:12, Gear:8}, mManufactoringDuration:0.5, mProducedIn:['Build_AssemblerMk1_C','Build_AssemblerMk2_C','Build_AssemblerMk3_C']},

    Recipe_Desc_Smelter     : {className:'Recipe_Desc_Smelter',    name:'Smelter',         produce:{Desc_Smelter_C:1},      ingredients:{Iron_Ingot:4, Gear:2},           mManufactoringDuration:3, mProducedIn:['Build_AssemblerMk1_C']},
    Recipe_Desc_Assembler   : {className:'Recipe_Desc_Assembler',  name:'Assembler Mk.II', produce:{Desc_AssemblerMk2_C:1}, ingredients:{Iron_Ingot:8, Gear:8, Circuit_Board:4}, mManufactoringDuration:3, mProducedIn:['Build_AssemblerMk1_C']},
    Recipe_Desc_Miner       : {className:'Recipe_Desc_Miner',      name:'Mining Machine',  produce:{Desc_MinerMk1_C:1},     ingredients:{Iron_Ingot:4, Magnetic_Coil:2, Gear:2}, mManufactoringDuration:3, mProducedIn:['Build_AssemblerMk1_C']}
};

module.exports = {buildings, items, recipes};
