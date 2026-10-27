import test from 'node:test';
import assert from 'node:assert/strict';
import {generateSynthetic} from '../scripts/generate-synthetic.mjs';
import {prepareData,appendData,getFrame,analyzeSnapshot,matchFacts,playerMetrics} from '../web/real-match.js';
import {createReplaySource} from '../lib/replay-stream.mjs';
import {coachingFixtures,evaluateFixture} from '../web/coaching-fixtures.js';
import {createApp,readConfig} from '../server.mjs';
import {spaceHeat} from '../web/space-heat.js';
const sample=generateSynthetic(),data=prepareData(sample.meta,sample.frames,sample.events);
test('synthetic behaviour is deterministic, bounded and publishes only primitive observations',()=>{
 const again=generateSynthetic({duration:30});assert.deepEqual(again.frames,sample.frames.slice(0,150));
 assert.equal(data.meta.synthetic,true);assert.equal(data.meta.roster.length,22);
 for(const row of sample.frames){assert.equal(row.length,49);for(let i=3;i<row.length;i++)assert.ok(Number.isFinite(row[i])&&row[i]>=0&&row[i]<=(i%2?105:68));}
 for(const p of data.meta.roster){assert.equal(p.energy,undefined);assert.equal(p.passing,undefined);}
 assert.ok(sample.events.filter(e=>e.type==='PASS').length>100);assert.ok(sample.events.some(e=>e.type==='CHALLENGE'));
});
test('incremental feed and full prefix produce identical statistics without future event outcomes',async()=>{
 const source=createReplaySource(new URL('../web/data/synthetic/',import.meta.url).pathname),live=prepareData(sample.meta);
 for(let after=0;after<120;after+=10)for await(const packet of source.packets(after,after+10))appendData(live,packet.frames,packet.events,packet.time);
 assert.ok(live.frames.every(f=>f[1]<=120));assert.ok(live.events.every(e=>Math.max(e.time,e.end)<=120));
 for(const time of [15,35,119.8]){assert.deepEqual(matchFacts(live,time),matchFacts(data,time));assert.deepEqual(playerMetrics(live,'Player6',time),playerMetrics(data,'Player6',time));}
});
test('changing possession never swaps team heat colors with unchanged positions',()=>{
 const frame=getFrame(data,30),a=analyzeSnapshot(frame),b=analyzeSnapshot({...frame,team:frame.team==='home'?'away':'home',holder:null});assert.deepEqual(a.grid.map(spaceHeat),b.grid.map(spaceHeat));
});
test('missing ball retains player tracking and suppresses ball-dependent recommendations',()=>{
 const frame=getFrame(data,30),a=analyzeSnapshot({...frame,ball:null,holder:null});assert.equal(a.options.length,0);assert.equal(a.pressure.length,0);assert.equal(a.grid.length,600);
});
for(const f of coachingFixtures())test('football acceptance: '+f.name,()=>assert.equal(evaluateFixture(f).pass,true,f.expectation));
test('server serves bounded replay, rejects oversized windows and never exposes env files',async t=>{
 const server=createApp({env:{}});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>{server.close(r);server.closeAllConnections();}));const base=`http://127.0.0.1:${server.address().port}`;
 const meta=await fetch(base+'/api/replay/meta').then(r=>r.json());assert.equal(meta.chunks,undefined);assert.equal(meta.eventCount,undefined);
 const stream=await fetch(base+'/api/replay/stream?after=0&until=3').then(r=>r.text());assert.equal(stream.trim().split('\n').length,3);
 assert.equal((await fetch(base+'/api/replay/stream?after=0&until=600')).status,400);assert.equal((await fetch(base+'/.env')).status,404);
 assert.equal((await fetch(base+'/api/match-agent/ask',{method:'POST',headers:{origin:'https://other.example','content-type':'application/json'},body:'{}'})).status,403);
});
test('Azure placeholders are not reported as a verified deployment',()=>{assert.equal(readConfig({}).configured,false);assert.equal(readConfig({AZURE_OPENAI_ENDPOINT:'https://example.com',AZURE_OPENAI_API_KEY:'placeholder',AZURE_OPENAI_DEPLOYMENT:'demo'}).configured,false);});

test('Agent uses private endpoint configuration and exposes only its public alias',async()=>{
 const {createMatchAgent}=await import('../match-agent.mjs');let sent;
 const agent=createMatchAgent({env:{MATCH_AI_PROVIDER:'compatible',AGENT_CHAT_ENDPOINT:'https://model.example/chat/completions',AGENT_MODEL:'private-model-identifier',AGENT_API_KEY:'private-test-key'},fetchImpl:async(url,options)=>{sent={url,options};return new Response(JSON.stringify({model:'private-returned-model',choices:[{message:{content:'Review the cited events before drawing a conclusion.'},finish_reason:'stop'}]}),{status:200});}});
 const status=await agent.status();assert.equal(status.label,'Agent');assert.deepEqual(status.models,['agent']);assert.equal(status.defaultModel,'agent');assert.ok(!JSON.stringify(status).includes('private-'));
 const result=await agent.ask({model:'agent',question:'What should I review?',time:185,player:'Player20',phase:'match'});
 assert.equal(result.model,'agent');assert.equal(result.label,'Agent');assert.ok(!JSON.stringify(result).includes('private-'));
 assert.equal(sent.url,'https://model.example/chat/completions');assert.equal(sent.options.headers.Authorization,'Bearer private-test-key');assert.equal(JSON.parse(sent.options.body).model,'private-model-identifier');
 await assert.rejects(agent.ask({model:'arbitrary-model',question:'Review',time:185,player:'Player20'}),/server configuration/);
});
