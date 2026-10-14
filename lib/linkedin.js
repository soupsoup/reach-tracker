import { createHash } from 'node:crypto';
import { list, put } from '@vercel/blob';
import { normalizeInput, articleKey } from '../url-utils.js';
export function postUrl(input){
 const u=new URL(normalizeInput(input));
 if(u.protocol!=='https:' || !/^(www\.)?linkedin\.com$/.test(u.hostname) || u.port || !(/^\/posts\/[\w-]+/.test(u.pathname)||/^\/feed\/update\/urn:li:activity:\d+\/?$/.test(u.pathname)))throw Error('Paste a full LinkedIn post URL from linkedin.com/posts/ or linkedin.com/feed/update/.');
 u.hostname='www.linkedin.com';u.search='';u.hash='';return u.href;
}
const digest=value=>createHash('sha256').update(value).digest('hex').slice(0,24);
const prefix=url=>'linkedin/'+digest(articleKey(normalizeInput(url)))+'/';
export async function savePost(articleUrl,input){
 const article=normalizeInput(articleUrl),url=postUrl(input),path=prefix(article)+digest(url)+'.json';
 const exists=await list({prefix:path,limit:1});if(exists.blobs.length)return {url,status:'submitted'};
 const current=await list({prefix:prefix(article),limit:21});if(current.blobs.length>=20)throw Error('Up to 20 LinkedIn post URLs can be saved per article.');
 const record={url,articleUrl:article,status:'submitted',submittedAt:new Date().toISOString(),discovery:'User-submitted'};
 try{await put(path,JSON.stringify(record),{access:'public',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json',cacheControlMaxAge:60});}catch(e){if(!String(e.message).includes('already exists'))throw e;}
 return record;
}
function identity(url){try{const u=new URL(url);return u.pathname.match(/activity[:-](\d+)/)?.[1]||u.pathname.replace(/\/$/,'');}catch{return '';}}
function samePost(a,b){return identity(a)&&identity(a)===identity(b);}
function objects(value){if(Array.isArray(value))return value.flatMap(objects);if(value&&typeof value==='object')return [value,...Object.values(value).flatMap(objects)];return [];}
// Counters are read only from the requested post's own structured data, never related posts or profile totals.
export function parsePost(body,article,source){
 const scripts=[...body.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
 const entries=scripts.flatMap(m=>{try{return objects(JSON.parse(m[1]));}catch{return [];}});
 const post=entries.find(v=>([].concat(v['@type']||[]).includes('SocialMediaPosting'))&&samePost(typeof v.mainEntityOfPage==='string'?v.mainEntityOfPage:v.mainEntityOfPage?.['@id']||v.url||v['@id'],source));
 if(!post)return {status:'candidate',detail:'The requested post’s public structured data could not be identified.'};
 const shared=[].concat(post.sharedContent||[]).map(v=>typeof v==='string'?v:v.url||v['@id']);
 const bodyUrls=(post.articleBody||'').match(/https?:\/\/[^\s<>"']+/g)||[];
 const verified=[...shared,...bodyUrls].some(url=>articleKey(url)===articleKey(article));
 if(!verified)return {status:'candidate',detail:'Exact article URL not confirmed in this post. Shortened links and inaccessible attachments remain unverified.'};
 const metrics={likes:null,comments:null,reposts:null};
 for(const stat of [].concat(post.interactionStatistic||[])){
  const type=typeof stat.interactionType==='string'?stat.interactionType:stat.interactionType?.['@type'];
  const key={LikeAction:'likes',CommentAction:'comments',ShareAction:'reposts'}[(typeof type==='string'?type:'').split('/').pop()];
  const number=stat.userInteractionCount;
  if(key&&Number.isSafeInteger(number)&&number>=0)metrics[key]=number;
 }
 return {status:'verified',detail:'Exact article URL confirmed in the requested post’s public structured data.',author:typeof post.author==='object'?post.author.name:null,...metrics};
}
export async function linkedinObservations(article){
 const result=await list({prefix:prefix(article),limit:20});
 const submissions=await Promise.all(result.blobs.map(async b=>{const r=await fetch(b.url,{signal:AbortSignal.timeout(5000)});if(!r.ok)throw Error('Saved post unavailable');return r.json();}));
 const now=new Date().toISOString();
 const observations=await Promise.all(submissions.map(async record=>{
  const source=postUrl(record.url);let check;
  try{const r=await fetch(source,{redirect:'manual',signal:AbortSignal.timeout(5000),headers:{'User-Agent':'reach-tracker/1.0 (public post verification)'}});
   if(!r.ok)throw Error('Public post returned HTTP '+r.status);
   const length=Number(r.headers.get('content-length'));if(length>2000000)throw Error('Public page is too large to verify.');
   const reader=r.body.getReader();let size=0,parts=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2000000){await reader.cancel();throw Error('Public page is too large to verify.');}parts.push(value);}const body=Buffer.concat(parts).toString('utf8');check=parsePost(body,article,source);
  }catch(e){check={status:'candidate',detail:e.message};}
  return {...record,...check,observedAt:now};
 }));
 const social=observations.filter(p=>p.status==='verified').map(p=>({id:'linkedin-'+digest(p.url),platform:'LinkedIn',url:p.url,author:p.author||'LinkedIn post',likes:p.likes,comments:p.comments,reposts:p.reposts,followers:null,observedAt:now,verification:p.detail}));
 return {social,candidates:observations.filter(p=>p.status!=='verified'),coverage:{platform:'LinkedIn',status:submissions.length?'partial':'limited',detail:'Observed LinkedIn shares only. Saved public post URLs are checked against the exact article. Unverified candidates are excluded from counts; network-wide shares and inaccessible engagement remain unavailable.'}};
}
