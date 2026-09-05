'use strict';

/**
 * Loads a copy of the planner worker (the current src/Worker.js, or the
 * reference implementation it was optimized from) and runs it against a
 * scenario, capturing everything it posts back.
 *
 * The worker is written for a real WebWorker global scope: it hangs its whole
 * state off `self`, and a couple of places read those properties as bare
 * globals (`requestedItems` in generateTreeList). A vm context whose `self`
 * *is* the context global reproduces that faithfully.
 */

const fs   = require('fs');
const path = require('path');
const vm   = require('vm');

const gameData = require('./fixtures/gameData.js');
const {renderTreeList, renderItemsList, renderBuildingsList} = require('../lib/resultHtml.mjs');

const CURRENT_WORKER   = path.join(__dirname, '..', 'src', 'Worker.js');
const REFERENCE_WORKER = path.join(__dirname, 'fixtures', 'referenceWorker.js');

const LIST_RENDERERS = {
    updateTreeList      : renderTreeList,
    updateItemsList     : renderItemsList,
    updateBuildingsList : renderBuildingsList
};

/**
 * Instantiates a worker and returns its global scope, so tests can either
 * drive it through onmessage or poke at individual functions.
 */
function loadWorker(workerSourcePath)
{
    let source  = fs.readFileSync(workerSourcePath, 'utf8').replace(/^export default /m, '');
    let logs    = [];
    let context = vm.createContext({});

    vm.runInContext('globalThis.self = globalThis;', context);

    context.console = {
        log     : function(){ logs.push(Array.prototype.slice.call(arguments).join(' ')); },
        warn    : function(){},
        error   : function(){}
    };

    vm.runInContext(source + '\n;globalThis.__startWorker = ProductionPlannerWorker;', context, {filename: workerSourcePath});

    context.__startWorker();

    let messages = [];
        context.self.postMessage = function(message){ messages.push(message); };

    return {scope: context.self, messages: messages, logs: logs};
}

function runScenario(workerSourcePath, scenario)
{
    let worker = loadWorker(workerSourcePath);

    worker.scope.onmessage({
        data: {
            debug       : false,
            locale      : 'en',
            translate   : {},

            // Cloned, because the worker mutates the buildings table
            buildings   : structuredClone(gameData.buildings),
            items       : structuredClone(gameData.items),
            recipes     : structuredClone(gameData.recipes),

            formData    : structuredClone(scenario.formData)
        }
    });

    return worker;
}

/**
 * The comparable output of a run: every posted message except the progress
 * chatter, which is not part of the result.
 *
 * The messages are built inside the vm, so they carry that realm's prototypes
 * and would never compare deep-strict-equal to anything built out here. Round
 * tripping through JSON both flattens them into plain host objects and mirrors
 * what postMessage would hand to the page anyway.
 *
 * The reference worker posts the three list panes as HTML. The current one
 * posts the data behind them and leaves the markup to lib/resultHtml.mjs, so
 * that runs here too: the differential then compares like with like, and pins
 * the renderer as well as the calculation.
 */
function outputOf(workerSourcePath, scenario)
{
    let messages = runScenario(workerSourcePath, scenario).messages.filter(function(message){
        return message.type !== 'updateLoaderText' && message.type !== 'showLoader';
    });

    return JSON.parse(JSON.stringify(messages)).map(function(message){
        let render = LIST_RENDERERS[message.type];

            // Already markup: the reference worker's own output, left alone
            if(render === undefined || message.html !== undefined)
            {
                return message;
            }

        return {type: message.type, html: render(message)};
    });
}

module.exports = {loadWorker, runScenario, outputOf, CURRENT_WORKER, REFERENCE_WORKER};
