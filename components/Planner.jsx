import {useCallback, useEffect, useMemo, useRef, useState} from 'react';

import ItemPicker from './ItemPicker.jsx';
import ProductionGraph from './ProductionGraph.jsx';
import {startPlannerWorker} from '../lib/plannerWorker.js';
import {
    ASSEMBLER_SPEEDS,
    DEFAULT_STATE,
    DIRECTIONS,
    buildFormData,
    shareUrlFor,
    stateFromPayload
} from '../lib/plannerState.js';

const TABS = [
    {id: 'graph',       label: 'Layout'},
    {id: 'tree',        label: 'Production tree'},
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
    let [treeHtml, setTreeHtml]         = useState('');
    let [itemsHtml, setItemsHtml]       = useState('');
    let [buildingsHtml, setBuildings]   = useState('');
    let [graph, setGraph]               = useState({nodes: null, edges: [], direction: 'RIGHT'});

    let [tab, setTab]                   = useState('graph');
    let [picker, setPicker]             = useState(null);
    let [showAltRecipes, setShowAlts]   = useState(false);
    let [copied, setCopied]             = useState(false);

    let workerRef       = useRef(null);
    let isFirstRunRef   = useRef(true);
    let treeRef         = useRef(null);

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
                    setState(stateFromPayload(initialPayload, data.itemsData));
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
        setTreeHtml('');
        setItemsHtml('');
        setBuildings('');

        workerRef.current = startPlannerWorker({
            language    : currentGameData.language || 'en',
            buildings   : currentGameData.buildingsData,
            items       : currentGameData.itemsData,
            recipes     : currentGameData.recipesData,
            formData    : buildFormData(currentState),

            onError     : function(message){
                setWorkerError(message);
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
                            window.history.pushState({}, '', shareUrlFor(message.url));
                        }
                        break;

                    case 'updateRequiredPower':
                        setPower(message.power);
                        break;

                    case 'updateTreeList':
                        setTreeHtml(message.html);
                        break;

                    case 'updateItemsList':
                        setItemsHtml(message.html);
                        break;

                    case 'updateBuildingsList':
                        setBuildings(message.html);
                        break;

                    case 'updateGraphNetwork':
                        setGraph({nodes: message.nodes, edges: message.edges, direction: message.direction});
                        break;

                    case 'done':
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

    // Item art is sliced out of the FactorioLab sprite into public/icons at
    // build time. If one is missing, swap in the placeholder rather than
    // leaving a broken-image glyph. Images arrive inside worker-generated
    // HTML, so this listens on the capture phase - "error" does not bubble.
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

    // The tree's building rows collapse their sub-tree on click, which the
    // upstream page wired up with jQuery after every render.
    useEffect(function(){
        let container = treeRef.current;

            if(container === null)
            {
                return;
            }

            function onClick(event)
            {
                let toggle = event.target.closest('.collapseChildren');

                    if(toggle === null || container.contains(toggle) === false)
                    {
                        return;
                    }

                let subTree = toggle.parentElement === null ? null : toggle.parentElement.nextElementSibling;

                    if(subTree !== null && subTree.classList.contains('parent') === true)
                    {
                        subTree.hidden = subTree.hidden === false;
                    }
            }

            container.addEventListener('click', onClick);

            return function(){ container.removeEventListener('click', onClick); };
    }, [treeHtml]);

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

    function toggleAltRecipe(recipeId)
    {
        setState(function(previous){
            let selected = previous.altRecipes.includes(recipeId)
                         ? previous.altRecipes.filter(function(id){ return id !== recipeId; })
                         : previous.altRecipes.concat([recipeId]);

            return {...previous, altRecipes: selected};
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
    let items = gameData === null ? {} : gameData.itemsData;

    let altRecipes = useMemo(function(){
        if(gameData === null)
        {
            return [];
        }

        let recipes = [];

        for(let recipeId in gameData.recipesData)
        {
            // How src/Worker.js itself decides a recipe is an alternative.
            if(recipeId.indexOf('_Alternative') === -1)
            {
                continue;
            }

            let recipe   = gameData.recipesData[recipeId];
            let produced = Object.keys(recipe.produce || {}).map(function(className){
                for(let itemId in gameData.itemsData)
                {
                    if(gameData.itemsData[itemId].className === className)
                    {
                        return gameData.itemsData[itemId].name;
                    }
                }

                return className;
            });

            recipes.push({
                id      : recipeId,
                name    : recipe.name || recipeId,
                produces: produced.join(', ')
            });
        }

        return recipes.sort(function(a, b){ return a.name.localeCompare(b.name); });
    }, [gameData]);

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

                    {altRecipes.length > 0 && (
                        <section className="panel">
                            <div className="panelHead">
                                <h2>Alternative recipes</h2>
                                <button type="button" className="button small ghost" onClick={function(){ setShowAlts(showAltRecipes === false); }}>
                                    {showAltRecipes === true ? 'Hide' : (state.altRecipes.length > 0 ? state.altRecipes.length + ' selected' : 'Show')}
                                </button>
                            </div>

                            {showAltRecipes === true && (
                                <ul className="checkList">
                                    {altRecipes.map(function(recipe){
                                        return (
                                            <li key={recipe.id}>
                                                <label>
                                                    <input
                                                        type="checkbox"
                                                        checked={state.altRecipes.includes(recipe.id)}
                                                        onChange={function(){ toggleAltRecipe(recipe.id); }}
                                                    />
                                                    <span>
                                                        {recipe.name}
                                                        {recipe.produces !== '' && <small className="muted"> &rarr; {recipe.produces}</small>}
                                                    </span>
                                                </label>
                                            </li>
                                        );
                                    })}
                                </ul>
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

                        <div className="tabPane" hidden={tab !== 'graph'}>
                            <ProductionGraph
                                nodes={graph.nodes}
                                edges={graph.edges}
                                direction={graph.direction}
                                onLayoutDone={function(){ setBusy(false); }}
                            />
                        </div>

                        <div className="tabPane scrollPane" hidden={tab !== 'tree'}>
                            <div ref={treeRef} className="workerHtml" dangerouslySetInnerHTML={{__html: treeHtml}} />
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
