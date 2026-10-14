import unittest
from scripts.collect import canonical, linked
class Verification(unittest.TestCase):
    def test_tracking_query(self):
        self.assertEqual(canonical('https://www.nytimes.com/a?utm_source=x'),canonical('https://nytimes.com/a'))
    def test_other_story_is_not_share(self):
        self.assertFalse(linked({'record':{'embed':{'external':{'uri':'https://nytimes.com/b'}}}},'https://nytimes.com/a'))
    def test_facet_share(self):
        self.assertTrue(linked({'record':{'facets':[{'features':[{'uri':'https://www.nytimes.com/a?utm_source=social'}]}]}},'https://nytimes.com/a'))
    def test_headline_only_is_not_verified(self):
        self.assertFalse(linked({'record':{'text':'same headline'}},'https://nytimes.com/a'))

    def test_functional_query_distinguishes_articles(self):
        self.assertNotEqual(canonical('https://example.org/?p=1'),canonical('https://example.org/?p=2'))
