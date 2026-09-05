/**
 * A neutral placeholder icon, used in place of an item or building image that
 * fails to load - the artwork lives on the upstream site, so a wrong or
 * unreachable ASSET_BASE_URL should degrade to something shaped like an icon
 * rather than a broken-image glyph.
 */
export function GET()
{
    let svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="">'
            + '<rect width="64" height="64" rx="10" fill="#202c38"/>'
            + '<rect x="1.5" y="1.5" width="61" height="61" rx="9" fill="none" stroke="#33465a" stroke-width="3"/>'
            + '<path d="M32 17 47 25.5v17L32 51l-15-8.5v-17z" fill="none" stroke="#5a708c" stroke-width="3" stroke-linejoin="round"/>'
            + '</svg>';

    return new Response(svg, {
        headers : {
            'content-type'  : 'image/svg+xml; charset=utf-8',
            'cache-control' : 'public, max-age=31536000, immutable'
        }
    });
}
