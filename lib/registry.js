import { list, put } from '@vercel/blob';
import { articleFromUrl } from './articles.js';
export async function registrations() {
  const result = await list({prefix:'articles/',limit:101});
  const articles = await Promise.all(result.blobs.slice(0,100).map(async blob=>{
    const response = await fetch(blob.url,{cache:'no-store',signal:AbortSignal.timeout(10000)});
    if (!response.ok) throw new Error('Saved article could not be read.');
    return response.json();
  }));
  return articles;
}
export async function register(input) {
  const article = articleFromUrl(input);
  const path = 'articles/'+article.id+'.json';
  const existing = await list({prefix:path,limit:1});
  if(existing.blobs.some(b=>b.pathname===path)) return article;
  const capacity = await list({prefix:'articles/',limit:101});
  if (capacity.blobs.length>=100) throw new Error('The tracker currently supports 100 saved URLs. Contact the owner to expand capacity.');
  try { await put(path, JSON.stringify(article), {access:'public',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json',cacheControlMaxAge:60}); }
  catch(e){ if(!String(e.message).includes('already exists')) throw e; }
  return article;
}
