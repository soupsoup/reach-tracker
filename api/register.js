import { register } from '../lib/registry.js';
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Use POST to save an article.'});
  try {const body=typeof req.body==='string'?JSON.parse(req.body):req.body;return res.status(200).json({article:await register(body?.url),scheduled:true});}
  catch(e){return res.status(400).json({error:e.message});}
}
