import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { articleFromUrl } from './articles.js';

// Saved registrations live in one of two places:
// - REACH_REGISTRY_DIR set (the VPS, deploy/vps): one JSON file per article
//   in that folder.
// - otherwise (Vercel): the project's Blob store, under articles/.
const DIR = process.env.REACH_REGISTRY_DIR;
const LIMIT = 100;
const FULL = 'The tracker currently supports 100 saved URLs. Contact the owner to expand capacity.';

const blob = () => import('@vercel/blob');

export async function registrations() {
  if (DIR) {
    await mkdir(DIR, { recursive: true });
    const files = (await readdir(DIR)).filter(f => f.endsWith('.json')).sort().slice(0, LIMIT);
    return Promise.all(files.map(async f => JSON.parse(await readFile(join(DIR, f), 'utf8'))));
  }
  const { list } = await blob();
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
  if (DIR) {
    await mkdir(DIR, { recursive: true });
    const names = (await readdir(DIR)).filter(f => f.endsWith('.json'));
    if (names.includes(article.id + '.json')) return article;
    if (names.length >= LIMIT) throw new Error(FULL);
    // 'wx' refuses to overwrite, like allowOverwrite:false on Blob.
    try { await writeFile(join(DIR, article.id + '.json'), JSON.stringify(article), { flag: 'wx' }); }
    catch (e) { if (e.code !== 'EEXIST') throw e; }
    return article;
  }
  const { list, put } = await blob();
  const path = 'articles/'+article.id+'.json';
  const existing = await list({prefix:path,limit:1});
  if(existing.blobs.some(b=>b.pathname===path)) return article;
  const capacity = await list({prefix:'articles/',limit:101});
  if (capacity.blobs.length>=100) throw new Error(FULL);
  try { await put(path, JSON.stringify(article), {access:'public',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json',cacheControlMaxAge:60}); }
  catch(e){ if(!String(e.message).includes('already exists')) throw e; }
  return article;
}
