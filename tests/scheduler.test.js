import test from 'node:test';
import assert from 'node:assert/strict';
import handler, {slotStart,decision} from '../api/cron/collect.js';
const now=new Date('2026-10-15T00:22:00Z');
const run=(status,conclusion,time='2026-10-15T00:17:02Z')=>({status,conclusion,created_at:time});
test('half-hour slots handle hour and day rollover',()=>{
 assert.equal(slotStart(now).toISOString(),'2026-10-15T00:17:00.000Z');
 assert.equal(slotStart('2026-10-15T00:02:00Z').toISOString(),'2026-10-14T23:47:00.000Z');
 assert.equal(slotStart('2026-10-15T00:47:00Z').toISOString(),'2026-10-15T00:47:00.000Z');
});
test('skip active runs and completed slots; retry failures up to three attempts',()=>{
 assert.equal(decision([run('in_progress',null)],now),'running');
 assert.equal(decision([run('queued',null)],now),'running');
 assert.equal(decision([run('completed','success')],now),'complete');
 assert.equal(decision([run('completed','success','2026-10-14T23:47:00Z')],now),'dispatch');
 assert.equal(decision([run('completed','failure')],now),'dispatch');
 assert.equal(decision(Array(3).fill(run('completed','failure')),now),'retry-limit');
});
test('public callers cannot trigger collection',async()=>{
 const prior=process.env.CRON_SECRET;process.env.CRON_SECRET='test-secret';
 const res={setHeader(){},status(n){this.code=n;return this;},json(body){this.body=body;}};
 try {await handler({method:'GET',headers:{}},res);assert.equal(res.code,401);}
 finally {if(prior===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=prior;}
});
