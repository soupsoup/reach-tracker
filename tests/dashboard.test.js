import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const saved=JSON.parse(await readFile(new URL('../data/latest.json',import.meta.url),'utf8'));
class Element {
 constructor(){this.children=[];this.value='all';this.hidden=false;this.disabled=false;}
 append(...children){this.children.push(...children);}
 replaceChildren(...children){this.children=children;}
 focus(){} select(){}
}
async function setup(search=''){
 const ids={},calls=[];const location={origin:'https://reach-tracker-jade.vercel.app',search};
 globalThis.document={getElementById:id=>ids[id]??=new Element(),createElement:()=>new Element()};
 globalThis.location=location;globalThis.window={addEventListener(){}};
 globalThis.history={pushState(_s,_t,url){location.search=new URL(url).search;}};
 globalThis.setInterval=()=>0;
 globalThis.fetch=async(url,options)=>{
  calls.push([String(url),options?.method]);
  if(String(url).includes('/api/linkedin'))return {ok:true,json:async()=>({social:[],candidates:[],coverage:{platform:'LinkedIn',status:'limited',detail:'Test public check'}})};
  if(String(url).includes('/api/register'))return {ok:true,json:async()=>({scheduled:true})};
  if(String(url).includes('/api/track')){
   const article={id:'new',url:new URL(String(url),'https://test.org').searchParams.get('url'),publisher:'example.org',title:'New article',sources:[]};
   const observation={id:'new',social:[],sources:[],coverage:[]};
   return {ok:true,json:async()=>({articles:[article],snapshot:{collectedAt:new Date().toISOString(),articles:[observation]},history:[],mode:'live'})};
  }
  return {ok:true,json:async()=>saved};
 };
 await import('../app.js?test='+Math.random());
 for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));
 return {ids,calls,location};
}
test('home starts blank and makes no article request',async()=>{
 const {ids,calls}=await setup();assert.equal(ids.article.value,'');assert.equal(ids.dashboard.hidden,true);assert.equal(ids.share.hidden,true);assert.equal(calls.length,0);
});
test('direct shared URL selects exact article and exposes its share link',async()=>{
 const article=saved.articles[0],{ids}=await setup('?'+new URLSearchParams({url:article.url}));
 assert.equal(ids.dashboard.hidden,false);assert.equal(ids.title.textContent,article.title);assert.equal(ids.share.hidden,false);assert.equal(new URL(ids['share-url'].value).searchParams.get('url'),article.url);
});
test('URL form saves new article, collects it and creates a direct link',async()=>{
 const {ids,calls,location}=await setup();ids.article.value='https://example.org/story?id=42&utm_source=mail';
 ids['track-form'].onsubmit({preventDefault(){}});
 for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.ok(calls.some(([url,method])=>url==='/api/register'&&method==='POST'));
 assert.ok(calls.some(([url])=>url.startsWith('/api/track?')));
 assert.equal(ids.dashboard.hidden,false);assert.equal(ids.title.textContent,'New article');
 assert.equal(new URLSearchParams(location.search).get('url'),'https://example.org/story?id=42');
 assert.equal(new URL(ids['share-url'].value).searchParams.get('url'),'https://example.org/story?id=42');
 assert.equal(ids.track.disabled,false);
});

test('LinkedIn form submits a post against the selected article and refreshes public checks',async()=>{
 const article=saved.articles[0],{ids,calls}=await setup('?'+new URLSearchParams({url:article.url}));
 document.getElementById('linkedin-url').value='https://www.linkedin.com/posts/example_activity-123456789-test';
 await ids['linkedin-form'].onsubmit({preventDefault(){}});
 assert.ok(calls.some(([url,method])=>url==='/api/linkedin'&&method==='POST'));
 assert.ok(calls.some(([url,method])=>url.startsWith('/api/linkedin?')&&!method));
 assert.equal(ids['linkedin-url'].value,'');assert.equal(ids['linkedin-add'].disabled,false);
});

test('LinkedIn discovery uses editable headline keywords instead of requiring an indexed full URL',async()=>{
 const article=saved.articles[0],{ids}=await setup('?'+new URLSearchParams({url:article.url}));
 const query=new URL(ids['linkedin-google'].href).searchParams.get('q');
 assert.ok(query.startsWith('site:linkedin.com '));assert.ok(!query.includes('https://'));assert.ok(!query.includes('site:linkedin.com/posts/'));
 ids['linkedin-search'].value='ransomware Japan AI';ids['linkedin-search'].oninput();
 assert.equal(new URL(ids['linkedin-native'].href).searchParams.get('keywords'),'ransomware Japan AI');
 assert.equal(new URL(ids['linkedin-bing'].href).searchParams.get('q'),'site:linkedin.com ransomware Japan AI');
});
