/**
 * The build order: the plan as a list of things to go and place, in the order
 * you can place them.
 *
 * The layout tab answers "what does the finished factory look like" and the
 * items and buildings tabs answer "what does it add up to". None of those is
 * the question you have in front of you when you start building, which is how
 * many miners to drop on the patch before anything else can happen. So this
 * reads the plan the way the belts run - ore first, requested item last - and
 * collapses identical machines into one row with a count, because that count
 * is the thing you act on.
 *
 * The worker does the staging; this is only the presentation.
 */

const NUMBER_FORMATS = new Map();

function formatNumber(value, locale)
{
    let formatter = NUMBER_FORMATS.get(locale);

        if(formatter === undefined)
        {
            formatter = new Intl.NumberFormat(locale, {maximumFractionDigits: 1});
            NUMBER_FORMATS.set(locale, formatter);
        }

    return formatter.format(value);
}

/** Quantities below a tenth would all render as "0/min", which reads as none. */
function formatRate(value, locale)
{
    if(value > 0 && value < 0.1)
    {
        return '< 0.1';
    }

    return formatNumber(Math.round(value * 10) / 10, locale);
}

export default function BuildOrder({data})
{
    if(data === null)
    {
        return null;
    }

    if(data.stages.length === 0)
    {
        return <p className="buildOrderEmpty muted">Please select at least one item in the production list.</p>;
    }

    let locale = data.locale || 'en';

    return (
        <div className="buildOrder">
            <ol className="buildStages">
                {data.stages.map(function(stage, index){
                    return <Stage key={index} stage={stage} index={index} locale={locale} />;
                })}
            </ol>

            <Goal outputs={data.outputs} locale={locale} />
        </div>
    );
}

/**
 * One stage: everything whose inputs the stages above it have already made, so
 * the whole stage can go down before anything below it is needed.
 */
function Stage({stage, index, locale})
{
    let machines = 0;
    let power    = 0;

    for(let i = 0; i < stage.groups.length; i++)
    {
        if(stage.groups[i].kind === 'machine')
        {
            machines += stage.groups[i].count;
            power    += stage.groups[i].power;
        }
    }

    return (
        <li className="buildStage">
            <div className="buildStageHead">
                <span className="buildStageNumber">{index + 1}</span>
                <h3>Stage {index + 1}</h3>
                <span className="buildStageSummary muted">
                    {machines > 0 && formatNumber(Math.round(machines * 10) / 10, locale) + (machines === 1 ? ' machine' : ' machines')}
                    {machines > 0 && power > 0 && ' · '}
                    {power > 0 && formatNumber(Math.round(power * 10) / 10, locale) + ' MW'}
                </span>
            </div>

            <ul className="buildGroups">
                {stage.groups.map(function(group, groupIndex){
                    return group.kind === 'machine'
                         ? <MachineGroup key={groupIndex} group={group} locale={locale} />
                         : <ItemGroup key={groupIndex} group={group} locale={locale} />;
                })}
            </ul>
        </li>
    );
}

/** A row you act on: this many of this machine, on this recipe. */
function MachineGroup({group, locale})
{
    return (
        <li className="buildGroup">
            <img className="buildGroupIcon" src={group.image} alt="" />

            <div className="buildGroupBody">
                <p className="buildGroupTitle">
                    <strong className="buildCount">{formatNumber(group.count, locale)}&times;</strong>
                    <a href={group.url} target="_blank" rel="noreferrer">{group.name}</a>
                    <span className="muted"> making </span>
                    <a href={group.produces.url} target="_blank" rel="noreferrer">{group.produces.name}</a>
                </p>

                <p className="buildGroupRate">
                    {formatRate(group.qty, locale)} <span className="muted">/min</span>
                    {group.power > 0 && <span className="muted"> &middot; {formatNumber(Math.round(group.power * 10) / 10, locale)} MW</span>}
                    <Performance group={group} locale={locale} />
                </p>

                <Inputs inputs={group.inputs} locale={locale} />
            </div>
        </li>
    );
}

/**
 * An item arriving from outside the plan: one you said you already produce, or
 * one recovered as a by-product further up. Nothing to place, but it has to be
 * on the belt before the stage below it can run.
 */
function ItemGroup({group, locale})
{
    return (
        <li className="buildGroup supply">
            <img className="buildGroupIcon" src={group.image} alt="" />

            <div className="buildGroupBody">
                <p className="buildGroupTitle">
                    <span className="buildTag">{group.kind === 'supplied' ? 'Already have' : 'By-product'}</span>
                    <a href={group.url} target="_blank" rel="noreferrer">{group.name}</a>
                </p>

                <p className="buildGroupRate">
                    {formatRate(group.qty, locale)} <span className="muted">/min needs to arrive here</span>
                </p>
            </div>
        </li>
    );
}

/**
 * How much of the group is actually working.
 *
 * A machine at 40% is still a machine you place, so the count stays whole and
 * the shortfall is said out loud instead - otherwise a stage of forty-seven
 * smelters reads as forty-seven smelters' worth of throughput, which it is not.
 */
function Performance({group, locale})
{
    if(group.partial.length === 0)
    {
        return null;
    }

    let short = group.partial.map(function(bucket){
        return formatNumber(bucket.count, locale) + ' at ' + bucket.performance + '%';
    });

    return (
        <span className="buildPerformance" title={group.full + ' running flat out, ' + short.join(', ')}>
            {group.full > 0 && <span className="muted">{formatNumber(group.full, locale)} full, </span>}
            {short.join(', ')}
        </span>
    );
}

/** What has to be belted in for the row to run, per minute. */
function Inputs({inputs, locale})
{
    if(inputs.length === 0)
    {
        return null;
    }

    return (
        <p className="buildInputs">
            <span className="muted">needs</span>
            {inputs.map(function(input){
                return (
                    <span className="buildInput" key={input.itemId} title={input.name}>
                        <img src={input.image} alt="" />
                        {formatRate(input.qty, locale)} {input.name}
                    </span>
                );
            })}
        </p>
    );
}

/** What the whole thing was for. */
function Goal({outputs, locale})
{
    if(outputs.length === 0)
    {
        return null;
    }

    return (
        <div className="buildGoal">
            <span className="buildGoalLabel muted">You end up with</span>

            <ul className="buildGoalItems">
                {outputs.map(function(output){
                    return (
                        <li key={output.itemId}>
                            <img src={output.image} alt="" />
                            <strong>{formatRate(output.qty, locale)}</strong>
                            <span className="muted">/min</span>
                            <a href={output.url} target="_blank" rel="noreferrer">{output.name}</a>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
