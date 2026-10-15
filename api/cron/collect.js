import { timingSafeEqual } from 'node:crypto';
export const config = { maxDuration: 60 };
const repo = 'soupsoup/reach-tracker';
export function slotStart(now) {
  const time = new Date(now);
  time.setUTCSeconds(0, 0);
  const minute = time.getUTCMinutes();
  if (minute >= 47) time.setUTCMinutes(47);
  else if (minute >= 17) time.setUTCMinutes(17);
  else { time.setUTCHours(time.getUTCHours()-1); time.setUTCMinutes(47); }
  return time;
}
export function decision(runs, now) {
  // Never overlap another collection, including manually dispatched runs.
  if (runs.some(r => r.status !== 'completed')) return 'running';
  const current = runs.filter(r => new Date(r.created_at) >= slotStart(now));
  if (current.some(r => r.conclusion === 'success')) return 'complete';
  if (current.length >= 3) return 'retry-limit';
  return 'dispatch';
}
export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({error:'Use GET.'});
  const expected = Buffer.from('Bearer ' + (process.env.CRON_SECRET || ''));
  const actual = Buffer.from(req.headers.authorization || '');
  if (!process.env.CRON_SECRET || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return res.status(401).json({error:'Unauthorized.'});
  const token = process.env.REACH_GITHUB_TOKEN;
  if (!token) return res.status(503).json({error:'Scheduler requires REACH_GITHUB_TOKEN.'});
  const headers = {Authorization:'Bearer '+token, Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'reach-tracker-scheduler'};
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/collect.yml/runs?branch=main&per_page=30`, {headers, signal:AbortSignal.timeout(15000)});
    if (!response.ok) throw Error('GitHub run lookup returned HTTP '+response.status);
    const {workflow_runs:runs} = await response.json();
    const state = decision(runs, new Date());
    if (state !== 'dispatch') return res.status(state==='retry-limit'?503:200).json({state});
    const dispatch = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/collect.yml/dispatches`, {method:'POST', headers:{...headers,'Content-Type':'application/json'}, body:JSON.stringify({ref:'main'}),signal:AbortSignal.timeout(15000)});
    if (dispatch.status !== 204) throw Error('GitHub dispatch returned HTTP '+dispatch.status);
    return res.status(200).json({state:'dispatched',slot:slotStart(new Date()).toISOString()});
  } catch (error) {
    // Never return credential-bearing request objects or response bodies.
    return res.status(502).json({error:error.message.startsWith('GitHub ')?error.message:'Scheduler request failed.'});
  }
}
