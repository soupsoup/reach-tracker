import { articleFromUrl, collectPublic } from '../lib/articles.js';
export default async function handler(req,res) {
  if(req.method!=='GET')return res.status(405).json({error:'Use GET.'});
  try {const article=articleFromUrl(req.query.url);res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=60');return res.status(200).json(await collectPublic(article));}
  catch(e){return res.status(400).json({error:e.message});}
}
