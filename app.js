import { normalizeInput, articleKey, shareUrl } from './url-utils.js';
let data, selected, activeUrl, loadGeneration=0, linkedinSearchArticle;
const $=id=>document.getElementById(id);
const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
function link(text,url){const n=el('a',text);try{const u=new URL(url);if(u.protocol==='https:'){n.href=u.href;n.target='_blank';n.rel='noopener noreferrer';}}catch{}return n;}
const date=t=>new Date(t).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'});
const score=p=>['likes','comments','reposts'].reduce((s,k)=>s+(Number.isFinite(p[k])?p[k]:0),0);
function count(a){return {social:a.social.length,verified:a.sources.filter(s=>s.status==='verified').length,syndication:a.sources.filter(s=>s.status==='verified'&&s.kind==='syndication').length};}
function render(){
 const article=data.articles.find(a=>a.id===selected),obs=data.snapshot.articles.find(a=>a.id===selected);if(!article||!obs)return;
 $('dashboard').hidden=false;$('publisher').textContent=article.publisher+(article.published?' / '+article.published:'');$('title').textContent=article.title;$('original').href=article.url;$('time').textContent=date(data.snapshot.collectedAt);
 const age=(Date.now()-new Date(data.snapshot.collectedAt))/60000;$('fresh').textContent=data.mode==='live'?'Live social check · scheduled history is pending':age>90?'Collection is stale · '+Math.round(age/60)+' hours old':'Twice-hourly collection · UTC snapshots';
 const c=count(obs);$('cards').replaceChildren();for(const [label,val,note] of [['VERIFIED DISTRIBUTION',c.verified,'Known sources · partial coverage'],['SYNDICATION',c.syndication,'Attributed republications'],['PUBLIC SOCIAL POSTS',c.social,'Exact-link observations only'],['TOTAL READERS','Private','Publisher analytics unavailable']]){const n=el('div',undefined,'card');n.append(el('span',label,'eyebrow'),el('strong',val),el('small',note));$('cards').append(n);}
 $('sources').replaceChildren();for(const s of obs.sources){const f=$('filter').value;if(f!=='all'&&s.status!==f&&s.kind!==f)continue;const n=el('div',undefined,'source'),title=el('div'),body=el('div'),check=el('div',undefined,'check');title.append(el('span',s.status+' / '+s.kind,'badge '+s.status),el('h3',s.name),link('Source page ↗',s.url));body.append(el('p',s.verification));if(s.metrics)body.append(el('p',Object.entries(s.metrics).map(([k,v])=>k+': '+(v??'unavailable')).join(' · ')+' (this platform only)'));check.append(el('div','Verification: '+(s.verifiedAt||'pending')),el('div','Fresh check: '+s.checkStatus),el('div','Direct backlink: '+(s.backlinkVerified?'verified':'not confirmed this check')));if(s.error)check.append(el('p',s.error));n.append(title,body,check);$('sources').append(n);}
 if(!$('sources').children.length)$('sources').append(el('p','No verified media citations or republications registered for this URL yet. This does not establish zero pickup.','empty'));
 $('social').replaceChildren();for(const p of obs.social){const n=el('div',undefined,'post');n.append(link(p.author+' · '+p.platform+' ↗',p.url),el('small',`Likes/points: ${p.likes??'unavailable'} · Reposts: ${p.reposts??'unavailable'} · Comments: ${p.comments??'unavailable'}${p.platform==='X'?' · Quotes: '+(p.quotes??'unavailable'):''}`));$('social').append(n);}if(!obs.social.length)$('social').append(el('p','No exact-link social posts verified in this collection. See platform coverage below; this is not proof of zero shares.','empty'));
 const ranked=[...obs.social].sort((a,b)=>score(b)-score(a)).slice(0,5);$('sharers').replaceChildren();if(!ranked.length)$('sharers').textContent='No individual sharer independently verified. Follower counts and personal prominence are unknown.';else for(const p of ranked)$('sharers').append(link(p.author+' ('+score(p)+' observed interactions) ',p.url));
 const table=el('table'),head=el('tr');
 const localViews=data.history.some(h=>h.articles.find(a=>a.id===selected)?.sources.some(s=>s.name==='WeSearch'));
 for(const h of ['Collected','Sources','Posts',...(localViews?['WeSearch views']:[]),'Change*'])head.append(el('th',h));table.append(head);
 let prev, rows=0;
 for(const h of data.history){const a=h.articles.find(a=>a.id===selected);if(!a)continue;rows++;const v=count(a),r=el('tr');for(const text of [date(h.collectedAt),v.verified,v.social,...(localViews?[a.sources.find(s=>s.name==='WeSearch')?.metrics?.views??'Unavailable']:[]),prev?(v.social-prev.social>=0?'+':'')+(v.social-prev.social)+' posts / '+(v.verified-prev.verified>=0?'+':'')+(v.verified-prev.verified)+' sources':'Baseline'])r.append(el('td',text));table.append(r);prev=v;}
 $('history').replaceChildren(...(rows?[table,el('p','* Change from previous collection. Detailed counter history is in downloadable snapshots.','muted')]:[el('p','Scheduled history has not started for this URL yet. The first snapshot will appear after the next successful collection.','empty')]));
 renderLinkedIn(obs);
 $('coverage').replaceChildren();for(const state of obs.coverage){const n=el('div');n.append(el('strong',state.platform),el('span',' · '+state.status),el('p',state.detail));if(state.api)n.append(link('Collection endpoint ↗',state.api));$('coverage').append(n);}
}
function resetPage(){activeUrl=undefined;selected=undefined;data=undefined;$('dashboard').hidden=true;$('share').hidden=true;$('refresh').hidden=true;$('load').textContent='Enter an article URL to begin tracking.';}
function showShare(url){const shared=shareUrl(location.origin,url);$('share-url').value=shared;$('open-share').href=shared;$('share').hidden=false;$('refresh').hidden=false;}
async function savedData(){
 try{const r=await fetch('https://raw.githubusercontent.com/soupsoup/reach-tracker/main/data/latest.json?ts='+Date.now(),{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error();return {data:await r.json(),fallback:false};}
 catch{const r=await fetch('/data/latest.json');if(!r.ok)throw Error('Saved snapshots unavailable');return {data:await r.json(),fallback:true};}
}
async function load(input,{register=false,navigate=false}={}){
 const generation=++loadGeneration;let url;
 try{url=normalizeInput(input);}catch(e){$('load').textContent=e.message;return;}
 $('load').textContent=register?'Saving article and checking public sources…':'Loading this article’s tracking page…';$('refresh').disabled=true;$('track').disabled=true;
 // Hide the previous article while a different URL loads; never show its metrics under a new link.
 if(activeUrl&&articleKey(activeUrl)!==articleKey(url)){$('dashboard').hidden=true;$('share').hidden=true;}
 try{
   if(register){const r=await fetch('/api/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url})});const result=await r.json();if(!r.ok)throw Error(result.error||'Could not save this article.');}
   let saved;try{saved=await savedData();}catch{}
   const known=saved?.data.articles.find(a=>articleKey(a.url)===articleKey(url));
   let next,status;
   if(known){next=saved.data;selected=known.id;status=saved.fallback?'Showing deployment snapshot · latest repository data unavailable.':'Saved snapshots · collection scheduled twice hourly.';}
   else{const r=await fetch('/api/track?'+new URLSearchParams({url}),{signal:AbortSignal.timeout(25000)});const result=await r.json();if(!r.ok)throw Error(result.error||'Public sources could not be checked.');next=result;selected=next.articles[0].id;status='Live public-source check · scheduled snapshots appear after the next successful collection.';}
   if(generation!==loadGeneration)return;
   data=next;activeUrl=url;$('article').value=url;$('load').textContent=status;showShare(url);if(navigate)history.pushState({},'',shareUrl(location.origin,url));render();await checkLinkedIn();
 }catch(e){if(generation===loadGeneration){$('dashboard').hidden=true;$('share').hidden=true;$('load').textContent='Could not load this article: '+e.message;}}
 finally{if(generation===loadGeneration){$('refresh').disabled=false;$('track').disabled=false;}}
}
$('track-form').onsubmit=e=>{e.preventDefault();load($('article').value,{register:true,navigate:true});};
$('filter').onchange=()=>{if(data)render();};$('refresh').onclick=()=>{if(activeUrl)load(activeUrl);};
$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('share-url').value);$('copy').textContent='Copied ✓';setTimeout(()=>{$('copy').textContent='Copy link';},2000);}catch{$('share-url').focus();$('share-url').select();$('load').textContent='Select and copy the share link below.';}};
function openPage(){const url=new URLSearchParams(location.search).get('url');if(url)load(url);else{loadGeneration++;resetPage();$('article').value='';}}
window.addEventListener('popstate',openPage);openPage();setInterval(()=>{if(activeUrl)load(activeUrl);},300000);

function renderLinkedIn(obs){
 const target=data.articles.find(a=>a.id===selected)?.url;if(!target)return;
 const article=data.articles.find(a=>a.id===selected);
 if(linkedinSearchArticle!==articleKey(target)){linkedinSearchArticle=articleKey(target);$('linkedin-search').value=searchPhrase(article);}
 updateLinkedInSearch();
 $('linkedin-results').replaceChildren();
 const posts=[...obs.social.filter(p=>p.platform==='LinkedIn').map(p=>({...p,status:'verified',detail:p.verification})),...(obs.linkedinCandidates||[])];
 for(const p of posts){const row=el('div',undefined,'post');row.append(el('span',p.status==='verified'?'Verified exact article link':'Candidate · excluded from totals','badge '+(p.status==='verified'?'verified':'candidate')),link('Open LinkedIn post ↗',p.url),el('p',p.detail||'Awaiting public verification.','muted'));if(p.status==='verified')row.append(el('small',`Reactions: ${p.likes??'unavailable'} · Comments: ${p.comments??'unavailable'} · Reposts: ${p.reposts??'unavailable'}`));$('linkedin-results').append(row);}
 if(!posts.length)$('linkedin-results').append(el('p','No LinkedIn posts saved or verified for this article. Search results and inaccessible posts never imply zero shares.','empty'));
}
async function checkLinkedIn(){
 const target=activeUrl;if(!target)return;$('linkedin-check').disabled=true;$('linkedin-status').textContent='Checking saved public posts…';
 try{const r=await fetch('/api/linkedin?'+new URLSearchParams({url:target}),{signal:AbortSignal.timeout(25000)});const result=await r.json();if(!r.ok)throw Error(result.error||'Post check failed');if(activeUrl!==target)return;
 const obs=data.snapshot.articles.find(a=>a.id===selected);obs.social=obs.social.filter(p=>p.platform!=='LinkedIn').concat(result.social);obs.linkedinCandidates=result.candidates;
 obs.coverage=obs.coverage.filter(p=>p.platform!=='LinkedIn').concat(result.coverage);render();$('linkedin-status').textContent='Public check complete. Scheduled snapshots will record these observations.';
 }catch(e){$('linkedin-status').textContent=e.message;}finally{$('linkedin-check').disabled=false;}
}
$('linkedin-form').onsubmit=async e=>{
 e.preventDefault();if(!activeUrl)return;$('linkedin-add').disabled=true;$('linkedin-status').textContent='Saving post URL…';
 try{const r=await fetch('/api/linkedin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({articleUrl:activeUrl,postUrl:$('linkedin-url').value})});const result=await r.json();if(!r.ok)throw Error(result.error||'Post could not be saved');$('linkedin-url').value='';await checkLinkedIn();}
 catch(e){$('linkedin-status').textContent=e.message;}finally{$('linkedin-add').disabled=false;}
};
$('linkedin-check').onclick=checkLinkedIn;

function searchPhrase(article){
 if(article.title && !/^https?:\/\//i.test(article.title))return article.title.slice(0,250);
 try{const path=new URL(article.url).pathname.split('/').filter(Boolean).pop()||'';const words=decodeURIComponent(path).replace(/\.(html?|aspx|php)$/i,'').replace(/[-_]/g,' ');return /[a-z]{3}/i.test(words)?words.slice(0,250):'';}catch{return '';}
}
function updateLinkedInSearch(){
 const phrase=$('linkedin-search').value.trim(),query='site:linkedin.com '+phrase;
 $('linkedin-native').href='https://www.linkedin.com/search/results/content/?'+new URLSearchParams({keywords:phrase,origin:'GLOBAL_SEARCH_HEADER'});
 $('linkedin-google').href='https://www.google.com/search?'+new URLSearchParams({q:query});$('linkedin-bing').href='https://www.bing.com/search?'+new URLSearchParams({q:query});
}
$('linkedin-search').oninput=updateLinkedInSearch;
