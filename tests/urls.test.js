import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeInput, articleKey, shareUrl} from '../url-utils.js';
import {articleFromUrl, linked} from '../lib/articles.js';
test('sharing round-trips URLs with functional query parameters',()=>{
 const input='https://example.org/article?id=123&lang=en';
 const shared=shareUrl('https://reach-tracker-jade.vercel.app',input);
 assert.equal(new URL(shared).searchParams.get('url'),input);
});
test('tracking parameters do not split an article',()=>{
 assert.equal(articleKey('https://www.example.org/a?utm_source=social'),articleKey('https://example.org/a'));
 assert.equal(articleFromUrl('https://example.org/a').id,articleFromUrl('https://example.org/a?utm_campaign=x').id);
});
test('functional query parameters identify different articles',()=>{
 assert.notEqual(articleFromUrl('https://example.org/?p=1').id,articleFromUrl('https://example.org/?p=2').id);
 assert.equal(linked({record:{embed:{external:{uri:'https://example.org/?p=2'}}}},'https://example.org/?p=1'),false);
});
test('unsafe or malformed URLs are rejected',()=>{
 for(const input of ['javascript:alert(1)','not a url','https://user:password@example.org/a','http://127.0.0.1/a','https://localhost/a'])assert.throws(()=>normalizeInput(input));
});
test('embedded and facet links verify the requested article',()=>{
 assert.equal(linked({record:{embed:{media:{external:{uri:'https://example.org/a'}}}}},'https://example.org/a'),true);
 assert.equal(linked({record:{text:'same headline'}},'https://example.org/a'),false);
});
