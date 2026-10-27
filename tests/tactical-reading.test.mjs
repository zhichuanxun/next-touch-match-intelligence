import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeSnapshot} from '../web/real-match.js';
import {tacticalReading,shouldAutoAnalyze} from '../web/tactical-reading.js';
const p=(id,team,x,y)=>({id,number:id,team,x,y,vx:0,vy:0,speed:0});
const home=[p('h','home',70,10),p('wing','home',82,6),p('target','home',90,29)];
const away=Array.from({length:6},(_,i)=>p('d'+i,'away',94+i%2*3,27+Math.floor(i/2)*6));
const frame={players:[...home,...away],holder:home[0],team:'home',direction:1,ball:{x:70,y:10},dead:false};
test('defender clustering raises local density, rather than painting a predefined penalty area',()=>{
 const dense=tacticalReading(frame,analyzeSnapshot(frame));
 const spreadFrame={...frame,players:[...home,...away.map((p,i)=>({...p,x:20+i*12,y:5+i*10}))]};
 const spread=tacticalReading(spreadFrame,analyzeSnapshot(spreadFrame));
 const near=list=>list.toSorted((a,b)=>Math.hypot(a.x-96,a.y-34)-Math.hypot(b.x-96,b.y-34))[0];
 assert.ok(near(dense.grid).density>near(spread.grid).density*2);assert.equal(dense.boxDefenders,6);assert.ok(spread.boxDefenders<dense.boxDefenders);
 assert.match(dense.notice,/Central congestion/);
});
test('wide and crossing routes require observed receivers and current pass candidates',()=>{
 const a=analyzeSnapshot(frame),r=tacticalReading(frame,a);assert.ok(r.corridors.length);
 assert.ok(r.corridors.every(o=>a.options.some(v=>v.id===o.id)&&Math.abs(o.target.y-34)>=17));
 assert.ok(r.crossings.every(c=>home.some(p=>p.id===c.to)&&Number.isFinite(c.margin)));
 const noHolder={...frame,holder:null};assert.deepEqual(tacticalReading(noHolder,analyzeSnapshot(noHolder)).corridors,[]);
 const dead={...frame,dead:true};assert.deepEqual(tacticalReading(dead,analyzeSnapshot(dead)).grid,[]);
});
test('defense density follows the actual defending team when possession changes',()=>{
 const swapped={...frame,team:'away',direction:-1,holder:away[0]};const a=tacticalReading(frame,analyzeSnapshot(frame)),b=tacticalReading(swapped,analyzeSnapshot(swapped));
 assert.equal(a.defendingTeam,'away');assert.equal(b.defendingTeam,'home');assert.notDeepEqual(a.grid.map(q=>q.density),b.grid.map(q=>q.density));
});
test('proactive feedback allows entry and changes but respects cooldown, disabled and busy states',()=>{
 const input={enabled:true,busy:false,now:100000,lastWall:null,key:'dense',lastKey:'',trigger:'entry'};
 assert.ok(shouldAutoAnalyze(input));assert.ok(!shouldAutoAnalyze({...input,enabled:false}));assert.ok(!shouldAutoAnalyze({...input,busy:true}));
 assert.ok(!shouldAutoAnalyze({...input,lastWall:80000,trigger:'dead-ball'}));
 assert.ok(!shouldAutoAnalyze({...input,lastWall:0,lastKey:'dense',trigger:'change'}));
 assert.ok(shouldAutoAnalyze({...input,lastWall:0,lastKey:'open',trigger:'change'}));
});

test('repeated dead balls within cooldown do not create duplicate model calls',()=>{
 assert.equal(shouldAutoAnalyze({enabled:true,busy:false,now:1000,lastWall:0,key:'dead',lastKey:'dead',trigger:'dead-ball'}),false);
 assert.equal(shouldAutoAnalyze({enabled:true,busy:false,now:45000,lastWall:0,key:'dead',lastKey:'dead',trigger:'dead-ball'}),true);
});
