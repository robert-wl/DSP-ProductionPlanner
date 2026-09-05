/* global self, Intl */

export default function ProductionPlannerWorker()
{
    self.url            = {};

    self.debug          = false;
    self.locale         = 'en';
    self.translate      = {};

    self.options        = {
        viewMode                    : 'REALISTIC',

        useManifolds                : 1,
        mergeBuildings              : 1,
        maxLevel                    : null,
        maxBeltSpeed                : 1800,
        maxAssemblerSpeed           : 'Assembling_Machine_Mk2',
        altRecipes                  : []
    };

    self.buildings      = {};
    self.items          = {};
    self.recipes        = {};

    self.inputItems     = {};
    self.requestedItems = {};
    self.requiredPower  = 0;
    self.listItems      = {};
    self.listBuildings  = {};

    self.nodeIdKey      = 0;
    self.graphNodes     = [];
    self.graphEdges     = [];
    self.graphDirection = 'RIGHT';

    // Static lookup indexes, built once from items/recipes/buildings instead of
    // re-scanning those objects on every single node of the production tree.
    self.itemIdByClassName              = null;
    self.buildingKeyByClassName         = null;
    self.recipesByProducedClassName     = null;
    self.recipeIdByProducedClassName    = null;
    self.recipeProduceLength            = null;

    // Memoized results of the (deterministic) recipe/building resolvers.
    self.recipeForItemCache             = {};
    self.buildingForRecipeCache         = {};

    // Live indexes of the graph, kept in sync while the tree is built.
    self.byProductNodesByItem           = {};
    self.lastNodeByItem                 = {};
    self.mainNodesByItem                = {};
    self.nodesById                      = null;
    self.edgesByTargetId                = null;
    self.hierarchyTreeCache             = null;

    self.numberFormat                   = null;

    self.onmessage = function(e) {
        self.postMessage({type: 'showLoader'});

        // Add default
        self.debug          = e.data.debug;
        self.locale         = e.data.locale;
        self.translate      = e.data.translate;

        self.buildings      = e.data.buildings;
        self.items          = Object.assign({}, e.data.items, e.data.buildings);
        self.recipes        = e.data.recipes;

        self.prepareOptions(e.data.formData);
    };

    // Intl.NumberFormat construction is expensive, and the lists below format
    // thousands of values, so keep a single instance around.
    self.formatNumber = function(value)
    {
        if(self.numberFormat === null)
        {
            self.numberFormat = new Intl.NumberFormat(self.locale);
        }

        return self.numberFormat.format(value);
    };

    self.buildLookupIndexes = function()
    {
        // Called once the options have pruned the unavailable buildings.
        self.itemIdByClassName = {};
        for(let itemId in self.items)
        {
            let className = self.items[itemId].className;

                // Keep the first match, like the linear scan it replaces
                if(className !== undefined && self.itemIdByClassName[className] === undefined)
                {
                    self.itemIdByClassName[className] = itemId;
                }
        }

        self.buildingKeyByClassName = {};
        for(let buildingKey in self.buildings)
        {
            let className = self.buildings[buildingKey].className;

                if(className !== undefined && self.buildingKeyByClassName[className] === undefined)
                {
                    self.buildingKeyByClassName[className] = buildingKey;
                }
        }

        self.recipesByProducedClassName  = {};
        self.recipeIdByProducedClassName = {};
        self.recipeProduceLength         = {};

        for(let recipeKey in self.recipes)
        {
            if(self.recipes[recipeKey].produce === undefined)
            {
                continue;
            }

            let produceLength = 0;

            for(let producedClassName in self.recipes[recipeKey].produce)
            {
                produceLength++;

                if(self.recipeIdByProducedClassName[producedClassName] === undefined)
                {
                    self.recipeIdByProducedClassName[producedClassName] = recipeKey;
                }

                if(recipeKey.indexOf('_Alternative') === -1)
                {
                    if(self.recipesByProducedClassName[producedClassName] === undefined)
                    {
                        self.recipesByProducedClassName[producedClassName] = [];
                    }

                    self.recipesByProducedClassName[producedClassName].push(recipeKey);
                }
            }

            self.recipeProduceLength[recipeKey] = produceLength;
        }
    };

    // Pushes a node and keeps the per-type indexes up to date, so the tree
    // builder never has to scan self.graphNodes looking for one.
    self.addGraphNode = function(nodeData)
    {
        let node = {data: nodeData};
            self.graphNodes.push(node);

            if(nodeData.nodeType === 'byProductItem')
            {
                if(self.byProductNodesByItem[nodeData.itemId] === undefined)
                {
                    self.byProductNodesByItem[nodeData.itemId] = [];
                }

                self.byProductNodesByItem[nodeData.itemId].push(node);
            }
            else if(nodeData.nodeType === 'lastNodeItem')
            {
                if(self.lastNodeByItem[nodeData.itemId] === undefined)
                {
                    self.lastNodeByItem[nodeData.itemId] = node;
                }
            }
            else if(nodeData.nodeType === 'mainNode')
            {
                if(self.mainNodesByItem[nodeData.itemId] === undefined)
                {
                    self.mainNodesByItem[nodeData.itemId] = [];
                }

                self.mainNodesByItem[nodeData.itemId].push(node);
            }

        return node;
    };

    self.prepareOptions = function(formData) {
        self.postMessage({type: 'updateLoaderText', text: 'Checking requested items...'});
        for(let itemKey in self.items)
        {
            if(formData[itemKey] !== undefined && self.items[itemKey] !== undefined)
            {
                self.url[itemKey]            = formData[itemKey];
                self.requestedItems[itemKey] = formData[itemKey];
            }
        }

        if(formData.input !== undefined)
        {
            self.url.input  = formData.input
            self.inputItems = formData.input;
        }

        if(formData.direction !== undefined && self.graphDirection !== formData.direction)
        {
            self.url.direction  = formData.direction;
            self.graphDirection = formData.direction;
        }

        if(formData.view !== undefined && formData.view !== 'REALISTIC')
        {
            self.url.view           = formData.view;
            self.options.viewMode   = formData.view;

            // If using SIMPLE view, reset some other options
            if(formData.view === 'SIMPLE')
            {
                delete formData.mergeBuildings; // Merge buildings
                delete formData.useManifolds;
                self.options.useManifolds = 0;  // Don't use manifolds

                // Reset max speeds
                delete formData.maxBeltSpeed;
                delete formData.maxAssemblerSpeed;

                delete formData.maxLevel;
            }
        }

        if(formData.mergeBuildings !== undefined)
        {
            self.url.mergeBuildings     = formData.mergeBuildings;
            self.options.mergeBuildings = parseInt(formData.mergeBuildings);
        }

        if(formData.useManifolds !== undefined)
        {
            self.url.useManifolds       = formData.useManifolds;
            self.options.useManifolds   = parseInt(formData.useManifolds);
        }

        if(formData.maxLevel !== undefined)
        {
            self.url.maxLevel       = formData.maxLevel;
            self.options.maxLevel   = parseInt(formData.maxLevel);
        }

        if(formData.maxBeltSpeed !== undefined)
        {
            if(self.options.maxBeltSpeed / 60 !== parseInt(formData.maxBeltSpeed))
            {
                self.url.maxBeltSpeed = formData.maxBeltSpeed;
            }

            self.options.maxBeltSpeed = parseInt(formData.maxBeltSpeed) * 60;
        }

        if(formData.maxAssemblerSpeed !== undefined)
        {
            if(self.options.maxAssemblerSpeed !== formData.maxAssemblerSpeed)
            {
                self.url.maxAssemblerSpeed = formData.maxAssemblerSpeed;
            }

            self.options.maxAssemblerSpeed = formData.maxAssemblerSpeed;

            if(self.options.maxAssemblerSpeed === 'Assembling_Machine_Mk1')
            {
                delete self.buildings.Assembling_Machine_Mk2;
                delete self.buildings.Assembling_Machine_Mk3;
            }
            if(self.options.maxAssemblerSpeed === 'Assembling_Machine_Mk2')
            {
                delete self.buildings.Assembling_Machine_Mk1;
                delete self.buildings.Assembling_Machine_Mk3;
            }
            if(self.options.maxAssemblerSpeed === 'Assembling_Machine_Mk3')
            {
                delete self.buildings.Assembling_Machine_Mk1;
                delete self.buildings.Assembling_Machine_Mk2;
            }
        }

        if(formData.altRecipes !== undefined)
        {
            self.postMessage({type: 'updateLoaderText', text: 'Applying alternative recipes...'});

            self.options.altRecipes = [];
            for(let i = 0; i < formData.altRecipes.length; i++)
            {
                let recipeKey = formData.altRecipes[i];
                    if(self.recipes[recipeKey] !== undefined)
                    {
                        self.options.altRecipes.push(recipeKey);
                    }
            }

            if(self.options.altRecipes.length > 0)
            {
                self.url.altRecipes = self.options.altRecipes;
            }
        }

        self.postMessage({type: 'updateUrl', url: self.url});
        self.startCalculation();
    };

    self.startCalculation = function() {
        self.buildLookupIndexes();

        // Add pseudo-by products for inputs...
        for(let itemKey in self.inputItems)
        {
            let requestedQty = parseFloat(self.inputItems[itemKey]);
            let maxMergedQty = self.options.maxBeltSpeed;

                if(self.items[itemKey].category === 'liquid' || self.items[itemKey].category === 'gas')
                {
                    requestedQty *= 1000;
                    maxMergedQty = self.options.maxPipeSpeed;
                }

                while(requestedQty >= maxMergedQty)
                {
                    let mainNodeVisId  = itemKey + '_' + self.nodeIdKey;
                        self.nodeIdKey++;

                        self.addGraphNode({
                            id                  : mainNodeVisId + '_byProduct',
                            nodeType            : 'byProductItem',
                            itemId              : itemKey,
                            qtyUsed             : 0,
                            qtyProduced         : ((self.items[itemKey].category === 'liquid' || self.items[itemKey].category === 'gas') ? (maxMergedQty / 1000) : maxMergedQty),
                            neededQty           : ((self.items[itemKey].category === 'liquid' || self.items[itemKey].category === 'gas') ? (maxMergedQty / 1000) : maxMergedQty),
                            image               : self.items[itemKey].image
                        });

                        requestedQty -= maxMergedQty;
                }

                if(requestedQty > 0)
                {
                    let mainNodeVisId  = itemKey + '_' + self.nodeIdKey;
                        self.nodeIdKey++;

                        self.addGraphNode({
                            id                  : mainNodeVisId + '_byProduct',
                            nodeType            : 'byProductItem',
                            itemId              : itemKey,
                            qtyUsed             : 0,
                            qtyProduced         : ((self.items[itemKey].category === 'liquid' || self.items[itemKey].category === 'gas') ? (requestedQty / 1000) : requestedQty),
                            neededQty           : ((self.items[itemKey].category === 'liquid' || self.items[itemKey].category === 'gas') ? (requestedQty / 1000) : requestedQty),
                            image               : self.items[itemKey].image
                        });
                }
        }

        // Parse required items!
        for(let itemKey in self.requestedItems)
        {
            let requestedQty = self.requestedItems[itemKey];
            let maxMergedQty = self.options.maxBeltSpeed;

            while(requestedQty >= maxMergedQty)
            {
                self.startMainNode(itemKey, maxMergedQty);
                requestedQty -= maxMergedQty;
            }

            if(requestedQty > 0)
            {
                self.startMainNode(itemKey, requestedQty);
            }
        }

        // Merge nodes when possible!
        if(self.options.mergeBuildings === 1 || self.options.viewMode === 'SIMPLE')
        {
            if(self.options.viewMode === 'SIMPLE')
            {
                self.postMessage({type: 'updateLoaderText', text: 'Merging all buildings...'});
            }
            if(self.options.mergeBuildings === 1)
            {
                self.postMessage({type: 'updateLoaderText', text: 'Improving buildings efficiency...'});
            }

            // Loop backwards so the miners/pumps are overclocked before the production buildings ;)
            for(let pass = 1; pass <= 2; pass++)
            {
                // Only production buildings sharing a recipe can ever merge, so bucket
                // them once per pass rather than testing every pair of nodes. Edges are
                // indexed by endpoint too, so re-wiring a merged node costs O(degree)
                // instead of a full scan of self.graphEdges.
                let nodesByRecipe   = {};
                let edgesBySource   = {};
                let edgesByTarget   = {};

                for(let i = self.graphNodes.length - 1; i >= 0 ; i--)
                {
                    if(self.graphNodes[i] === undefined || self.graphNodes[i].data.nodeType !== 'productionBuilding')
                    {
                        continue;
                    }

                    let nodeData = self.graphNodes[i].data;
                    let bucket   = nodesByRecipe[nodeData.recipe];

                        if(bucket === undefined)
                        {
                            // minQtyUsed is the cheapest candidate the bucket will ever
                            // offer: merging only ever raises a survivor's qtyUsed, and a
                            // node that leaves the bucket cannot lower the minimum.
                            bucket = {entries: [], minQtyUsed: Infinity};
                            nodesByRecipe[nodeData.recipe] = bucket;
                        }

                        // Filled descending, to keep the original iteration order.
                        // Holding the node data next to the index keeps the scan below off
                        // self.graphNodes, which `delete` has turned into a sparse array.
                        bucket.entries.push({index: i, data: nodeData});

                        if(nodeData.qtyUsed < bucket.minQtyUsed)
                        {
                            bucket.minQtyUsed = nodeData.qtyUsed;
                        }
                }

                for(let k = 0; k < self.graphEdges.length; k++)
                {
                    if(self.graphEdges[k] === undefined)
                    {
                        continue;
                    }

                    let edgeData = self.graphEdges[k].data;

                        if(edgesBySource[edgeData.source] === undefined)
                        {
                            edgesBySource[edgeData.source] = [];
                        }
                        edgesBySource[edgeData.source].push(self.graphEdges[k]);

                        if(edgesByTarget[edgeData.target] === undefined)
                        {
                            edgesByTarget[edgeData.target] = [];
                        }
                        edgesByTarget[edgeData.target].push(self.graphEdges[k]);
                }

                let maxBeltSpeed    = self.options.maxBeltSpeed;
                let isSimpleView    = (self.options.viewMode === 'SIMPLE');

                for(let i = self.graphNodes.length - 1; i >= 0 ; i--)
                {
                    if(self.graphNodes[i] === undefined || self.graphNodes[i].data.nodeType !== 'productionBuilding')
                    {
                        continue;
                    }

                    let mergingNodeData = self.graphNodes[i].data;

                    // A saturated building cannot take anything else in, and qtyUsed
                    // only ever grows, so its whole bucket scan would be a no-op.
                    if(isSimpleView === false && mergingNodeData.qtyUsed >= mergingNodeData.qtyProduced)
                    {
                        continue;
                    }

                    let bucket              = nodesByRecipe[mergingNodeData.recipe];
                    let mergingQtyUsed      = mergingNodeData.qtyUsed;
                    let mergingQtyProduced  = mergingNodeData.qtyProduced;
                    let mergingNodeId       = mergingNodeData.id;

                    // What a full merge is allowed to reach: Math.min(maxMergedQty,
                    // qtyProduced, maxBeltSpeed) falls short of maxMergedQty exactly
                    // when maxMergedQty passes this, so one comparison decides a
                    // candidate. A partial merge is dead code below, and the
                    // percentage it would compute cannot round back up to 100 for
                    // non-negative quantities, so nothing else has to be worked out.
                    let maxMergeable        = Math.min(mergingQtyProduced, maxBeltSpeed);

                    // Even the cheapest node in the bucket overflows this one, so the
                    // whole scan below could only fail. Written as an addition, like the
                    // per-candidate test, so the two round identically.
                    if(isSimpleView === false && (mergingQtyUsed + bucket.minQtyUsed) > maxMergeable)
                    {
                        continue;
                    }

                    let sameRecipeNodes = bucket.entries;
                    let liveNodes       = 0;    // Write cursor, compacting the bucket in place
                    let n               = 0;

                    for(; n < sameRecipeNodes.length; n++)
                    {
                        let candidate = sameRecipeNodes[n];

                            if(liveNodes !== n)
                            {
                                sameRecipeNodes[liveNodes] = candidate;
                            }
                            liveNodes++;

                        if(candidate.index !== i) // Not yet tested...
                        {
                            let sourceNodeData  = candidate.data;

                            if(mergingNodeId !== sourceNodeData.id)
                            {
                                if(isSimpleView === false && mergingQtyUsed >= mergingQtyProduced)
                                {
                                    n++;    // Kept above, so the tail copy must not repeat it
                                    break;  // Filled up by the merges above - nothing left to take
                                }

                                let mergedQty = mergingQtyUsed + sourceNodeData.qtyUsed;

                                if(isSimpleView === false && mergedQty > maxMergeable)
                                {
                                    continue;
                                }

                                // Tests if input/output are allowed to that new speed...
                                if(self.testEdgesMaxSpeeds(mergingNodeData, sourceNodeData, 100, edgesByTarget) === true)
                                {
                                    // Update edges! Only the ones touching the node we drop.
                                    self.moveIndexedEdges(edgesBySource, sourceNodeData.id, mergingNodeId, 'source');
                                    self.moveIndexedEdges(edgesByTarget, sourceNodeData.id, mergingNodeId, 'target');

                                    delete self.graphNodes[candidate.index];
                                    liveNodes--;    // Dropped here, so no later scan sees it

                                    mergingQtyUsed              = mergedQty;
                                    mergingNodeData.qtyUsed     = mergedQty;
                                }
                            }
                        }
                    }

                    // Whatever the break above skipped, which is still in the bucket
                    for(; n < sameRecipeNodes.length; n++)
                    {
                        if(liveNodes !== n)
                        {
                            sameRecipeNodes[liveNodes] = sameRecipeNodes[n];
                        }
                        liveNodes++;
                    }

                    sameRecipeNodes.length = liveNodes;
                }

                // Update previous merged edges...
                // The first edge of each source/target pair absorbs the others,
                // which a single hashed pass does as well as the O(n^2) sweep.
                let mergedEdgesByEndpoints = new Map();

                for(let i = 0; i < self.graphEdges.length; i++)
                {
                    if(self.graphEdges[i] === undefined)
                    {
                        continue;
                    }

                    let endpointsKey    = self.graphEdges[i].data.source + '\u0000' + self.graphEdges[i].data.target;
                    let existingEdge    = mergedEdgesByEndpoints.get(endpointsKey);

                        if(existingEdge === undefined)
                        {
                            mergedEdgesByEndpoints.set(endpointsKey, self.graphEdges[i]);
                        }
                        else
                        {
                            existingEdge.data.qty += self.graphEdges[i].data.qty;
                            delete self.graphEdges[i];
                        }
                }
            }
        }

        if(self.options.useManifolds === 1)
        {
            self.postMessage({type: 'updateLoaderText', text: 'Building manifolds...'});

            // Add merger
            let mergers         = [];
            let mergerKey       = 0;
            let mergerScanLength = self.graphEdges.length;

            // Only edges carrying the same item into the same target can be merged,
            // so bucket them once instead of rescanning every edge for every edge.
            let edgesByItemAndTarget = new Map();

            for(let i = mergerScanLength - 1; i >= 0 ; i--)
            {
                if(self.graphEdges[i] === undefined)
                {
                    continue;
                }

                let mergerBucketKey = self.graphEdges[i].data.itemId + '\u0000' + self.graphEdges[i].data.target;
                let mergerBucket    = edgesByItemAndTarget.get(mergerBucketKey);

                    if(mergerBucket === undefined)
                    {
                        mergerBucket = [];
                        edgesByItemAndTarget.set(mergerBucketKey, mergerBucket);
                    }

                    // Filled descending, to keep the original iteration order
                    mergerBucket.push(i);
            }

            for(let i = mergerScanLength - 1; i >= 0 ; i--)
            {
                if(self.graphEdges[i] === undefined)
                {
                    continue;
                }

                let parentEdge      = self.graphEdges[i];
                let currentMerger   = [];
                let mergerQty       = 0;
                let maxMergedQty    = self.options.maxBeltSpeed;
                let mergerBucket    = edgesByItemAndTarget.get(parentEdge.data.itemId + '\u0000' + parentEdge.data.target);

                for(let n = 0; n < mergerBucket.length; n++)
                {
                    let j = mergerBucket[n];

                    if(self.graphEdges[j] === undefined)
                    {
                        continue;
                    }

                    if(parentEdge.data.id !== self.graphEdges[j].data.id) // Not yet tested...
                    {
                        if((mergerQty + self.graphEdges[j].data.qty) <= maxMergedQty)
                        {
                            if(self.graphEdges[j].data.qty >= 0.1)
                            {
                                mergerQty += self.graphEdges[j].data.qty;
                                currentMerger.push(self.graphEdges[j]);
                            }

                            delete self.graphEdges[j];
                        }
                    }
                }

                if(currentMerger.length > 0)
                {
                    if(parentEdge.data.qty >= 0.1)
                    {
                        mergerQty += parentEdge.data.qty;
                        currentMerger.push(parentEdge);

                        mergers.push({
                            origin: parentEdge,
                            mergerSources: currentMerger,
                            mergerQty: mergerQty
                        });
                    }

                    delete self.graphEdges[i];
                }
            }

            if(mergers.length > 0)
            {
                for(let i = 0; i < mergers.length; i++)
                {
                    mergerKey++;

                    let currentMergerTarget         = mergers[i].origin.data.target;
                    let currentMergerId             = 'merger_' + mergerKey;
                    let currentMergerTargetQty      = mergers[i].mergerQty;

                    for(let k = 0; k < mergers[i].mergerSources.length; k++)
                    {
                        if(k % 2 === 0)
                        {
                            if((k + 1) < mergers[i].mergerSources.length) // Prevent solo merger ^^
                            {
                                if(k > 0)
                                {
                                    mergerKey++;
                                    currentMergerTarget         = currentMergerId;
                                    currentMergerId             = 'merger_' + mergerKey;
                                }

                                self.graphNodes.push({data: {
                                    id          : currentMergerId,
                                    nodeType    : 'merger',
                                    itemId      : mergers[i].origin.data.itemId
                                }});

                                self.graphEdges.push({data: {
                                    id                  : 'merger_' + mergerKey + '_' + currentMergerTarget,
                                    source              : currentMergerId,
                                    target              : currentMergerTarget,
                                    itemId              : mergers[i].origin.data.itemId,
                                    qty                 : currentMergerTargetQty
                                }});
                            }
                        }

                        self.graphEdges.push({data: {
                            id                  : mergers[i].mergerSources[k].data.source + '_' + currentMergerId,
                            source              : mergers[i].mergerSources[k].data.source,
                            target              : currentMergerId,
                            itemId              : mergers[i].mergerSources[k].data.itemId,
                            qty                 : mergers[i].mergerSources[k].data.qty
                        }});

                        currentMergerTargetQty -= mergers[i].mergerSources[k].data.qty;
                    }
                }
            }

            // Add splitter
            let splitters           = [];
            let splitterKey         = 0;
            let splitterScanLength  = self.graphEdges.length;

            // Same idea as the mergers, bucketed on the shared source this time.
            let edgesByItemAndSource = new Map();

            for(let i = 0; i < splitterScanLength; i++)
            {
                if(self.graphEdges[i] === undefined)
                {
                    continue;
                }

                let splitterBucketKey   = self.graphEdges[i].data.itemId + '\u0000' + self.graphEdges[i].data.source;
                let splitterBucket      = edgesByItemAndSource.get(splitterBucketKey);

                    if(splitterBucket === undefined)
                    {
                        splitterBucket = [];
                        edgesByItemAndSource.set(splitterBucketKey, splitterBucket);
                    }

                    splitterBucket.push(i);
            }

            for(let i = 0; i < splitterScanLength; i++)
            {
                let currentSplitter   = [];
                let splitterQty       = 0;

                if(self.graphEdges[i] !== undefined)
                {
                    let splitterBucket = edgesByItemAndSource.get(self.graphEdges[i].data.itemId + '\u0000' + self.graphEdges[i].data.source);

                    for(let n = 0; n < splitterBucket.length; n++)
                    {
                        let j = splitterBucket[n];

                        if(i !== j && self.graphEdges[j] !== undefined) // Not yet tested...
                        {
                            if(self.graphEdges[j].data.qty >= 0.1)
                            {
                                splitterQty += self.graphEdges[j].data.qty;
                                currentSplitter.push(self.graphEdges[j]);
                            }
                            delete self.graphEdges[j];
                        }
                    }
                }

                if(currentSplitter.length > 0)
                {
                    if(self.graphEdges[i].data.qty >= 0.1)
                    {
                        splitterQty += self.graphEdges[i].data.qty;
                        currentSplitter.push(self.graphEdges[i]);

                        splitters.push({
                            origin: self.graphEdges[i],
                            splitterTargets: currentSplitter,
                            splitterQty: splitterQty
                        });
                    }

                    delete self.graphEdges[i];
                }
            }

            if(splitters.length > 0)
            {
                for(let i = 0; i < splitters.length; i++)
                {
                    splitterKey++;

                    let currentSplitterSource       = splitters[i].origin.data.source;
                    let currentSplitterId           = 'splitter_' + splitterKey;
                    let currentSplitterSourceQty    = splitters[i].splitterQty;

                    for(let k = 0; k < splitters[i].splitterTargets.length; k++)
                    {
                        if(k % 2 === 0 && k < (splitters[i].splitterTargets.length - 1))
                        {
                            if(k > 0)
                            {
                                splitterKey++;
                                currentSplitterSource       = currentSplitterId;
                                currentSplitterId           = 'splitter_' + splitterKey;
                            }

                            self.graphNodes.push({data: {
                                id          : currentSplitterId,
                                nodeType    : 'splitter',
                                itemId      : splitters[i].origin.data.itemId
                            }});

                            self.graphEdges.push({data: {
                                id                  : currentSplitterSource + '_splitter_' + splitterKey,
                                source              : currentSplitterSource,
                                target              : currentSplitterId,
                                itemId              : splitters[i].origin.data.itemId,
                                qty                 : currentSplitterSourceQty
                            }});
                        }

                        self.graphEdges.push({data: {
                            id                  : currentSplitterId + '_' + splitters[i].splitterTargets[k].data.target,
                            source              : currentSplitterId,
                            target              : splitters[i].splitterTargets[k].data.target,
                            itemId              : splitters[i].splitterTargets[k].data.itemId,
                            qty                 : splitters[i].splitterTargets[k].data.qty
                        }});

                        currentSplitterSourceQty -= splitters[i].splitterTargets[k].data.qty;
                    }
                }
            }
        }

        // Remove empty arrays ;)
        self.graphNodes = self.graphNodes.filter(function(element){ return element !== undefined; });
        self.graphEdges = self.graphEdges.filter(function(element){ return element !== undefined; });

        // Clean up NODES
        self.postMessage({type: 'updateLoaderText', text: 'Cleaning buildings...'});
        for(let i = 0; i < self.graphNodes.length; i++)
        {
            let node        = self.graphNodes[i];

            if(node.data.nodeType === 'mainNode')
            {
                self.graphNodes[i].data.label   = self.formatNumber(Math.ceil(node.data.qty))
                                                + ' ' + self.items[node.data.itemId].name;
            }

            if(node.data.nodeType === 'merger')
            {
                self.graphNodes[i].data.label   = '(' + self.items[node.data.itemId].name + ')';
                self.graphNodes[i].data.image   = self.buildings.ConveyorBeltMk1.image;
            }
            if(node.data.nodeType === 'splitter')
            {
                self.graphNodes[i].data.label   = self.buildings.Splitter.name + '\n(' + self.items[node.data.itemId].name + ')';
                self.graphNodes[i].data.image   = self.buildings.Splitter.image;

                if(self.listBuildings.Splitter === undefined)
                {
                    self.listBuildings.Splitter = 1;
                }
                else
                {
                    self.listBuildings.Splitter += 1;
                }
            }

            if(node.data.nodeType === 'productionBuilding')
            {
                let performance                         = (node.data.qtyUsed / (node.data.qtyProduced/* * node.data.productionSpeed*/) * 100);
                    self.graphNodes[i].data.performance = Math.round(performance);
                let getColorForPercentage               = function(pct) {
                    pct /= 100;

                    let percentColors = [
                        { pct: 0.0, color: { r: 0xff, g: 0x00, b: 0 } },
                        { pct: 0.5, color: { r: 0xff, g: 0xff, b: 0 } },
                        { pct: 1.0, color: { r: 0x00, g: 0xff, b: 0 } }
                    ];
                    let i = 1;
                        for(i; i < percentColors.length - 1; i++)
                        {
                            if(pct < percentColors[i].pct)
                            {
                                break;
                            }
                        }

                    let lower       = percentColors[i - 1];
                    let upper       = percentColors[i];
                    let range       = upper.pct - lower.pct;
                    let rangePct    = (pct - lower.pct) / range;
                    let pctLower    = 1 - rangePct;
                    let pctUpper    = rangePct;
                    let color       = {
                        r: Math.floor(lower.color.r * pctLower + upper.color.r * pctUpper),
                        g: Math.floor(lower.color.g * pctLower + upper.color.g * pctUpper),
                        b: Math.floor(lower.color.b * pctLower + upper.color.b * pctUpper)
                    };
                    return 'rgb(' + [color.r, color.g, color.b].join(',') + ')';
                };
                    self.graphNodes[i].data.performanceColor    = getColorForPercentage(Math.min(100, Math.round(performance)));
                    self.graphNodes[i].data.borderWidth         = '15px';

                    if(self.options.viewMode === 'REALISTIC')
                    {
                        self.graphNodes[i].data.label   = self.buildings[node.data.buildingType].name
                                                        + ' (' + self.formatNumber(Math.round(performance)) + '%)'
                                                        + '\n' + '(' + self.recipes[self.graphNodes[i].data.recipe].name + ')'
                                                        //+ '\n' + '(' + node.data.id + ')' // DEBUG
                                                        //+ '\n' + '(' + node.data.qtyUsed + '/' + node.data.qtyProduced + ')' // DEBUG
                                                        ;
                    }

                    if(self.options.viewMode === 'SIMPLE')
                    {
                        self.graphNodes[i].data.label   = 'x' + self.formatNumber(Math.ceil(performance / 10) / 10)
                                                        + ' ' + self.buildings[node.data.buildingType].name
                                                        + '\n' + '(' + self.recipes[self.graphNodes[i].data.recipe].name + ')';
                                                        //+ '(' + node.data.qtyUsed + '/' + node.data.qtyProduced + ')'; // DEBUG
                    }

                // Calculate required power!
                let powerUsage              = self.buildings[node.data.buildingType].powerUsed * performance / 100;
                    self.requiredPower     += powerUsage / 1000; // KW => MW

                // Add to items list
                if(self.listItems[node.data.itemOut] === undefined)
                {
                    self.listItems[node.data.itemOut] = node.data.qtyUsed;
                }
                else
                {
                    self.listItems[node.data.itemOut] += node.data.qtyUsed;
                }

                // Add to buildgins list
                if(self.listBuildings[node.data.buildingType] === undefined)
                {
                    self.listBuildings[node.data.buildingType] = 1;
                }
                else
                {
                    self.listBuildings[node.data.buildingType] += 1;
                }
            }

            if(node.data.nodeType === 'lastNodeItem' || node.data.nodeType === 'byProductItem')
            {
                self.graphNodes[i].data.label   = self.formatNumber(Math.ceil(node.data.neededQty))
                                                + ' ' + self.items[node.data.itemId].name;

                if(node.data.nodeType === 'byProductItem')
                {
                    self.graphNodes[i].data.label += '*';
                }

                // Add to items list
                if(self.listItems[node.data.itemId] === undefined)
                {
                    self.listItems[node.data.itemId] = node.data.neededQty;
                }
                else
                {
                    self.listItems[node.data.itemId] += node.data.neededQty;
                }
            }
        }

        // Clean up EDGES
        self.postMessage({type: 'updateLoaderText', text: 'Cleaning conveyor belts...'});
        for(let i = 0; i < self.graphEdges.length; i++)
        {
            let edge        = self.graphEdges[i];
            let itemName    = self.items[edge.data.itemId].name;

            let roundedQty = +(Math.round(edge.data.qty * 100) / 100);
                if(roundedQty < 0.1)
                {
                    self.graphEdges[i].data.label = itemName + ' (< 0.1/min)';
                }
                else
                {
                    self.graphEdges[i].data.label = itemName + ' (' + roundedQty + ' units/min)';
                }

            //TODO: Change width for MK++ belts...

            // Apply edge color
            if(self.items[edge.data.itemId].color !== undefined)
            {
                self.graphEdges[i].data.color = self.items[edge.data.itemId].color;
            }
        }
        /**/

        self.postMessage({type: 'updateRequiredPower', power: self.requiredPower});

        self.generateTreeList();
    };

    self.startMainNode = function(itemKey, mainRequiredQty) {
        if(self.debug === true)
        {
            console.log('startMainNode', itemKey, mainRequiredQty);
        }

        let currentRecipe           = self.getRecipeToProduceItemId(itemKey);

        if(currentRecipe !== null)
        {
            self.postMessage({type: 'updateLoaderText', text: 'Calculating production of ' + self.formatNumber(mainRequiredQty) + ' ' + self.items[itemKey].name + '...'});

            let mainNodeVisId  = itemKey + '_' + self.nodeIdKey;
                self.nodeIdKey++;

            self.addGraphNode({
                id          : mainNodeVisId,
                nodeType    : 'mainNode',
                itemId      : itemKey,
                qty         : mainRequiredQty,
                image       : self.items[itemKey].image
            });

            // Build tree...
            while(mainRequiredQty > 0)
            {
                let usesByProduct = false;

                // Can we use by product?
                let byProductNodes = self.byProductNodesByItem[itemKey];

                for(let i = 0; byProductNodes !== undefined && i < byProductNodes.length; i ++)
                {
                    let byProductData   = byProductNodes[i].data;
                    let remainingQty    = byProductData.qtyProduced - byProductData.qtyUsed;
                    let useQty          = Math.min(remainingQty, mainRequiredQty);
                        if(useQty < 0)
                        {
                            useQty = remainingQty;
                        }

                    if(remainingQty > 0 && useQty > 0)
                    {
                        // Add edge between byProduct and item..
                        self.graphEdges.push({data: {
                            id                  : byProductData.id + '_' + mainNodeVisId,
                            source              : byProductData.id,
                            target              : mainNodeVisId,
                            itemId              : itemKey,
                            qty                 : useQty
                        }});

                        byProductData.qtyUsed  += useQty;
                        mainRequiredQty        -= useQty;
                        usesByProduct           = true;
                    }
                }

                if(usesByProduct === false)
                {
                    // Regular node...
                    let qtyProducedByNode = self.buildCurrentNodeTree({
                        id              : itemKey,
                        recipe          : currentRecipe,
                        qty             : mainRequiredQty,
                        visId           : mainNodeVisId,
                        level           : 1
                    });

                    if(qtyProducedByNode !== false && qtyProducedByNode > 0)
                    {
                        // Reduce needed quantity
                        mainRequiredQty     -= qtyProducedByNode;
                    }
                    else
                    {
                        break; //Prevent infinite loop...
                    }
                }
            }
        }
    };

    self.isProductionTooFast = function(productionRecipe, productionCraftingTime, qtyProduced, qtyUsed, maxProductionSpeed)
    {
        if(qtyProduced > 0)
        {
            for(let recipeItemClassName in productionRecipe)
            {
                let requiredQty = (60 / productionCraftingTime * productionRecipe[recipeItemClassName]) * qtyUsed / qtyProduced;

                    if(requiredQty > maxProductionSpeed)
                    {
                        return true;
                    }
            }
        }

        return false;
    };

    // This used to decrement qtyUsed one unit at a time until every ingredient
    // belt fitted under maxProductionSpeed, which is O(qtyUsed) iterations.
    // The smallest acceptable value is solvable directly, so jump to it and
    // only step the last unit or two to stay bit-for-bit identical.
    self.reduceQtyUsedToBeltSpeed = function(productionRecipe, productionCraftingTime, qtyProduced, qtyUsed, maxProductionSpeed)
    {
        if(qtyProduced <= 0)
        {
            return qtyUsed;
        }

        let maxAllowedQty = Infinity;

            for(let recipeItemClassName in productionRecipe)
            {
                let qtyPerUnit = (60 / productionCraftingTime * productionRecipe[recipeItemClassName]) / qtyProduced;

                    if(qtyPerUnit > 0)
                    {
                        maxAllowedQty = Math.min(maxAllowedQty, maxProductionSpeed / qtyPerUnit);
                    }
            }

        if(maxAllowedQty !== Infinity)
        {
            // Math.floor never overshoots, so the loop below can only ever add
            // the one step that floating point rounding may have shaved off.
            let steps = Math.floor(qtyUsed - maxAllowedQty);
                if(steps > 0)
                {
                    qtyUsed -= steps;
                }
        }

        while(self.isProductionTooFast(productionRecipe, productionCraftingTime, qtyProduced, qtyUsed, maxProductionSpeed))
        {
            qtyUsed--;
        }

        return qtyUsed;
    };

    self.buildCurrentNodeTree = function(options)
    {
        if(self.debug === true)
        {
            console.log('buildCurrentNodeTree', options.qty, options.recipe, options.level);
        }

        let buildingId = self.getProductionBuildingFromRecipeId(options.recipe);

            if(buildingId !== null)
            {
                let productionCraftingTime  = 4,
                    productionPieces        = 1,
                    maxProductionSpeed      = self.options.maxBeltSpeed,
                    productionRecipe        = false;

                    self.nodeIdKey++;

                    if(self.buildings[buildingId].extractionRate !== undefined)
                    {
                        productionCraftingTime  = 1;
                        if(self.buildings[buildingId].extractionRate !== undefined)
                        {
                            productionCraftingTime = 60 / self.buildings[buildingId].extractionRate;

                            if(buildingId === 'Mining_Machine')
                            {
                                productionCraftingTime = 60 / (self.buildings[buildingId].extractionRate * self.buildings[buildingId].input);
                            }
                        }
                    }
                    else
                    {
                        if(self.recipes[options.recipe].ingredients !== undefined)
                        {
                            productionRecipe    = self.recipes[options.recipe].ingredients;
                        }

                        if(self.recipes[options.recipe].mManufactoringDuration !== undefined)
                        {
                            productionCraftingTime  = self.recipes[options.recipe].mManufactoringDuration;
                        }

                        if(self.recipes[options.recipe].produce !== undefined)
                        {
                            for(let producedClassName in self.recipes[options.recipe].produce)
                            {
                                if(producedClassName === self.items[options.id].className)
                                {
                                    productionPieces        = self.recipes[options.recipe].produce[producedClassName];
                                }
                            }
                        }
                    }

                    let currentParentVisId  = buildingId + '_'  + self.nodeIdKey;
                    let productionSpeed     = 1;
                        if(self.buildings[buildingId].productionSpeed !== undefined)
                        {
                            productionSpeed = self.buildings[buildingId].productionSpeed;
                        }

                    let qtyProduced         = (60 / productionCraftingTime * productionPieces);
                    let qtyMaxProduced      = (60 / productionCraftingTime * productionSpeed * productionPieces);
                    let qtyUsed             = Math.min(maxProductionSpeed, qtyMaxProduced, options.qty);

                        // Should we reduce builgind speed for belts?
                        if(productionRecipe !== false)
                        {
                            qtyUsed = self.reduceQtyUsedToBeltSpeed(productionRecipe, productionCraftingTime, qtyProduced, qtyUsed, maxProductionSpeed);
                        }

                    // Push new node!
                    self.graphNodes.push({data: {
                        id                  : currentParentVisId,
                        nodeType            : 'productionBuilding',
                        buildingType        : buildingId,
                        recipe              : options.recipe,
                        itemOut             : options.id,
                        productionSpeed     : productionSpeed,
                        qtyProduced         : qtyMaxProduced,
                        qtyUsed             : qtyUsed,
                        image               : self.buildings[buildingId].image
                    }});

                    // Push new edges between node and parent
                    self.graphEdges.push({data: {
                        id                  : currentParentVisId + '_' + options.visId,
                        source              : currentParentVisId,
                        target              : options.visId,
                        itemId              : options.id,
                        recipe              : options.recipe,
                        qty                 : qtyUsed
                    }});

                    // Add by-product
                    if(self.recipes[options.recipe].produce !== undefined)
                    {
                        for(let producedClassName in self.recipes[options.recipe].produce)
                        {
                            if(producedClassName !== self.items[options.id].className)
                            {
                                let byProductId     = self.getItemIdFromClassName(producedClassName);
                                let byProductQty    = qtyUsed / productionPieces * self.recipes[options.recipe].produce[producedClassName];

                                let alreadyExistsByProductNode  = false;
                                let existingByProductNodes      = self.byProductNodesByItem[byProductId];

                                // Find already last level item!
                                if(existingByProductNodes !== undefined && existingByProductNodes.length > 0)
                                {
                                    let existingByProductData = existingByProductNodes[0].data;

                                        alreadyExistsByProductNode = true;

                                        existingByProductData.qtyProduced  += byProductQty;
                                        existingByProductData.neededQty    += byProductQty;

                                        // Push new edges between node and parent
                                        self.graphEdges.push({data: {
                                            id                  : currentParentVisId + '_' + existingByProductData.id,
                                            source              : currentParentVisId,
                                            target              : existingByProductData.id,
                                            itemId              : byProductId,
                                            recipe              : options.recipe,
                                            qty                 : byProductQty
                                        }});
                                }

                                if(alreadyExistsByProductNode === false)
                                {
                                    self.addGraphNode({
                                        id                  : options.visId + '_byProduct',
                                        nodeType            : 'byProductItem',
                                        itemId              : byProductId,
                                        qtyUsed             : 0,
                                        qtyProduced         : byProductQty,
                                        neededQty           : byProductQty,
                                        image               : self.items[byProductId].image
                                    });

                                    // Push new edges between node and parent
                                    self.graphEdges.push({data: {
                                        id                  : currentParentVisId + '_' + options.visId + '_byProduct',
                                        source              : currentParentVisId,
                                        target              : options.visId + '_byProduct',
                                        itemId              : byProductId,
                                        recipe              : options.recipe,
                                        qty                 : byProductQty
                                    }});
                                }
                            }
                        }
                    }

                    if(productionRecipe !== false)
                    {
                        for(let recipeItemClassName in productionRecipe)
                        {
                            let recipeItemId    = self.getItemIdFromClassName(recipeItemClassName);
                            let requiredQty     = (60 / productionCraftingTime * productionRecipe[recipeItemClassName]) * qtyUsed / qtyProduced;

                            if(self.options.maxLevel !== null && self.options.maxLevel === (options.level + 1) && self.items[recipeItemId].category !== 'ore')
                            {
                                let alreadyExistsLastNode   = false;
                                let existingLastNode        = self.lastNodeByItem[recipeItemId];

                                // Find already last level item!
                                if(existingLastNode !== undefined)
                                {
                                    alreadyExistsLastNode = true;

                                    existingLastNode.data.neededQty  += requiredQty;
                                    self.graphEdges.push({data: {
                                        id                  : existingLastNode.data.id + '_' + currentParentVisId,
                                        source              : existingLastNode.data.id,
                                        target              : currentParentVisId,
                                        itemId              : recipeItemId,
                                        qty                 : requiredQty
                                    }});
                                }

                                if(alreadyExistsLastNode === false)
                                {
                                    let lastNodeVisId = currentParentVisId + '_' + recipeItemId;

                                        // Push last node!
                                        self.addGraphNode({
                                            id                  : lastNodeVisId,
                                            nodeType            : 'lastNodeItem',
                                            itemId              : recipeItemId,
                                            neededQty           : requiredQty,
                                            image               : self.items[recipeItemId].image
                                        });

                                        // Push new edges between node and parent
                                        self.graphEdges.push({data: {
                                            id                  : lastNodeVisId + '_' + currentParentVisId,
                                            source              : lastNodeVisId,
                                            target              : currentParentVisId,
                                            itemId              : recipeItemId,
                                            qty                 : requiredQty
                                        }});
                                }
                            }
                            else
                            {
                                let currentRecipe           = self.getRecipeToProduceItemId(recipeItemId);

                                if(currentRecipe !== null && currentRecipe !== 'Recipe_X-Ray_Alternative')
                                {
                                    while(requiredQty > 0)
                                    {
                                        let usesByProduct = false;

                                        // Can we use by product?
                                        let byProductNodes = self.byProductNodesByItem[recipeItemId];

                                        for(let i = 0; byProductNodes !== undefined && i < byProductNodes.length; i ++)
                                        {
                                            let byProductData   = byProductNodes[i].data;
                                            let remainingQty    = byProductData.qtyProduced - byProductData.qtyUsed;
                                            let useQty          = Math.min(remainingQty, requiredQty);

                                                if(useQty < 0)
                                                {
                                                    useQty = remainingQty;
                                                }

                                            if(remainingQty > 0 && useQty > 0)
                                            {
                                                // Add edge between byProduct and item..
                                                self.graphEdges.push({data: {
                                                    id                  : byProductData.id + '_' + currentParentVisId,
                                                    source              : byProductData.id,
                                                    target              : currentParentVisId,
                                                    itemId              : recipeItemId,
                                                    qty                 : useQty
                                                }});

                                                byProductData.qtyUsed  += useQty;
                                                requiredQty            -= useQty;
                                                usesByProduct           = true;
                                            }
                                        }

                                        if(usesByProduct === false)
                                        {
                                            // Regular node...
                                            let qtyProducedByNode = self.buildCurrentNodeTree({
                                                id              : recipeItemId,
                                                recipe          : currentRecipe,
                                                qty             : requiredQty,
                                                visId           : currentParentVisId,
                                                level           : (options.level + 1)
                                            });

                                            if(qtyProducedByNode !== false && qtyProducedByNode > 0)
                                            {
                                                // Reduce needed quantity
                                                requiredQty     -= qtyProducedByNode;
                                            }
                                            else
                                            {
                                                break; //Prevent infinite loop...
                                            }
                                        }
                                    }
                                }
                                else
                                {
                                    let lastNodeVisId = currentParentVisId + '_' + recipeItemId;

                                        // Push last node!
                                        self.addGraphNode({
                                            id                  : lastNodeVisId,
                                            nodeType            : 'lastNodeItem',
                                            itemId              : recipeItemId,
                                            neededQty           : requiredQty,
                                            image               : self.items[recipeItemId].image
                                        });

                                        // Push new edges between node and parent
                                        self.graphEdges.push({data: {
                                            id                  : lastNodeVisId + '_' + currentParentVisId,
                                            source              : lastNodeVisId,
                                            target              : currentParentVisId,
                                            itemId              : recipeItemId,
                                            qty                 : requiredQty
                                        }});
                                }
                            }
                        }
                    }

                    return qtyUsed;
            }

        return false;
    };

    // The hierarchy is walked recursively and used to re-scan every node and every
    // edge at each level. Index the (now final) graph once instead.
    self.buildGraphIndexes = function()
    {
        self.nodesById          = new Map();
        self.edgesByTargetId    = new Map();
        self.hierarchyTreeCache = new Map();

        for(let k = 0; k < self.graphNodes.length; k++)
        {
            let nodeId      = self.graphNodes[k].data.id;
            let sameIdNodes = self.nodesById.get(nodeId);

                // Node ids are not guaranteed unique, so keep them all
                if(sameIdNodes === undefined)
                {
                    sameIdNodes = [];
                    self.nodesById.set(nodeId, sameIdNodes);
                }

                sameIdNodes.push(self.graphNodes[k]);
        }

        for(let k = 0; k < self.graphEdges.length; k++)
        {
            let targetId        = self.graphEdges[k].data.target;
            let incomingEdges   = self.edgesByTargetId.get(targetId);

                if(incomingEdges === undefined)
                {
                    incomingEdges = [];
                    self.edgesByTargetId.set(targetId, incomingEdges);
                }

                incomingEdges.push(self.graphEdges[k]);
        }
    };

    self.generateTreeList = function()
    {
        self.postMessage({type: 'updateLoaderText', text: 'Generating production list...'});
        self.buildGraphIndexes();
        var html = [];
        var requestedItemsLength = Object.keys(requestedItems).length;

        if(requestedItemsLength === 0)
        {
            html.push('<p class="p-3 text-center">Please select at least one item in the production list.</p>');
        }
        else
        {
            html.push('<div class="row">');

            for(let itemId in self.requestedItems)
            {
                if(requestedItemsLength >= 1)
                {
                    html.push('<div class="col-sm-6">');
                }
                else
                {
                    html.push('<div>');
                }

                    html.push('<div class="p-3">');
                        html.push('<div class="hierarchyTree">');
                            html.push('<div class="root">');
                                html.push('<div class="child">');
                                    html.push('<img src="' + self.items[itemId].image + '" style="width: 40px;" class="mr-3" />');
                                    html.push(self.formatNumber(self.requestedItems[itemId]) + 'x ');
                                    html.push('<a href="' + self.items[itemId].url + '"style="line-height: 40px;">' + self.items[itemId].name + '</a>');

                                    let itemMainNodes = self.mainNodesByItem[itemId];

                                    for(let k = 0; itemMainNodes !== undefined && k < itemMainNodes.length; k++)
                                    {
                                        html.push(self.buildHierarchyTree(itemMainNodes[k].data.id));
                                    }

                                html.push('</div>');
                            html.push('</div>');
                        html.push('</div>');
                    html.push('</div>');
                html.push('</div>');
            }

            html.push('</div>');
        }

        self.postMessage({type: 'updateTreeList', html: html.join('')});
        self.generateItemsList();
    };

    self.buildHierarchyTree = function(parentId)
    {
        let cachedHtml = self.hierarchyTreeCache.get(parentId);
            if(cachedHtml !== undefined)
            {
                return cachedHtml;
            }

            // Also guards against a cycle sending the recursion infinite
            self.hierarchyTreeCache.set(parentId, '');

        var html = [];

        // Build current parentId childrens
        var children = self.edgesByTargetId.get(parentId);
            if(children === undefined)
            {
                children = [];
            }

        if(children.length > 0)
        {
            html.push('<div class="parent">');

            for(let i = 0; i < children.length; i++)
            {
                let childNodes = self.nodesById.get(children[i].data.source);

                for(let k = 0; childNodes !== undefined && k < childNodes.length; k++)
                {
                    let childNode = childNodes[k];

                        html.push('<div class="child">');

                            html.push('<div class="media">');

                            if(childNode.data.nodeType === 'lastNodeItem' || childNode.data.nodeType === 'byProductItem')
                            {
                                html.push('<img src="' + self.items[childNode.data.itemId].image + '" alt="' + self.items[childNode.data.itemId].name + '" style="width: 40px;" class="mr-3" />');

                                html.push('<div class="media-body">');
                                    html.push(self.formatNumber(childNode.data.neededQty) + 'x ');
                                    html.push('<a href="' + self.items[childNode.data.itemId].url + '" style="line-height: 40px;">' + self.items[childNode.data.itemId].name + '</a>');
                                html.push('</div>');
                            }
                            else
                            {
                                if(childNode.data.nodeType === 'merger')
                                {
                                    childNode.data.buildingType = 'ConveyorBeltMk1';
                                }
                                if(childNode.data.nodeType === 'splitter')
                                {
                                    childNode.data.buildingType = 'Splitter';
                                }

                                html.push('<img src="' + self.buildings[childNode.data.buildingType].image + '" alt="' + self.buildings[childNode.data.buildingType].name + '" style="width: 40px;" class="mr-3 collapseChildren" />');

                                html.push('<div class="media-body">');
                                    html.push('<a href="' + self.buildings[childNode.data.buildingType].url + '">' + self.buildings[childNode.data.buildingType].name + '</a>');

                                    if(childNode.data.nodeType === 'productionBuilding')
                                    {
                                        //html.push(' <em style="color: ' + childNode.data.performanceColor + '">(' + k + ')</em>'); // DEBUG
                                        html.push(' <em style="color: ' + childNode.data.performanceColor + '">(' + childNode.data.performance + '%)</em>');
                                        //html.push(' <em style="color: ' + childNode.data.performanceColor + '">(' + childNode.data.qtyUsed + ' / ' + childNode.data.qtyProduced + ')</em>'); // DEBUG
                                    }

                                    html.push('<br />');
                                    html.push('<small>' + children[i].data.label + '</small>');
                                html.push('</div>');
                            }

                            html.push('</div>');

                            if(childNode.data.nodeType !== 'byProductItem')
                            {
                                html.push(self.buildHierarchyTree(childNode.data.id));
                            }

                        html.push('</div>');

                        //break; // Don't break as not merged belt can have more than one input...
                }
            }

            html.push('</div>');
        }

        let renderedHtml = html.join('');
            self.hierarchyTreeCache.set(parentId, renderedHtml);

        return renderedHtml;
    };

    self.generateItemsList = function()
    {
        self.postMessage({type: 'updateLoaderText', text: 'Generating items list...'});
        var html = [];
        var listItemsLength = Object.keys(self.listItems).length;

        if(listItemsLength === 0)
        {
            html.push('<p class="p-3 text-center">Please select at least one item in the production list.</p>');
        }
        else
        {
            var reversedKeys = Object.keys(self.listItems).reverse();

            html.push('<table class="table table-striped mb-0">');

            html.push('<thead>');
                html.push('<tr>');
                    html.push('<th></th>');
                    html.push('<th>Needed per minute</th>');
                html.push('</tr>');
            html.push('</thead>');

            html.push('<tbody>');

            for(let i = 0; i < reversedKeys.length; i++)
            {
                var itemId  = reversedKeys[i];

                html.push('<tr>');
                    html.push('<td width="40"><img src="' + self.items[itemId].image + '" style="width: 40px;" /></td>');
                    html.push('<td class="align-middle">');
                        html.push(self.formatNumber(self.listItems[itemId]) + ' units/min of ');
                        html.push('<a href="' + self.items[itemId].url + '">' + self.items[itemId].name + '</a>');
                   html.push('</td>');
                html.push('</tr>');
            }

            html.push('</tbody>');
            html.push('</table>');
        }

        self.postMessage({type: 'updateItemsList', html: html.join('')});
        self.generateBuildingList();
    };

    self.generateBuildingList = function()
    {
        self.postMessage({type: 'updateLoaderText', text: 'Generating buildings list...'});
        var html = [];
        var buildingsListRecipe = {};
        var listBuildingsLength = Object.keys(self.listBuildings).length;

        if(listBuildingsLength === 0)
        {
            html.push('<p class="p-3 text-center">Please select at least one item in the production list.</p>');
        }
        else
        {
            var reversedKeys = Object.keys(self.listBuildings).reverse();

            html.push('<table class="table table-striped mb-0">');

            for(let i = 0; i < reversedKeys.length; i++)
            {
                let buildingId          = reversedKeys[i];
                let currentRecipe       = null;
                let buildingClassName   = self.buildings[buildingId].className.replace(/Build_/g, 'Desc_');

                // Build recipe...
                let recipeId = self.recipeIdByProducedClassName[buildingClassName];

                if(recipeId !== undefined)
                {
                    currentRecipe = [];

                    for(let ingredient in self.recipes[recipeId].ingredients)
                    {
                        let itemId = self.getItemIdFromClassName(ingredient);

                            if(itemId !== null)
                            {
                                currentRecipe.push({
                                    id      : itemId,
                                    name    : self.items[itemId].name,
                                    image   : self.items[itemId].image,
                                    qty     : self.recipes[recipeId].ingredients[ingredient]
                                });
                            }
                    }
                }

                html.push('<tr>');
                html.push('<td width="40" class="align-middle"><img src="' + self.buildings[buildingId].image + '" style="width: 40px;" /></td>');

                html.push('<td class="align-middle">');
                    html.push(self.formatNumber(self.listBuildings[buildingId]) + 'x ');
                    html.push('<a href="' + self.buildings[buildingId].url + '">' + self.buildings[buildingId].name + '</a>');
                html.push('</td>');

                html.push('<td class="align-middle">');

                    var toJoin = [];

                    if(currentRecipe !== null)
                    {
                        for(let j = 0; j < currentRecipe.length; j++)
                        {
                            var recipeQty = self.listBuildings[buildingId] * currentRecipe[j].qty;
                            var temp = [];
                                temp.push(self.formatNumber(recipeQty) + 'x ');
                                temp.push('<img src="' + currentRecipe[j].image + '" title="' + currentRecipe[j].name + '" style="width: 24px;" />');

                            if(buildingsListRecipe[currentRecipe[j].id] === undefined)
                            {
                                buildingsListRecipe[currentRecipe[j].id] = recipeQty;
                            }
                            else
                            {
                                buildingsListRecipe[currentRecipe[j].id] += recipeQty;
                            }

                            toJoin.push(temp.join(''));
                        }
                    }

                    html.push(toJoin.join(', '));

                html.push('</td>');

                html.push('</tr>');
            }

            html.push('<tr>');
            html.push('<td></td>');
            html.push('<td><strong>Total:</strong></td>');
            html.push('<td class="p-0"><ul class="list-group list-group-flush">');

                for(let idRecipe in buildingsListRecipe)
                {
                    html.push('<li class="list-group-item">');

                    html.push(self.formatNumber(buildingsListRecipe[idRecipe]) + 'x ');

                    if(self.items[idRecipe] !== undefined)
                    {
                        html.push('<img src="' + self.items[idRecipe].image + '" title="' + self.items[idRecipe].name + '" style="width: 24px;" /> ');
                        html.push('<a href="' + self.items[idRecipe].url + '">' + self.items[idRecipe].name + '</a>');
                    }
                    else
                    {
                        html.push(idRecipe);
                    }

                    html.push('</li>');
                }

            html.push('</ul></td>');
            html.push('</tr>');

            html.push('</table>');
        }

        self.postMessage({type: 'updateBuildingsList', html: html.join('')});
        self.postMessage({type: 'updateLoaderText', text: 'Generating buildings layout...'});
        self.postMessage({type: 'updateGraphNetwork', nodes: self.graphNodes, edges: self.graphEdges, direction: self.graphDirection});
        self.postMessage({type: 'done'});
    };


    self.getItemIdFromClassName = function(itemClassName)
    {
        if(self.itemIdByClassName === null)
        {
            self.buildLookupIndexes();
        }

        let itemId = self.itemIdByClassName[itemClassName];

        return (itemId !== undefined) ? itemId : null;
    };

    self.getRecipeToProduceItemId = function(itemId)
    {
        // The result only depends on the (immutable) recipe list and options,
        // so resolve it once per item instead of once per produced node.
        let cachedRecipe = self.recipeForItemCache[itemId];
            if(cachedRecipe !== undefined)
            {
                return cachedRecipe;
            }

        let foundRecipe = self.findRecipeToProduceItemId(itemId);
            self.recipeForItemCache[itemId] = foundRecipe;

        return foundRecipe;
    };

    self.findRecipeToProduceItemId = function(itemId)
    {
        if(self.recipesByProducedClassName === null)
        {
            self.buildLookupIndexes();
        }

        let currentItemClassName    = self.items[itemId].className;
        let availableRecipes        = [];

            // Grab recipe that can produce the requested item...
            for(let i = 0; i < self.options.altRecipes.length; i++)
            {
                let recipeKey = self.options.altRecipes[i];

                    if(self.recipes[recipeKey] !== undefined)
                    {
                        if(self.recipes[recipeKey].produce[currentItemClassName] !== undefined)
                        {
                            return recipeKey;
                        }
                    }
            }

            if(self.recipesByProducedClassName[currentItemClassName] !== undefined)
            {
                availableRecipes = self.recipesByProducedClassName[currentItemClassName].slice();
            }

            if(availableRecipes.length > 0)
            {
                if(currentItemClassName === 'Hydrogen')
                {
                    return 'Recipe_Plasma_Refining';
                }

                // Order by produce length
                availableRecipes.sort(function(a, b){
                    let aLength = self.recipeProduceLength[a];
                    let bLength = self.recipeProduceLength[b];

                        if(aLength === bLength)
                        {
                            if(self.recipes[a].className.search('_Alternative') !== -1 && self.recipes[b].className.search('_Alternative') === -1)
                            {
                                return 1;
                            }
                            if(self.recipes[a].className.search('_Alternative') === -1 && self.recipes[b].className.search('_Alternative') !== -1)
                            {
                                return -1;
                            }

                            let produceA = null;
                            let produceB = null;

                                for(let item in self.recipes[a].produce)
                                {
                                    if(item === itemId)
                                    {
                                        produceA = (60 / self.recipes[a].mManufactoringDuration * self.recipes[a].produce[item]);
                                        break;
                                    }
                                }
                                for(let item in self.recipes[b].produce)
                                {
                                    if(item === itemId)
                                    {
                                        produceB = (60 / self.recipes[b].mManufactoringDuration * self.recipes[b].produce[item]);
                                        break;
                                    }
                                }

                            if(produceA !== null && produceB !== null)
                            {
                                if(produceA === produceB)
                                {
                                    return self.recipes[a].name.localeCompare(self.recipes[b].name);
                                }

                                return produceB - produceA;
                            }
                        }

                    return aLength - bLength;
                });

                return availableRecipes[0];
            }

        return null;
    };

    self.getProductionBuildingFromRecipeId = function(recipeId)
    {
        let cachedBuilding = self.buildingForRecipeCache[recipeId];
            if(cachedBuilding !== undefined)
            {
                return cachedBuilding;
            }

        if(self.buildingKeyByClassName === null)
        {
            self.buildLookupIndexes();
        }

        let foundBuilding = null;

        // Find suitable building
        if(self.recipes[recipeId].mProducedIn !== undefined)
        {
            for(let i = self.recipes[recipeId].mProducedIn.length - 1; i >= 0; i--)
            {
                let currentBuilding = self.buildingKeyByClassName[self.recipes[recipeId].mProducedIn[i]];

                    if(currentBuilding !== undefined)
                    {
                        foundBuilding = currentBuilding;
                        break;
                    }
            }
        }

        self.buildingForRecipeCache[recipeId] = foundBuilding;

        return foundBuilding;
    };

    // Re-points every edge attached to fromNodeId at toNodeId, and keeps the
    // endpoint index usable by moving the bucket across in one go.
    self.moveIndexedEdges = function(edgeIndex, fromNodeId, toNodeId, endpoint)
    {
        let movedEdges = edgeIndex[fromNodeId];

            if(movedEdges === undefined)
            {
                return;
            }

            for(let k = 0; k < movedEdges.length; k++)
            {
                movedEdges[k].data[endpoint] = toNodeId;
            }

            if(edgeIndex[toNodeId] === undefined)
            {
                edgeIndex[toNodeId] = movedEdges;
            }
            else
            {
                let targetEdges = edgeIndex[toNodeId];

                    for(let k = 0; k < movedEdges.length; k++)
                    {
                        targetEdges.push(movedEdges[k]);
                    }
            }

            delete edgeIndex[fromNodeId];
    };

    self.testEdgesMaxSpeeds = function(mergingNodeData, sourceNodeData, mergedPercentage, edgesByTarget)
    {
        let inputQty            = {};
        let maxMergedQty        = self.options.maxBeltSpeed;
        let incomingEdgeLists   = [edgesByTarget[mergingNodeData.id], edgesByTarget[sourceNodeData.id]];

            for(let l = 0; l < incomingEdgeLists.length; l++)
            {
                let incomingEdges = incomingEdgeLists[l];

                    if(incomingEdges === undefined)
                    {
                        continue;
                    }

                    for(let k = 0; k < incomingEdges.length; k++)
                    {
                        let edgeData = incomingEdges[k].data;

                            if(inputQty[edgeData.itemId] === undefined)
                            {
                                inputQty[edgeData.itemId] = 0;
                            }

                            inputQty[edgeData.itemId] += edgeData.qty * (mergedPercentage / 100);

                            if(inputQty[edgeData.itemId] > maxMergedQty)
                            {
                                return false;
                            }
                    }
            }

        return true;
    };
};