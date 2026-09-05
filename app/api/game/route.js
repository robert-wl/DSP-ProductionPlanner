import {sampleGameData} from '../../../lib/sampleGameData.js';

/**
 * Serves the buildings / items / recipes tables the planner runs on.
 *
 * src/DSPCPP.js fetched these straight from the upstream site, which only
 * works from a page served by that same origin. Going through a route handler
 * instead keeps the browser same-origin, lets the response be cached, and
 * makes the upstream configurable per deployment.
 *
 * Set GAME_DATA_URL to the endpoint returning {buildingsData, itemsData,
 * recipesData}. "{lang}" in it is replaced with the requested language.
 */

const DEFAULT_GAME_DATA_URL = 'https://dyson-calculator.com/{lang}/api/game';

// Long enough that a burst of planner runs hits one upstream request, short
// enough that a game update lands the same day.
const CACHE_SECONDS = 3600;

function upstreamFor(language)
{
    return (process.env.GAME_DATA_URL || DEFAULT_GAME_DATA_URL).replace(/\{lang\}/g, language);
}

function isUsable(data)
{
    return data !== null
        && typeof data === 'object'
        && data.itemsData     && Object.keys(data.itemsData).length > 0
        && data.recipesData   && Object.keys(data.recipesData).length > 0
        && data.buildingsData && Object.keys(data.buildingsData).length > 0;
}

/**
 * The one normalization src/DSPCPP.js applied before handing the tables to the
 * worker. The worker only reads a recipe's className to sort "_Alternative"
 * recipes last, so this is cosmetic - but it is kept so a payload rendered
 * here matches one rendered by the upstream page.
 */
function normalize(data)
{
    for(let recipeId in data.recipesData)
    {
        let recipe = data.recipesData[recipeId];

            if(recipe.className !== undefined && recipe.className.startsWith('/Game/FactoryGame/') === false)
            {
                recipe.className = '/Game/FactoryGame/Recipes/' + recipe.className;
            }
    }

    return data;
}

export async function GET(request)
{
    let language = new URL(request.url).searchParams.get('lang') || 'en';
        // Path segment of an upstream URL: keep it to a plain language code.
        if(/^[a-z]{2}(-[A-Za-z]{2})?$/.test(language) === false)
        {
            language = 'en';
        }

    let url     = upstreamFor(language);
    let failure = null;

    try
    {
        let response = await fetch(url, {
            headers : {accept: 'application/json'},
            signal  : AbortSignal.timeout(15000),
            next    : {revalidate: CACHE_SECONDS}
        });

        if(response.ok === false)
        {
            throw new Error('upstream responded ' + response.status);
        }

        let data = await response.json();

        if(isUsable(data) === false)
        {
            throw new Error('upstream payload is missing itemsData / recipesData / buildingsData');
        }

        return Response.json(
            {
                source          : 'upstream',
                upstream        : url,
                language        : language,
                buildingsData   : normalize(data).buildingsData,
                itemsData       : data.itemsData,
                recipesData     : data.recipesData
            },
            {headers: {'cache-control': 'public, s-maxage=' + CACHE_SECONDS + ', stale-while-revalidate=86400'}}
        );
    }
    catch(error)
    {
        failure = error instanceof Error ? error.message : String(error);
        console.error('game data fetch failed for ' + url + ':', failure);
    }

    // Still answer with something the planner can run on, flagged so the page
    // can say plainly that this is not the real game data.
    let fallback = normalize(structuredClone(sampleGameData));

    return Response.json(
        {
            source          : 'sample',
            upstream        : url,
            language        : language,
            error           : failure,
            buildingsData   : fallback.buildingsData,
            itemsData       : fallback.itemsData,
            recipesData     : fallback.recipesData
        },
        {headers: {'cache-control': 'no-store'}}
    );
}
