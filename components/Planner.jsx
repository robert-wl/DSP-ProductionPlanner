import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import BuildOrder from './BuildOrder.jsx';
import ItemPicker from './ItemPicker.jsx';
import ProductionGraph from './ProductionGraph.jsx';
import {requestPanes, startPlannerWorker} from '../lib/plannerWorker.js';
import {renderBuildingsList, renderItemsList} from '../lib/resultHtml.mjs';
import {
    ASSEMBLER_SPEEDS,
    DEFAULT_STATE,
    DIRECTIONS,
    SMELTER_SPEEDS,
    altRecipesFrom,
    buildFormData,
    pickableItems,
    recipeChoicesFor,
    recipeChoicesFrom,
    recipesForState,
    shareUrlFor,
    stateFromPayload
} from '../lib/plannerState.js';

// The build order leads: it is the one that answers "what do I place first",
// which is the question you have before the factory exists. The layout is what
// you check once it does.
const TABS = [
    {id: 'tree',        label: 'Build order'},
    {id: 'graph',       label: 'Layout'},
    {id: 'items',       label: 'Items'},
    {id: 'buildings',   label: 'Buildings'}
];

// Matches the debounce the upstream page used, so holding an arrow key on
// a quantity does not start a worker per keystroke.
const RECALCULATE_DELAY = 500;

export default function Planner({initialPayload})
{
    let [gameData, setGameData]         = useState(null);
    let [gameDataError, setGameDataErr] = useState(null);

    let [state, setState]               = useState(function(){
        return initialPayload === null || initialPayload === undefined
             ? DEFAULT_STATE
             : stateFromPayload(initialPayload, null);
    });

    let [busy, setBusy]                 = useState(false);
    let [loaderText, setLoaderText]     = useState('');
    let [workerError, setWorkerError]   = useState(null);

    let [power, setPower]               = useState(null);
    // What the worker posts for the three list panes: the data behind them,
    // not the markup. lib/resultHtml.mjs turns each into HTML below.
    let [treeData, setTreeData]         = useState(null);
    let [itemsData, setItemsData]       = useState(null);
    let [buildingsData, setBuildings]   = useState(null);
    let [graph, setGraph]               = useState({nodes: null, edges: [], direction: 'RIGHT'});

    let [tab, setTab]                   = useState('tree');
    let [picker, setPicker]             = useState(null);
    let [showRecipes, setShowRecipes]   = useState(false);
    let [copied, setCopied]             = useState(false);

    let workerRef       = useRef(null);
    let isFirstRunRef   = useRef(true);

    // Which of the four results the current worker has been asked for, and
    // which tab wants one. A run only builds the tab you are looking at; the
    // rest are asked for when you open them.
    let requestedRef    = useRef(new Set());
    let awaitingGraph   = useRef(false);
    let tabRef          = useRef(tab);
        tabRef.current  = tab;

    // Game data -------------------------------------------------------------
    useEffect(function(){
        let cancelled = false;

        fetch('/data/game.json')
            .then(function(response){
                if(response.ok === false)
                {
                    throw new Error('The game data request failed (' + response.status + ').');
                }

                return response.json();
            })
            .then(function(data){
                if(cancelled === true)
                {
                    return;
                }

                setGameData(data);

                // Drop anything in a shared URL this dataset does not know.
                if(initialPayload !== null && initialPayload !== undefined)
                {
                    setState(stateFromPayload(initialPayload, pickableItems(data)));
                }
            })
            .catch(function(error){
                if(cancelled === false)
                {
                    setGameDataErr(error.message);
                }
            });

        return function(){ cancelled = true; };
    }, [initialPayload]);

    // Calculation -----------------------------------------------------------
    let runCalculation = useCallback(function(currentState, currentGameData, pushUrl)
    {
        if(workerRef.current !== null)
        {
            workerRef.current.terminate();
            workerRef.current = null;
        }

        setWorkerError(null);
        setPower(null);
        setTreeData(null);
        setItemsData(null);
        setBuildings(null);
        // Left up, the old layout would read as this plan's until the graph
        // pane is asked for again, which may be never.
        setGraph({nodes: null, edges: [], direction: currentState.direction});

        let firstPane = tabRef.current;

        requestedRef.current    = new Set([firstPane]);
        awaitingGraph.current   = (firstPane === 'graph');

        workerRef.current = startPlannerWorker({
            language    : currentGameData.language || 'en',
            buildings   : currentGameData.buildingsData,
            items       : currentGameData.itemsData,
            // Narrowed to the machine tiers this run uses, for the groups the
            // worker has no option for.
            recipes     : recipesForState(currentState, currentGameData.recipesData),
            formData    : buildFormData(currentState),
            panes       : [firstPane],

            onError     : function(message){
                setWorkerError(message);
                awaitingGraph.current = false;
                setBusy(false);
            },

            onMessage   : function(message){
                switch(message.type)
                {
                    case 'showLoader':
                        setBusy(true);
                        break;

                    case 'updateLoaderText':
                        setLoaderText(message.text);
                        break;

                    case 'updateUrl':
                        if(pushUrl === true)
                        {
                            window.history.pushState({}, '', shareUrlFor(message.url, currentState));
                        }
                        break;

                    case 'updateRequiredPower':
                        setPower(message.power);
                        break;

                    case 'updateTreeList':
                        setTreeData(message);
                        break;

                    case 'updateItemsList':
                        setItemsData(message);
                        break;

                    case 'updateBuildingsList':
                        setBuildings(message);
                        break;

                    case 'updateGraphNetwork':
                        setGraph({nodes: message.nodes, edges: message.edges, direction: message.direction});
                        break;

                    case 'done':
                        // A tab opened while the worker was busy could not be
                        // asked for then; its turn is now.
                        if(requestedRef.current.has(tabRef.current) === false && workerRef.current !== null)
                        {
                            requestedRef.current.add(tabRef.current);
                            awaitingGraph.current = awaitingGraph.current || tabRef.current === 'graph';

                            requestPanes(workerRef.current, [tabRef.current]);
                            break;
                        }

                        if(awaitingGraph.current === false)
                        {
                            setBusy(false);
                        }
                        break;

                    default:
                        break;
                }
            }
        });
    }, []);

    useEffect(function(){
        if(gameData === null)
        {
            return;
        }

        let isFirstRun  = isFirstRunRef.current;
        let delay       = isFirstRun === true ? 0 : RECALCULATE_DELAY;

            // Show the loader for the debounce too, so the panels are never
            // silently displaying the previous run's numbers.
            setBusy(true);
            setLoaderText('Calculating\u2026');

        let timeout = setTimeout(function(){
            isFirstRunRef.current = false;
            runCalculation(state, gameData, isFirstRun === false);
        }, delay);

        return function(){ clearTimeout(timeout); };
    }, [state, gameData, runCalculation]);

    useEffect(function(){
        return function(){
            if(workerRef.current !== null)
            {
                workerRef.current.terminate();
                workerRef.current = null;
            }
        };
    }, []);

    // Opening a tab this run has not built yet. The worker still has the graph
    // it worked out, so this is the one result, not the whole calculation.
    // While it is still busy the request would sit behind the run anyway, so
    // the 'done' handler picks it up instead.
    useEffect(function(){
        if(workerRef.current === null || busy === true || requestedRef.current.has(tab) === true)
        {
            return;
        }

        requestedRef.current.add(tab);

        if(tab === 'graph')
        {
            awaitingGraph.current = true;
        }

        requestPanes(workerRef.current, [tab]);
    }, [tab, busy]);

    // The markup for the two list panes. The worker posts the data and this is
    // where it becomes HTML.
    let itemsHtml = useMemo(function(){
        return itemsData === null ? '' : renderItemsList(itemsData);
    }, [itemsData]);

    let buildingsHtml = useMemo(function(){
        return buildingsData === null ? '' : renderBuildingsList(buildingsData);
    }, [buildingsData]);

    // Item art is sliced out of the FactorioLab sprite into public/icons at
    // build time. If one is missing, swap in the placeholder rather than
    // leaving a broken-image glyph. Images arrive inside generated HTML, so
    // this listens on the capture phase - "error" does not bubble.
    useEffect(function(){
        function onError(event)
        {
            let image = event.target;

                if(image.tagName !== 'IMG' || image.dataset.fallbackApplied === 'true')
                {
                    return;
                }

                image.dataset.fallbackApplied = 'true';
                image.src = '/placeholder.svg';
        }

        document.addEventListener('error', onError, true);

        return function(){ document.removeEventListener('error', onError, true); };
    }, []);

    // State helpers ---------------------------------------------------------
    function updateOption(key, value)
    {
        setState(function(previous){
            return {...previous, [key]: value};
        });
    }

    function setQuantity(list, itemId, value)
    {
        setState(function(previous){
            return {...previous, [list]: {...previous[list], [itemId]: value}};
        });
    }

    function removeItem(list, itemId)
    {
        setState(function(previous){
            let next = {...previous[list]};
                delete next[itemId];

            return {...previous, [list]: next};
        });
    }

    function addItem(list, itemId)
    {
        setPicker(null);
        setQuantity(list, itemId, '60');
    }

    // An empty recipeId hands the item back to the planner's own pick.
    function setRecipeChoice(itemId, recipeId)
    {
        setState(function(previous){
            let choices = {...recipeChoicesFrom(previous.altRecipes, gameData)};

                if(recipeId === '')
                {
                    delete choices[itemId];
                }
                else
                {
                    choices[itemId] = recipeId;
                }

            return {...previous, altRecipes: altRecipesFrom(choices, gameData.recipesData)};
        });
    }

    function reset()
    {
        setState(DEFAULT_STATE);
        window.history.pushState({}, '', '/');
    }

    async function copyShareLink()
    {
        try
        {
            await navigator.clipboard.writeText(window.location.href);
            setCopied(true);
            setTimeout(function(){ setCopied(false); }, 2000);
        }
        catch(error)
        {
            // Clipboard access can be denied; the URL bar already holds the link.
            setCopied(false);
        }
    }

    // Derived ---------------------------------------------------------------
    let items = useMemo(function(){ return pickableItems(gameData); }, [gameData]);

    // Only items more than one recipe makes: everywhere else there is nothing
    // to choose between.
    let recipeChoices = useMemo(function(){
        return recipeChoicesFor(gameData);
    }, [gameData]);

    let chosenRecipes = useMemo(function(){
        return recipeChoicesFrom(state.altRecipes, gameData);
    }, [state.altRecipes, gameData]);

    let chosenCount = Object.keys(chosenRecipes).length;

    let beltOptions = useMemo(function(){
        if(gameData === null)
        {
            return [];
        }

        let belts = [];

        for(let buildingId in gameData.buildingsData)
        {
            let building = gameData.buildingsData[buildingId];

                if(typeof building.beltSpeed === 'number')
                {
                    belts.push({value: String(building.beltSpeed), label: building.name + ' (' + building.beltSpeed + '/s)'});
                }
        }

        return belts.sort(function(a, b){ return Number(a.value) - Number(b.value); });
    }, [gameData]);

    let isSimple    = state.view === 'SIMPLE';
    let outputIds   = Object.keys(state.outputs);
    let inputIds    = Object.keys(state.inputs);

    if(gameDataError !== null)
    {
        return (
            <main className="shell">
                <div className="notice error">
                    <strong>Game data unavailable.</strong> {gameDataError}
                </div>
            </main>
        );
    }

    if(gameData === null)
    {
        return (
            <main className="shell">
                <div className="notice">Loading game data&hellip;</div>
            </main>
        );
    }

    return (
        <main className="shell">
            <header className="topBar">
                <div className="brand">
                    <h1>Dyson Sphere Program <span>Production Planner</span></h1>
                    <p className="muted">Pick what you want per minute; the planner works out the factory behind it.</p>
                </div>

                <div className="topBarActions">
                    <div className="powerBadge">
                        <span className="powerLabel">Required power</span>
                        <strong>{power === null ? '—' : new Intl.NumberFormat().format(Math.ceil(power * 100) / 100) + ' MW'}</strong>
                    </div>
                    <button type="button" className="button" onClick={copyShareLink}>{copied === true ? 'Link copied' : 'Copy link'}</button>
                    <button type="button" className="button ghost" onClick={reset}>Reset</button>
                </div>
            </header>

            {gameData.source === 'bundled' && gameData.note && (
                <div className="notice warning">
                    <strong>Using the bundled game data.</strong>{' '}
                    {gameData.note}
                </div>
            )}

            {workerError !== null && (
                <div className="notice error"><strong>The calculation failed.</strong> {workerError}</div>
            )}

            <div className="columns">
                <aside className="sidebar">
                    <section className="panel">
                        <div className="panelHead">
                            <h2>Production</h2>
                            <button type="button" className="button small" onClick={function(){ setPicker('outputs'); }}>Add item</button>
                        </div>

                        {outputIds.length === 0
                            ? <p className="muted panelEmpty">Nothing requested yet. Add an item to plan for.</p>
                            : <ul className="quantityList">
                                {outputIds.map(function(itemId){
                                    return (
                                        <QuantityRow
                                            key={itemId}
                                            item={items[itemId]}
                                            itemId={itemId}
                                            value={state.outputs[itemId]}
                                            onChange={function(value){ setQuantity('outputs', itemId, value); }}
                                            onRemove={function(){ removeItem('outputs', itemId); }}
                                        />
                                    );
                                })}
                              </ul>}
                    </section>

                    <section className="panel">
                        <div className="panelHead">
                            <h2>Already available</h2>
                            <button type="button" className="button small" onClick={function(){ setPicker('inputs'); }}>Add input</button>
                        </div>

                        <p className="muted panelHint">Items you already produce elsewhere. The planner feeds them in instead of building their chain.</p>

                        {inputIds.length > 0 && (
                            <ul className="quantityList">
                                {inputIds.map(function(itemId){
                                    return (
                                        <QuantityRow
                                            key={itemId}
                                            item={items[itemId]}
                                            itemId={itemId}
                                            value={state.inputs[itemId]}
                                            onChange={function(value){ setQuantity('inputs', itemId, value); }}
                                            onRemove={function(){ removeItem('inputs', itemId); }}
                                        />
                                    );
                                })}
                            </ul>
                        )}
                    </section>

                    <section className="panel">
                        <div className="panelHead"><h2>Options</h2></div>

                        <label className="field">
                            <span>View</span>
                            <select value={state.view} onChange={function(event){ updateOption('view', event.target.value); }}>
                                <option value="REALISTIC">Realistic (belts, mergers, splitters)</option>
                                <option value="SIMPLE">Simple (buildings only)</option>
                            </select>
                        </label>

                        <label className="field">
                            <span>Layout direction</span>
                            <select value={state.direction} onChange={function(event){ updateOption('direction', event.target.value); }}>
                                {DIRECTIONS.map(function(direction){
                                    return <option key={direction.value} value={direction.value}>{direction.label}</option>;
                                })}
                            </select>
                        </label>

                        <label className="field">
                            <span>Max assembler</span>
                            <select value={state.maxAssemblerSpeed} onChange={function(event){ updateOption('maxAssemblerSpeed', event.target.value); }}>
                                {ASSEMBLER_SPEEDS.map(function(speed){
                                    return <option key={speed.value} value={speed.value}>{speed.label}</option>;
                                })}
                            </select>
                        </label>

                        <label className="field">
                            <span>Smelter</span>
                            <select value={state.maxSmelterSpeed} onChange={function(event){ updateOption('maxSmelterSpeed', event.target.value); }}>
                                {SMELTER_SPEEDS.map(function(speed){
                                    return <option key={speed.value} value={speed.value}>{speed.label}</option>;
                                })}
                            </select>
                        </label>

                        {isSimple === false && (
                            <>
                                <label className="field">
                                    <span>Merge identical buildings</span>
                                    <select value={state.mergeBuildings} onChange={function(event){ updateOption('mergeBuildings', event.target.value); }}>
                                        <option value="1">Yes</option>
                                        <option value="0">No</option>
                                    </select>
                                </label>

                                <label className="field">
                                    <span>Use manifolds</span>
                                    <select value={state.useManifolds} onChange={function(event){ updateOption('useManifolds', event.target.value); }}>
                                        <option value="1">Yes</option>
                                        <option value="0">No</option>
                                    </select>
                                </label>

                                <label className="field">
                                    <span>Belt</span>
                                    {beltOptions.length > 0
                                        ? <select value={state.maxBeltSpeed} onChange={function(event){ updateOption('maxBeltSpeed', event.target.value); }}>
                                            {beltOptions.some(function(belt){ return belt.value === state.maxBeltSpeed; }) === false && (
                                                <option value={state.maxBeltSpeed}>{state.maxBeltSpeed}/s</option>
                                            )}
                                            {beltOptions.map(function(belt){
                                                return <option key={belt.value} value={belt.value}>{belt.label}</option>;
                                            })}
                                          </select>
                                        : <input
                                            type="number"
                                            min="1"
                                            step="1"
                                            value={state.maxBeltSpeed}
                                            onChange={function(event){ updateOption('maxBeltSpeed', event.target.value); }}
                                          />}
                                </label>

                                <label className="field">
                                    <span>Stop after N levels</span>
                                    <input
                                        type="number"
                                        min="1"
                                        step="1"
                                        placeholder="No limit"
                                        value={state.maxLevel}
                                        onChange={function(event){ updateOption('maxLevel', event.target.value); }}
                                    />
                                </label>
                            </>
                        )}

                        {isSimple === true && (
                            <p className="muted panelHint">Simple view ignores belts, merging and depth limits.</p>
                        )}
                    </section>

                    {recipeChoices.length > 0 && (
                        <section className="panel">
                            <div className="panelHead">
                                <h2>Recipes</h2>
                                <button type="button" className="button small ghost" onClick={function(){ setShowRecipes(showRecipes === false); }}>
                                    {showRecipes === true ? 'Hide' : (chosenCount > 0 ? chosenCount + ' chosen' : 'Show')}
                                </button>
                            </div>

                            {showRecipes === true && (
                                <>
                                    <p className="muted panelHint">Items more than one recipe makes. Left on auto, the planner picks the one shown.</p>

                                    <ul className="recipeList">
                                        {recipeChoices.map(function(choice){
                                            let selected = chosenRecipes[choice.itemId];
                                            let active   = choice.recipes.find(function(recipe){
                                                return recipe.id === (selected === undefined ? choice.auto : selected);
                                            });

                                            return (
                                                <li key={choice.itemId} className="recipeRow">
                                                    {choice.image
                                                        ? <img src={choice.image} alt="" />
                                                        : <span className="quantityRowIcon" aria-hidden="true" />}

                                                    <div className="recipeRowBody">
                                                        <span className="quantityRowName">{choice.name}</span>

                                                        <select
                                                            value={selected === undefined ? '' : selected}
                                                            aria-label={'Recipe for ' + choice.name}
                                                            onChange={function(event){ setRecipeChoice(choice.itemId, event.target.value); }}
                                                        >
                                                            <option value="">
                                                                {'Auto' + (autoName(choice) === null ? '' : ' \u2014 ' + autoName(choice))}
                                                            </option>
                                                            {choice.recipes.map(function(recipe){
                                                                return <option key={recipe.id} value={recipe.id}>{recipe.name}</option>;
                                                            })}
                                                        </select>

                                                        {active !== undefined && <span className="muted recipeRowDetail">{active.detail}</span>}
                                                    </div>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </>
                            )}
                        </section>
                    )}
                </aside>

                <section className="results">
                    <nav className="tabs" role="tablist">
                        {TABS.map(function(entry){
                            return (
                                <button
                                    key={entry.id}
                                    type="button"
                                    role="tab"
                                    aria-selected={tab === entry.id}
                                    className={tab === entry.id ? 'tab active' : 'tab'}
                                    onClick={function(){ setTab(entry.id); }}
                                >
                                    {entry.label}
                                </button>
                            );
                        })}
                    </nav>

                    <div className="resultBody">
                        {busy === true && (
                            <div className="loader">
                                <div className="spinner" />
                                <h6>{loaderText || 'Calculating…'}</h6>
                            </div>
                        )}

                        <div className="tabPane scrollPane" hidden={tab !== 'tree'}>
                            <BuildOrder data={treeData} />
                        </div>

                        <div className="tabPane" hidden={tab !== 'graph'}>
                            <ProductionGraph
                                nodes={graph.nodes}
                                edges={graph.edges}
                                direction={graph.direction}
                                onLayoutDone={function(){
                                    awaitingGraph.current = false;
                                    setBusy(false);
                                }}
                            />
                        </div>

                        <div className="tabPane scrollPane" hidden={tab !== 'items'}>
                            <div className="workerHtml" dangerouslySetInnerHTML={{__html: itemsHtml}} />
                        </div>

                        <div className="tabPane scrollPane" hidden={tab !== 'buildings'}>
                            <div className="workerHtml" dangerouslySetInnerHTML={{__html: buildingsHtml}} />
                        </div>
                    </div>
                </section>
            </div>

            {picker !== null && (
                <ItemPicker
                    title={picker === 'outputs' ? 'Add an item to produce' : 'Add an item you already have'}
                    items={items}
                    excluded={Object.keys(picker === 'outputs' ? state.outputs : state.inputs)}
                    onPick={function(itemId){ addItem(picker, itemId); }}
                    onClose={function(){ setPicker(null); }}
                />
            )}
        </main>
    );
}

function autoName(choice)
{
    let auto = choice.recipes.find(function(recipe){ return recipe.id === choice.auto; });

    return auto === undefined ? null : auto.name;
}

function QuantityRow({item, itemId, value, onChange, onRemove})
{
    let name  = item === undefined ? itemId : (item.name || itemId);
    let image = item === undefined ? null : item.image;

    function step(amount)
    {
        let next = (parseFloat(value) || 0) + amount;

            onChange(String(next < 0 ? 0 : next));
    }

    return (
        <li className="quantityRow">
            {image ? <img src={image} alt="" /> : <span className="quantityRowIcon" aria-hidden="true" />}

            <div className="quantityRowBody">
                <span className="quantityRowName">{name}</span>
                <div className="stepper">
                    <button type="button" onClick={function(){ step(-10); }} aria-label={'Ten fewer ' + name}>&laquo;</button>
                    <button type="button" onClick={function(){ step(-1); }} aria-label={'One fewer ' + name}>&lsaquo;</button>
                    <input
                        type="number"
                        min="0"
                        step="1"
                        value={value}
                        aria-label={name + ' per minute'}
                        onChange={function(event){ onChange(event.target.value); }}
                    />
                    <button type="button" onClick={function(){ step(1); }} aria-label={'One more ' + name}>&rsaquo;</button>
                    <button type="button" onClick={function(){ step(10); }} aria-label={'Ten more ' + name}>&raquo;</button>
                </div>
                <span className="muted quantityRowUnit">per minute</span>
            </div>

            <button type="button" className="iconButton" onClick={onRemove} aria-label={'Remove ' + name}>&times;</button>
        </li>
    );
}
