import ProductionPlannerWorker from '../src/Worker.js';

/**
 * Starts a calculation in a real WebWorker.
 *
 * src/Worker.js is written as one self-contained function so it can be
 * stringified into a Blob and run as a worker without a second build output -
 * the same trick the upstream page used. Keeping it means the calculation the
 * differential test suite pins is byte for byte the calculation shipped here.
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

            if(event.data.type === 'done')
            {
                worker.terminate();
            }
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

            formData    : options.formData
        });

    return worker;
}
