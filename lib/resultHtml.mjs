/**
 * The markup for the items and buildings panes, built from what the worker
 * posts.
 *
 * src/Worker.js used to build these strings itself. That made every run ship
 * megabytes of HTML across the worker boundary - 27 MB for a 6000/min order,
 * because the production tree is a DAG and flattening it into nested markup
 * repeats a shared sub-tree once per path that reaches it. The worker now
 * posts the data, which stays a DAG, and this is the only place that knows
 * what any of it looks like.
 *
 * The markup is still the one dyson-calculator.com rendered, Bootstrap classes
 * and all. The differential test pins it byte for byte against the reference
 * worker's output, so it cannot be tidied up here without failing there first.
 *
 * The production tree pane used to be built here too. It is components/
 * BuildOrder.jsx now - a rewrite rather than a port, so there is no upstream
 * markup left to match.
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
