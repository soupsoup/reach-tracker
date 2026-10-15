import os,tempfile,unittest
from unittest.mock import patch
from scripts.x_collect import observations,collect_x,RequestBudget
class XVerification(unittest.TestCase):
    def test_exact_expanded_links_only_and_nullable_metrics(self):
        result={'data':[{'id':'123','author_id':'9','entities':{'urls':[{'expanded_url':'https://example.org/a?utm_source=x'}]},'public_metrics':{'like_count':5,'quote_count':2}},{'id':'124','entities':{'urls':[{'expanded_url':'https://example.org/b'}]}}],'includes':{'users':[{'id':'9','username':'person'}]}}
        posts=observations(result,'https://example.org/a','now')
        self.assertEqual(len(posts),1);self.assertEqual(posts[0]['author'],'person');self.assertEqual(posts[0]['likes'],5);self.assertEqual(posts[0]['quotes'],2);self.assertIsNone(posts[0]['reposts'])
    def test_missing_credentials_make_no_requests(self):
        with patch.dict(os.environ,{'X_BEARER_TOKEN':''}):
            posts,status=collect_x({'url':'https://example.org/a'},None,lambda *_:self.fail('API called'))
        self.assertEqual(status['status'],'not connected')
    def test_pause_blocks_paid_requests(self):
        with patch.dict(os.environ,{'X_BEARER_TOKEN':'test-fixture','X_COLLECTION_ENABLED':'false'}):
            _,status=collect_x({'url':'https://example.org/a'},None,lambda *_:self.fail('API called'))
        self.assertEqual(status['status'],'paused')
    def test_monthly_request_cap_and_zero_results_not_global_total(self):
        with tempfile.TemporaryDirectory() as tmp,patch.dict(os.environ,{'X_BEARER_TOKEN':'test-fixture','X_COLLECTION_ENABLED':'true'}):
            budget=RequestBudget(tmp+'/usage.json',1)
            posts,status=collect_x({'url':'https://example.org/a'},budget,lambda *_:{'meta':{'result_count':0}})
            self.assertEqual(posts,[]);self.assertEqual(status['status'],'partial')
            _,status=collect_x({'url':'https://example.org/a'},budget,lambda *_:self.fail('Budget exceeded'))
            self.assertEqual(status['status'],'paused')
    def test_shortened_link_without_expansion_is_not_verified(self):
        self.assertEqual(observations({'data':[{'id':'123','entities':{'urls':[{'url':'https://t.co/foo'}]}}]},'https://example.org/a','now'),[])

    def test_search_keeps_original_url_and_adds_distinctive_slug(self):
        from urllib.parse import urlsplit,parse_qs
        target='https://www.example.org/news/a-distinctive-article-headline.html'
        def request(endpoint,token):
            query=parse_qs(urlsplit(endpoint).query)['query'][0]
            self.assertIn('url:"'+target+'"',query)
            self.assertIn('url:"a-distinctive-article-headline.html"',query)
            return {'meta':{'result_count':0}}
        with tempfile.TemporaryDirectory() as tmp,patch.dict(os.environ,{'X_BEARER_TOKEN':'test','X_COLLECTION_ENABLED':'true'}):
            collect_x({'url':target},RequestBudget(tmp+'/usage.json',1),request)

    def test_nyt_share_and_newsletter_variants_match(self):
        target='https://www.nytimes.com/2026/10/13/world/asia/story.html'
        variants=['?smid=nytcore-ios-share','?unlocked_article_code=fixture&smid=tw-share','?campaign_id=346&emc=newsletter&instance_id=123&nl=world&regi_id=123&segment_id=123&user_id=fixture']
        for query in variants:
            posts=observations({'data':[{'id':'123','entities':{'urls':[{'expanded_url':target+query}]}}]},target,'now')
            self.assertEqual(len(posts),1)
    def test_functional_parameters_still_distinguish_articles(self):
        for target,other in [('https://example.org/a?id=1','https://example.org/a?id=2'),('https://example.org/a?user_id=1','https://example.org/a?user_id=2'),('https://www.nytimes.com/story.html?page=1','https://www.nytimes.com/story.html?page=2')]:
            self.assertEqual(observations({'data':[{'id':'123','entities':{'urls':[{'expanded_url':other}]}}]},target,'now'),[])
