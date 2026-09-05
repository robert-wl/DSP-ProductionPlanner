import ProductionPlannerWorker from '../src/Worker.js';

/**
 * Starts a calculation in a real WebWorker.
 *
 * src/Worker.js is written as one self-contained function so it can be
 * stringified into a Blob and run as a worker without a second build output -
 * the same trick the upstream page used. Keeping it means the calculation the
 * differential test suite pins is byte for byte the calculation shipped here.
 *
 * The worker outlives its calculation now. It holds the graph it worked out, so
 * a tab opened later is one `requestPanes` away instead of a whole re-run; the
 * caller terminates it when it starts the next calculation or goes away.
 */
export function startPlannerWorker(options)
{
    let blob        = new Blob(['(', ProductionPlannerWorker.toString(), ')()'], {type: 'application/javascript'});
    let blobUrl     = URL.createObjectURL(blob);
    let worker      = new Worker(blobUrl);

        // Revoked once the worker has been handed the script.
        setTimeout(function(){ URL.revokeObjectURL(blobUrl); }, 1500);

        worker.onmessage = function(event){
            options.onMessage(event.data);
        };

        worker.onerror = function(event){
            if(options.onError !== undefined)
            {
                options.onError(event.message || 'The planner worker failed.');
            }
        };

        worker.postMessage({
            debug       : false,
            // The worker reads `locale`; the original page sent `language`.
            // Send both so number formatting is not left to the default locale.
            locale      : options.language,
            language    : options.language,
            translate   : {},

            buildings   : options.buildings,
            items       : options.items,
            recipes     : options.recipes,

            formData    : options.formData,

            // Only the results the page has somewhere to show right now
            panes       : options.panes
        });

    return worker;
}

/**
 * Asks a worker that has already run for results it was not asked for the
 * first time. Answered from the graph it still has, so nothing is recalculated.
 */
export function requestPanes(worker, panes)
{
    worker.postMessage({type: 'requestPanes', panes: panes});
}
