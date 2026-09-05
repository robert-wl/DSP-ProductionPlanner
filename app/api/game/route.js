import gameData from '../../../lib/gameData.json';

/**
 * Serves the buildings / items / recipes tables the planner runs on.
 *
 * The data is bundled (lib/gameData.json), so the app has no runtime
 * dependency on anything external and works on a fresh deploy with no
 * configuration. Set GAME_DATA_URL to pull a newer table from the upstream API
 * instead; if that fetch fails the bundled copy still answers.
 *
 * It is served from a route handler rather than imported into the page so the
 * ~100KB of JSON is fetched once and cached, instead of riding along in the
 * client bundle on every load.
 */

// Item and building "image"/"url" come back as site-relative paths
// ("/img/gameUI/iron-ore.png"), which the upstream page could use directly
// because it was served from that same origin. Here they need an origin.
const DEFAULT_ASSET_BASE_URL = 'https://www.dyson-calculator.com';

const CACHE_SECONDS = 3600;

function assetBase()
{
    return (process.env.ASSET_BASE_URL || DEFAULT_ASSET_BASE_URL).replace(/\/+$/, '');
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
 * Resolves the site-relative paths against the asset origin. Anything already
 * absolute (or a data: URI) is left alone, so a feed that returns full URLs
 * keeps working.
 */
function resolveAssets(table, base)
{
    for(let key in table)
    {
        let entry = table[key];

        for(let field of ['image', 'url'])
        {
            let value = entry[field];

                if(typeof value === 'string' && value.startsWith('/') === true && value.startsWith('//') === false)
                {
                    entry[field] = base + value;
                }
        }
    }

    return table;
}

function payloadFrom(data, source, note)
{
    let base = assetBase();

    return {
        source          : source,
        note            : note,
        branch          : data.branch,
        assetBaseUrl    : base,
        buildingsData   : resolveAssets(data.buildingsData, base),
        itemsData       : resolveAssets(data.itemsData, base),
        recipesData     : data.recipesData
    };
}

async function fetchUpstream(url)
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

    return data;
}

export async function GET(request)
{
    let language = new URL(request.url).searchParams.get('lang') || 'en';
        // Goes into an upstream URL path: keep it to a plain language code.
        if(/^[a-z]{2}(-[A-Za-z]{2})?$/.test(language) === false)
        {
            language = 'en';
        }

    let upstream = process.env.GAME_DATA_URL;
    let headers  = {'cache-control': 'public, s-maxage=' + CACHE_SECONDS + ', stale-while-revalidate=86400'};

    if(upstream !== undefined && upstream !== '')
    {
        let url = upstream.replace(/\{lang\}/g, language);

        try
        {
            return Response.json(payloadFrom(await fetchUpstream(url), 'upstream', url), {headers: headers});
        }
        catch(error)
        {
            let reason = error instanceof Error ? error.message : String(error);
                console.error('GAME_DATA_URL fetch failed for ' + url + ':', reason);

            return Response.json(
                payloadFrom(structuredClone(gameData), 'bundled', 'GAME_DATA_URL (' + url + ') failed: ' + reason),
                {headers: {'cache-control': 'no-store'}}
            );
        }
    }

    return Response.json(payloadFrom(structuredClone(gameData), 'bundled', null), {headers: headers});
}
