/**
 * The markup for the three list panes, built from what the worker posts.
 *
 * src/Worker.js used to build these strings itself. That made every run ship
 * megabytes of HTML across the worker boundary - 27 MB for a 6000/min order,
 * because the production tree is a DAG and flattening it into nested markup
 * repeats a shared sub-tree once per path that reaches it. The worker now
 * posts the data, which stays a DAG, and this is the only place that knows
 * what any of it looks like.
 *
 * The markup is still the one dyson-calculator.com rendered, Bootstrap classes
 * and all, down to the missing space in the root item's `<a href="..."style`.
 * The differential test pins it byte for byte against the reference worker's
 * output, so it cannot be tidied up here without failing there first.
 */

// Intl.NumberFormat construction is expensive and these lists format thousands
// of values, so keep one formatter per locale around, like the worker did.
let formatters = new Map();

function formatterFor(locale)
{
    let formatter = formatters.get(locale);

        if(formatter === undefined)
        {
            formatter = new Intl.NumberFormat(locale);
            formatters.set(locale, formatter);
        }

    return formatter;
}

const NOTHING_REQUESTED = '<p class="p-3 text-center">Please select at least one item in the production list.</p>';

/**
 * The production tree. `branches` maps a node id to the child blocks under it,
 * so a sub-tree several parents share is stored once and expanded here.
 */
export function renderTreeList(payload)
{
    let format = formatterFor(payload.locale);
    let html   = [];

    if(payload.roots.length === 0)
    {
        html.push(NOTHING_REQUESTED);
    }
    else
    {
        // One cache for the whole render, so the roots share their sub-trees
        let cache = new Map();

        html.push('<div class="row">');

        for(let r = 0; r < payload.roots.length; r++)
        {
            let root = payload.roots[r];

            html.push('<div class="col-sm-6">');
                html.push('<div class="p-3">');
                    html.push('<div class="hierarchyTree">');
                        html.push('<div class="root">');
                            html.push('<div class="child">');
                                html.push('<img src="' + root.image + '" style="width: 40px;" class="mr-3" />');
                                html.push(format.format(root.qty) + 'x ');
                                html.push('<a href="' + root.url + '"style="line-height: 40px;">' + root.name + '</a>');

                                for(let k = 0; k < root.nodeIds.length; k++)
                                {
                                    html.push(renderBranch(payload.branches, root.nodeIds[k], format, cache));
                                }

                            html.push('</div>');
                        html.push('</div>');
                    html.push('</div>');
                html.push('</div>');
            html.push('</div>');
        }

        html.push('</div>');
    }

    return html.join('');
}

function renderBranch(branches, parentId, format, cache)
{
    let cachedHtml = cache.get(parentId);
        if(cachedHtml !== undefined)
        {
            return cachedHtml;
        }

        // Also guards against a cycle sending the recursion infinite
        cache.set(parentId, '');

    let children = branches[parentId];
    let html     = [];

    if(children !== undefined)
    {
        html.push('<div class="parent">');

        for(let i = 0; i < children.length; i++)
        {
            let child = children[i];

                html.push('<div class="child">');

                    html.push('<div class="media">');

                    if(child.kind === 'item')
                    {
                        html.push('<img src="' + child.image + '" alt="' + child.name + '" style="width: 40px;" class="mr-3" />');

                        html.push('<div class="media-body">');
                            html.push(format.format(child.qty) + 'x ');
                            html.push('<a href="' + child.url + '" style="line-height: 40px;">' + child.name + '</a>');
                        html.push('</div>');
                    }
                    else
                    {
                        html.push('<img src="' + child.image + '" alt="' + child.name + '" style="width: 40px;" class="mr-3 collapseChildren" />');

                        html.push('<div class="media-body">');
                            html.push('<a href="' + child.url + '">' + child.name + '</a>');

                            if(child.performance !== undefined)
                            {
                                html.push(' <em style="color: ' + child.performanceColor + '">(' + child.performance + '%)</em>');
                            }

                            html.push('<br />');
                            html.push('<small>' + child.label + '</small>');
                        html.push('</div>');
                    }

                    html.push('</div>');

                    // Absent on by-products, which the worker does not walk into
                    if(child.id !== undefined)
                    {
                        html.push(renderBranch(branches, child.id, format, cache));
                    }

                html.push('</div>');
        }

        html.push('</div>');
    }

    let renderedHtml = html.join('');
        cache.set(parentId, renderedHtml);

    return renderedHtml;
}

/**
 * Everything the plan consumes per minute.
 */
export function renderItemsList(payload)
{
    let format = formatterFor(payload.locale);
    let html   = [];

    if(payload.items.length === 0)
    {
        html.push(NOTHING_REQUESTED);
    }
    else
    {
        html.push('<table class="table table-striped mb-0">');

        html.push('<thead>');
            html.push('<tr>');
                html.push('<th></th>');
                html.push('<th>Needed per minute</th>');
            html.push('</tr>');
        html.push('</thead>');

        html.push('<tbody>');

        for(let i = 0; i < payload.items.length; i++)
        {
            let item = payload.items[i];

            html.push('<tr>');
                html.push('<td width="40"><img src="' + item.image + '" style="width: 40px;" /></td>');
                html.push('<td class="align-middle">');
                    html.push(format.format(item.qty) + ' units/min of ');
                    html.push('<a href="' + item.url + '">' + item.name + '</a>');
               html.push('</td>');
            html.push('</tr>');
        }

        html.push('</tbody>');
        html.push('</table>');
    }

    return html.join('');
}

/**
 * Every building the plan needs, what each one costs to build, and the total
 * bill of materials underneath.
 */
export function renderBuildingsList(payload)
{
    let format = formatterFor(payload.locale);
    let html   = [];

    if(payload.buildings.length === 0)
    {
        html.push(NOTHING_REQUESTED);
    }
    else
    {
        html.push('<table class="table table-striped mb-0">');

        for(let i = 0; i < payload.buildings.length; i++)
        {
            let building = payload.buildings[i];

            html.push('<tr>');
            html.push('<td width="40" class="align-middle"><img src="' + building.image + '" style="width: 40px;" /></td>');

            html.push('<td class="align-middle">');
                html.push(format.format(building.count) + 'x ');
                html.push('<a href="' + building.url + '">' + building.name + '</a>');
            html.push('</td>');

            html.push('<td class="align-middle">');

                let toJoin = [];

                for(let j = 0; j < building.recipe.length; j++)
                {
                    let ingredient = building.recipe[j];
                    let temp       = [];
                        temp.push(format.format(ingredient.qty) + 'x ');
                        temp.push('<img src="' + ingredient.image + '" title="' + ingredient.name + '" style="width: 24px;" />');

                    toJoin.push(temp.join(''));
                }

                html.push(toJoin.join(', '));

            html.push('</td>');

            html.push('</tr>');
        }

        html.push('<tr>');
        html.push('<td></td>');
        html.push('<td><strong>Total:</strong></td>');
        html.push('<td class="p-0"><ul class="list-group list-group-flush">');

            for(let i = 0; i < payload.totals.length; i++)
            {
                let total = payload.totals[i];

                html.push('<li class="list-group-item">');

                html.push(format.format(total.qty) + 'x ');

                if(total.name !== undefined)
                {
                    html.push('<img src="' + total.image + '" title="' + total.name + '" style="width: 24px;" /> ');
                    html.push('<a href="' + total.url + '">' + total.name + '</a>');
                }
                else
                {
                    html.push(total.id);
                }

                html.push('</li>');
            }

        html.push('</ul></td>');
        html.push('</tr>');

        html.push('</table>');
    }

    return html.join('');
}
