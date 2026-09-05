/**
 * Placeholder icons for the bundled sample dataset, which has no artwork of
 * its own. Real game data carries its own image URLs and never hits this.
 */
export function GET(request)
{
    let params  = new URL(request.url).searchParams;
    let label   = (params.get('label') || '?').slice(0, 3).toUpperCase();
    let color   = /^#[0-9a-fA-F]{6}$/.test(params.get('color') || '') ? params.get('color') : '#5a6b7a';

    let svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img" aria-label="' + escapeXml(label) + '">'
            + '<rect width="64" height="64" rx="10" fill="' + color + '"/>'
            + '<rect x="1.5" y="1.5" width="61" height="61" rx="9" fill="none" stroke="rgba(255,255,255,.35)" stroke-width="3"/>'
            + '<text x="32" y="41" text-anchor="middle" font-family="system-ui, sans-serif" font-size="24" font-weight="700" fill="#fff">' + escapeXml(label) + '</text>'
            + '</svg>';

    return new Response(svg, {
        headers : {
            'content-type'  : 'image/svg+xml; charset=utf-8',
            'cache-control' : 'public, max-age=31536000, immutable'
        }
    });
}

function escapeXml(value)
{
    return value.replace(/[<>&"']/g, function(character){
        return {'<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;'}[character];
    });
}
