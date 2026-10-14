"""Public, bounded discovery. Absence never means zero global reach."""
import json, re, html, hashlib
from pathlib import Path
from datetime import datetime, timezone
from urllib.request import Request, urlopen
from urllib.parse import urlencode, urlsplit, parse_qsl
from concurrent.futures import ThreadPoolExecutor
ROOT = Path(__file__).resolve().parents[1]
def canonical(url):
    p = urlsplit(url)
    query = urlencode([(k,v) for k,v in parse_qsl(p.query, keep_blank_values=True)
                       if not k.lower().startswith('utm_') and k.lower() not in ['fbclid','gclid','mc_cid','mc_eid']])
    return (p.hostname or '').removeprefix('www.') + p.path.rstrip('/') + ('?' + query if query else '')
def fetch(url):
    with urlopen(Request(url, headers={'User-Agent':'reach-tracker/1.0 (public source monitoring)'}), timeout=20) as r:
        return r.read(3000000).decode('utf-8', errors='replace')
def linked(post, target):
    embed = post.get('record',{}).get('embed',{})
    urls = [embed.get('external',{}).get('uri',''), embed.get('media',{}).get('external',{}).get('uri','')]
    for facet in post.get('record',{}).get('facets',[]):
        urls += [f.get('uri','') for f in facet.get('features',[])]
    return any(canonical(u) == canonical(target) for u in urls if u)
def collect(article):
    target=article['url']; rows=[]; health=[]
    for source in article.get('sources',[]):
        row=dict(source)
        try:
            body=fetch(source['url']); row['lastCheckedAt']=NOW
            # Only an explicit URL in markup proves a backlink, not a matching headline.
            links=re.findall(r'href=[\"\']([^\"\']+)', body, re.I)
            row['backlinkVerified']=any(canonical(html.unescape(u)) == canonical(target) for u in links)
            row['checkStatus']='retrieved'
            if row['backlinkVerified'] and row['status']=='candidate':
                row.update(status='verified',kind='citation',verification='Exact canonical article hyperlink found in source markup.',verifiedAt=NOW)
            if source['name']=='WeSearch':
                text=html.unescape(re.sub('<[^>]+>',' ',body))
                metrics={}
                for key in ['views','reactions','comments']:
                    match=re.search(r'(\d+)\s+'+key,text,re.I)
                    metrics[key]=int(match[1]) if match else None
                row['metrics']=metrics
        except Exception as e:
            row.update(checkStatus='unavailable',error=str(e)[:180],backlinkVerified=False)
        rows.append(row)
    def hn():
        endpoint='https://hn.algolia.com/api/v1/search?'+urlencode({'query':target,'restrictSearchableAttributes':'url','hitsPerPage':100})
        result=json.loads(fetch(endpoint)); posts=[]
        for h in result['hits']:
            if canonical(h.get('url') or '')==canonical(target):
                posts.append({'id':'hn-'+h['objectID'],'platform':'Hacker News','url':'https://news.ycombinator.com/item?id='+h['objectID'],'author':h.get('author'),'likes':h.get('points'),'comments':h.get('num_comments'),'reposts':None,'followers':None,'observedAt':NOW})
        return posts,{'platform':'Hacker News','status':'ok','detail':'Exact-URL matches in up to 100 search results; not exhaustive.','api':endpoint}
    def bsky():
        endpoint='https://api.bsky.app/xrpc/app.bsky.feed.searchPosts?'+urlencode({'q':target,'limit':100,'sort':'latest'})
        result=json.loads(fetch(endpoint)); posts=[]
        for p in result['posts']:
            if linked(p,target):
                author=p['author']; posts.append({'id':p['uri'],'platform':'Bluesky','url':'https://bsky.app/profile/'+author['handle']+'/post/'+p['uri'].split('/')[-1],'author':author['handle'],'likes':p.get('likeCount'),'comments':p.get('replyCount'),'reposts':p.get('repostCount'),'followers':None,'observedAt':NOW})
        return posts,{'platform':'Bluesky','status':'ok','detail':'Exact embedded links in up to 100 public search results; shortened links and unindexed posts may be missed.','api':endpoint}
    social=[]
    with ThreadPoolExecutor(max_workers=2) as pool:
        jobs={pool.submit(fn):name for fn,name in [(hn,'Hacker News'),(bsky,'Bluesky')]}
        for future,name in jobs.items():
            try:
                posts,state=future.result(); social+=posts; health.append(state)
            except Exception as e: health.append({'platform':name,'status':'unavailable','detail':str(e)[:180]})
    health += [{'platform':p,'status':'unavailable','detail':'No authorized analytics or reliable public collector configured; missing results do not mean zero.'} for p in ['X','LinkedIn','Facebook','Reddit']]
    health.append({'platform':'Publisher readership','status':'private','detail':'Publisher pageviews, unique readers and impressions are private. No audience estimate is calculated.'})
    if not rows:
        health.append({'platform':'Media and syndication','status':'unavailable','detail':'No verified source pages registered for this URL yet. Social collection does not provide comprehensive media discovery.'})
    return {'id':article['id'],'sources':rows,'social':social,'coverage':health}
def run():
    articles=json.loads((ROOT/'data/articles.json').read_text())
    # New URLs saved through the public dashboard automatically join scheduled collection.
    # Fail loudly if registry discovery fails; preserve all previously registered articles.
    registry=json.loads(fetch('https://reach-tracker-jade.vercel.app/api/registry'))
    known={canonical(a['url']) for a in articles}
    for article in registry['articles']:
        if canonical(article['url']) not in known:
            articles.append(article); known.add(canonical(article['url']))
    (ROOT/'data/articles.json').write_text(json.dumps(articles,indent=2)+'\n')
    with ThreadPoolExecutor(max_workers=4) as pool:
        observations=list(pool.map(collect, articles))
    snapshot={'collectedAt':NOW,'articles':observations,'schemaVersion':1}
    folder=ROOT/'data/snapshots'; folder.mkdir(exist_ok=True)
    (folder/(NOW.replace(':','-')+'.json')).write_text(json.dumps(snapshot,indent=2)+'\n')
    # Serve a compact history; immutable full evidence remains in snapshots.
    history=[]
    for path in sorted(folder.glob('*.json'))[-336:]:
        snap=json.loads(path.read_text()); history.append({'collectedAt':snap['collectedAt'],'articles':[{'id':a['id'],'social':a['social'],'sources':a['sources']} for a in snap['articles']]})
    (ROOT/'data/latest.json').write_text(json.dumps({'articles':articles,'snapshot':snapshot,'history':history},indent=2)+'\n')
if __name__=='__main__':
    NOW=datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z'); run()
