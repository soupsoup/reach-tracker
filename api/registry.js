import { registrations } from '../lib/registry.js';
export default async function handler(req,res) {
  if(req.method!=='GET')return res.status(405).json({error:'Use GET.'});
  res.setHeader('Cache-Control','no-store');
  try {return res.status(200).json({articles:await registrations()});}
  catch {return res.status(503).json({error:'Saved article registry is temporarily unavailable.'});}
}
