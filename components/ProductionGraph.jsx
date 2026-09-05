'use client';

import {useEffect, useRef} from 'react';

/**
 * The factory layout, drawn with cytoscape and laid out by ELK.
 *
 * The stylesheet and the layout options are the ones the upstream page used,
 * so the graph looks the same as the original planner's. cytoscape and elkjs
 * both want a DOM, so they are pulled in only once the container is mounted.
 */
export default function ProductionGraph({nodes, edges, direction, onLayoutDone})
{
    let containerRef    = useRef(null);
    let graphRef        = useRef(null);
    let layoutRef       = useRef(null);
    let pendingRef      = useRef(null);
    let layoutDoneRef   = useRef(onLayoutDone);

    layoutDoneRef.current = onLayoutDone;

    useEffect(function(){
        let cancelled = false;

        async function createGraph()
        {
            let [{default: cytoscape}, {default: elk}] = await Promise.all([
                import('cytoscape'),
                import('cytoscape-elk')
            ]);

            if(cancelled === true || containerRef.current === null)
            {
                return;
            }

            if(cytoscape.__elkRegistered !== true)
            {
                cytoscape.use(elk);
                cytoscape.__elkRegistered = true;
            }

            graphRef.current = cytoscape({
                container           : containerRef.current,
                wheelSensitivity    : 0.05,
                layout              : undefined,
                elements            : {nodes: [], edges: []},
                style               : [
                    {
                        selector    : 'node',
                        style       : {padding: '64px', width: '384px', height: '384px'}
                    },
                    {
                        selector    : 'node[nodeType="merger"], node[nodeType="splitter"]',
                        style       : {padding: '32px', width: '128px', height: '128px'}
                    },
                    {
                        selector    : 'node[image]',
                        style       : {
                            shape                   : 'square',
                            'background-fit'        : 'contain',
                            'background-image'      : 'data(image)',
                            'background-opacity'    : 0
                        }
                    },
                    {
                        selector    : 'node[performance]',
                        style       : {
                            shape                   : 'ellipse',
                            'background-fit'        : 'none',
                            'background-width'      : '75%',
                            'background-height'     : '75%',
                            'border-width'          : 'data(borderWidth)'
                        }
                    },
                    {
                        selector    : 'node[performanceColor]',
                        style       : {'border-color': 'data(performanceColor)'}
                    },
                    {
                        selector    : 'node[label]',
                        style       : {
                            'text-margin-y' : '20px',
                            label           : 'data(label)',
                            'text-valign'   : 'bottom',
                            'font-size'     : '64px',
                            'text-wrap'     : 'wrap',
                            color           : '#FFFFFF'
                        }
                    },
                    {
                        selector    : 'edge',
                        style       : {
                            'curve-style'           : 'bezier',
                            'target-arrow-shape'    : 'triangle',
                            'line-color'            : '#2b7ce9',
                            'target-arrow-color'    : '#2b7ce9',
                            opacity                 : 1,
                            width                   : '15px'
                        }
                    },
                    {
                        selector    : 'edge[color]',
                        style       : {
                            'line-color'            : 'data(color)',
                            'target-arrow-color'    : 'data(color)'
                        }
                    },
                    {
                        selector    : 'edge[label]',
                        style       : {
                            'text-margin-y'     : '-30px',
                            'text-rotation'     : 'autorotate',
                            label               : 'data(label)',
                            'font-size'         : '36px',
                            color               : '#FFFFFF'
                        }
                    }
                ]
            });

            // A result that arrived while cytoscape was still loading.
            if(pendingRef.current !== null)
            {
                let pending = pendingRef.current;
                    pendingRef.current = null;
                    render(pending.nodes, pending.edges, pending.direction);
            }
        }

        createGraph();

        return function(){
            cancelled = true;

            if(layoutRef.current !== null)
            {
                layoutRef.current.stop();
                layoutRef.current = null;
            }
            if(graphRef.current !== null)
            {
                graphRef.current.destroy();
                graphRef.current = null;
            }
        };
    }, []);

    function render(graphNodes, graphEdges, graphDirection)
    {
        let graph = graphRef.current;

            if(graph === null)
            {
                pendingRef.current = {nodes: graphNodes, edges: graphEdges, direction: graphDirection};
                return;
            }

            if(layoutRef.current !== null)
            {
                layoutRef.current.stop();
            }

            graph.json({elements: {nodes: graphNodes, edges: graphEdges}});

            if(graphNodes.length === 0)
            {
                if(layoutDoneRef.current !== undefined)
                {
                    layoutDoneRef.current();
                }

                return;
            }

            layoutRef.current = graph.layout({
                name                        : 'elk',
                nodeDimensionsIncludeLabels : true,
                fit                         : true,
                ranker                      : 'longest-path',
                elk                         : {
                    'elk.layered.spacing.nodeNodeBetweenLayers' : 768,
                    'elk.layered.spacing.nodeNode'              : 512,
                    'elk.direction'                             : graphDirection,
                    'elk.algorithm'                             : 'layered',
                    'elk.layered.crossingMinimization.strategy'  : 'LAYER_SWEEP',
                    'elk.edgeRouting'                           : 'ORTHOGONAL',

                    spacing                     : 512,
                    inLayerSpacingFactor        : 50,
                    layoutHierarchy             : true,
                    intCoordinates              : true,
                    zoomToFit                   : true,
                    separateConnectedComponents : false
                }
            });

            layoutRef.current.on('layoutstop', function(){
                if(layoutDoneRef.current !== undefined)
                {
                    layoutDoneRef.current();
                }
            });

            layoutRef.current.run();
    }

    useEffect(function(){
        if(nodes === null)
        {
            return;
        }

        render(nodes, edges, direction);
    }, [nodes, edges, direction]);

    return <div className="graphCanvas" ref={containerRef} />;
}
