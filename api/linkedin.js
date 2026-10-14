import { linkedinObservations, savePost } from '../lib/linkedin.js';
import { normalizeInput } from '../url-utils.js';
export const config={maxDuration:60};
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  if(req.method==='POST'){const body=typeof req.body==='string'?JSON.parse(req.body):req.body;return res.status(200).json({post:await savePost(body?.articleUrl,body?.postUrl)});}
  if(req.method==='GET')return res.status(200).json(await linkedinObservations(normalizeInput(req.query.url)));
  return res.status(405).json({error:'Use GET or POST.'});
 }catch(e){return res.status(400).json({error:e.message});}
}
