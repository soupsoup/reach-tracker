"""Scheduled-only X collection. Credentials never enter public data or browser requests."""
import json, os, re, threading
from urllib.request import Request, urlopen
from urllib.error import HTTPError
from urllib.parse import urlsplit, urlencode, parse_qsl
from datetime import datetime, timezone
from pathlib import Path
LOCK=threading.Lock()
def canonical(url):
    p=urlsplit(url)
    query=urlencode([(k,v) for k,v in parse_qsl(p.query,keep_blank_values=True) if not k.lower().startswith('utm_') and k.lower() not in ['fbclid','gclid','mc_cid','mc_eid']])
    return (p.hostname or '').removeprefix('www.')+p.path.rstrip('/')+('?' + query if query else '')
def observations(result,target,now):
    users={u['id']:u.get('username') for u in result.get('includes',{}).get('users',[])}
    posts=[]
    for p in result.get('data',[]):
        if not re.fullmatch(r'\d{1,30}',str(p.get('id',''))): continue
        urls=[u.get(key,'') for u in p.get('entities',{}).get('urls',[]) for key in ['unwound_url','expanded_url']]
        if not any(u and canonical(u)==canonical(target) for u in urls):continue
        metrics=p.get('public_metrics',{})
        def counter(key):
            value=metrics.get(key)
            return value if type(value) is int and value>=0 else None
        posts.append({'id':'x-'+p['id'],'platform':'X','url':'https://x.com/i/status/'+p['id'],'author':users.get(p.get('author_id')) or 'X account '+p.get('author_id','unknown'),'likes':counter('like_count'),'comments':counter('reply_count'),'reposts':counter('retweet_count'),'quotes':counter('quote_count'),'impressions':counter('impression_count'),'followers':None,'observedAt':now,'publishedAt':p.get('created_at')})
    return posts
class RequestBudget:
    def __init__(self,path,limit=1500):
        self.path=Path(path);self.limit=max(0,min(limit,1500));self.month=datetime.now(timezone.utc).strftime('%Y-%m')
        try:self.state=json.loads(self.path.read_text())
        except (FileNotFoundError,ValueError):self.state={}
        if self.state.get('month')!=self.month:self.state={'month':self.month,'requests':0}
    def reserve(self):
        with LOCK:
            if self.state['requests']>=self.limit:return False
            self.state['requests']+=1;self.path.write_text(json.dumps(self.state,indent=2)+'\n');return True

def collect_x(article,budget,request_json=None):
    now=datetime.now(timezone.utc).isoformat(timespec='seconds').replace('+00:00','Z')
    token=os.environ.get('X_BEARER_TOKEN','').strip()
    def state(status,detail):return [],{'platform':'X','status':status,'detail':detail}
    if not token:return state('not connected','Add X_BEARER_TOKEN as a GitHub Actions secret to connect X. Total shares remain unavailable.')
    if os.environ.get('X_COLLECTION_ENABLED','').lower()!='true':return state('paused','X credential configured; set X_COLLECTION_ENABLED=true after setting your X API spending limit.')
    query='url:"'+canonical(article['url']).replace('"','')+'" -is:retweet'
    if len(query)>512:return state('unavailable','Article URL exceeds the recent-search query length limit.')
    if not budget.reserve():return state('paused','Monthly collector request cap reached. This request cap is separate from your X billing spending limit.')
    endpoint='https://api.x.com/2/tweets/search/recent?'+urlencode({'query':query,'max_results':10,'tweet.fields':'created_at,entities,public_metrics,author_id','expansions':'author_id','user.fields':'username'})
    try:
        if request_json:result=request_json(endpoint,token)
        else:
            with urlopen(Request(endpoint,headers={'Authorization':'Bearer '+token,'User-Agent':'reach-tracker/1.0'}),timeout=20) as r:result=json.load(r)
        if result.get('errors'):return state('unavailable','X returned partial API errors; this observation is excluded rather than reporting incomplete counts.')
        posts=observations(result,article['url'],now)
        extra=' More results exist beyond this collection limit.' if result.get('meta',{}).get('next_token') else ''
        return posts,{'platform':'X','status':'partial','detail':'Exact expanded article links among up to 10 recent posts from the last 7 days. Native reposts are excluded as duplicate posts; repost and quote counters are shown separately. Older posts and private shares are outside coverage.'+extra,'api':'https://api.x.com/2/tweets/search/recent','observedAt':now}
    except HTTPError as e:
        explanations={401:'X rejected the token. Check or regenerate the bearer token.',403:'The X app does not have access to recent search.',402:'X API credits or billing access are required.',429:'X rate limit, credits, or spending limit reached. Retry on the next scheduled collection.'}
        return state('unavailable',explanations.get(e.code,'X API returned HTTP '+str(e.code)))
    except Exception:
        return state('unavailable','X request failed or timed out. No counts were recorded; retry on the next scheduled collection.')
