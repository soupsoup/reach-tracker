import { createHash } from 'node:crypto';
import { normalizeInput, articleKey } from '../url-utils.js';
export const normalizeUrl = normalizeInput;
export const canonical = articleKey;
export function articleFromUrl(input) {
  const url = normalizeUrl(input), parsed = new URL(url);
  return { id: 'url-' + createHash('sha256').update(canonical(url)).digest('hex').slice(0,24), url,
    title: url, publisher: parsed.hostname.replace(/^www\./,''), published: null, sources: [], addedAt: new Date().toISOString() };
}
export function linked(post, target) {
  const record = post.record || {}, urls = [record.embed?.external?.uri, record.embed?.media?.external?.uri];
  for (const facet of record.facets || []) for (const feature of facet.features || []) urls.push(feature.uri);
  return urls.some(url => url && canonical(normalizeLink(url)) === canonical(normalizeLink(target)));
}
function normalizeLink(url) { try {return normalizeUrl(url);}catch{return url;} }
export async function jsonFetch(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'reach-tracker/1.0' } });
  if (!response.ok) throw new Error('Source returned HTTP ' + response.status);
  return response.json();
}
export async function collectPublic(article) {
  const now = new Date().toISOString(), social = [], coverage = [];
  const endpoints = [
    {platform:'Bluesky', api: 'https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?' + new URLSearchParams({q:article.url,limit:'100',sort:'latest'}), parse: data => (data.posts || []).filter(p=>linked(p,article.url)).map(p=>({id:p.uri,platform:'Bluesky',url:`https://bsky.app/profile/${p.author.handle}/post/${p.uri.split('/').pop()}`,author:p.author.handle,likes:p.likeCount??null,reposts:p.repostCount??null,comments:p.replyCount??null,followers:null,observedAt:now}))},
    {platform:'Hacker News', api:'https://hn.algolia.com/api/v1/search?' + new URLSearchParams({query:article.url,restrictSearchableAttributes:'url',hitsPerPage:'100'}), parse:data=>(data.hits||[]).filter(p=>canonical(normalizeLink(p.url||''))===canonical(article.url)).map(p=>({id:'hn-'+p.objectID,platform:'Hacker News',url:'https://news.ycombinator.com/item?id='+p.objectID,author:p.author,likes:p.points??null,reposts:null,comments:p.num_comments??null,followers:null,observedAt:now}))}
  ];
  await Promise.all(endpoints.map(async source=>{try { social.push(...source.parse(await jsonFetch(source.api)));coverage.push({platform:source.platform,status:'ok',detail:'Exact article links in up to 100 public results; partial coverage.',api:source.api});}catch(e){coverage.push({platform:source.platform,status:'unavailable',detail:e.message});}}));
  for (const platform of ['X','LinkedIn','Facebook','Reddit']) coverage.push({platform,status:'unavailable',detail:'No reliable collector configured. Missing results do not mean zero.'});
  coverage.push({platform:'Publisher readership',status:'private',detail:'Pageviews, unique readers and impressions are private. No audience estimate is calculated.'});
  coverage.push({platform:'Media and syndication',status:'unavailable',detail:'No verified source pages registered for this URL yet. Social collection does not provide comprehensive media discovery.'});
  const obs = {id:article.id,sources:article.sources,social,coverage};
  return {articles:[article],snapshot:{schemaVersion:1,collectedAt:now,articles:[obs]},history:[],mode:'live'};
}
