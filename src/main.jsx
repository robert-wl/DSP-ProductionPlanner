import {StrictMode, useEffect, useState} from 'react';
import {createRoot} from 'react-dom/client';

import Planner from '../components/Planner.jsx';
import {parsePayload} from '../lib/plannerState.js';

import './globals.css';

/**
 * Two routes, and no router.
 *
 *   /                       the planner, empty
 *   /json/<encoded state>   the planner, restored from a share link
 *
 * The planner pushes its own URLs as the state changes (see Planner.jsx), so
 * all this has to do is read the path on the way in and follow the back
 * button. `key` remounts the planner when the payload changes, which is what
 * a real router would do and what Planner expects: it only reads
 * `initialPayload` on mount.
 */
function payloadFromPath(pathname)
{
    let match = pathname.match(/^\/json\/(.+)$/);

    return match === null ? null : parsePayload(match[1]);
}

function App()
{
    let [route, setRoute] = useState(function(){
        return {path: window.location.pathname, payload: payloadFromPath(window.location.pathname)};
    });

    useEffect(function(){
        function onPopState()
        {
            setRoute({path: window.location.pathname, payload: payloadFromPath(window.location.pathname)});
        }

        window.addEventListener('popstate', onPopState);

        return function(){ window.removeEventListener('popstate', onPopState); };
    }, []);

    return <Planner key={route.path} initialPayload={route.payload} />;
}

createRoot(document.getElementById('root')).render(
    <StrictMode>
        <App />
    </StrictMode>
);
