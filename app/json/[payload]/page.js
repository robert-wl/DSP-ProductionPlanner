import Planner from '../../../components/Planner.jsx';
import {parsePayload} from '../../../lib/plannerState.js';

/**
 * Share URLs. src/Worker.js posts the state it was run with as a plain object,
 * and the upstream page pushed it as /json/<encoded JSON> - keeping that shape
 * means links made by the original planner still open here.
 */
export default async function Page({params})
{
    let {payload} = await params;

    return <Planner initialPayload={parsePayload(payload)} />;
}
