import {analyzeSnapshot} from './real-match.js';
import {tacticalReading,tacticalChoices} from './tactical-reading.js';
import {trackingQuality,decisionComparison} from './coaching.js';
const homes=[[5,34],[55,34],[66,26],[68,44],[60,6],[62,62],[43,20],[42,46],[31,18],[30,50],[20,34]];
const aways=[[101,34],[80,20],[80,34],[80,48],[90,12],[90,56],[70,27],[70,41],[61,30],[61,38],[48,34]];
function players(points,team){return points.map(([x,y],i)=>({id:(team==='home'?'H':'A')+i,number:i+1,name:'Test player '+(i+1),team,x,y,vx:0,vy:0,speed:0}));}
function scene(){const members=[...players(homes,'home'),...players(aways,'away')];return {time:20,sourceTime:20,period:1,players:members,ball:{x:55,y:34},holder:members[1],team:'home',direction:1,homeDirection:1,events:[],dead:false,score:{home:0,away:0}};}
function move(f,id,x,y,vx=0,vy=0){const p=f.players.find(p=>p.id===id);Object.assign(p,{x,y,vx,vy,speed:Math.hypot(vx,vy)});if(f.holder?.id===id)f.ball={x,y};}
export function coachingFixtures(){
 const dense=scene();[[98,34],[92,24],[92,30],[92,38],[92,44],[96,18],[96,50],[89,34]].forEach(([x,y],i)=>move(dense,'A'+i,x,y));move(dense,'H1',80,34);
 const press=scene();move(press,'H1',20,34);move(press,'A1',22,33);move(press,'A2',23,35);move(press,'A3',24,31);
 const counter=scene();move(counter,'H2',66,26,4,0);move(counter,'H3',68,44,4,0);const regained={id:'fixture-regain',time:17,end:17,team:'home',type:'SWITCH',subtype:''};
 const weak=scene();move(weak,'H1',60,12);move(weak,'H5',65,60);for(const p of weak.players.filter(p=>p.team==='away'))p.y=8+(p.number%4)*4;
 const red=scene();red.players=red.players.filter(p=>p.id!=='A10');red.events=[{id:'red',type:'CARD',subtype:'RED',from:'A10',team:'away',time:10,end:10}];
 const noBall=scene();noBall.ball=null;noBall.holder=null;noBall.ballMissingSeconds=3;move(noBall,'H2',66,26,3,0);
 const missing=scene();missing.players=missing.players.filter(p=>p.id!=='A10');
 return [
  {id:'low-block',name:'Low block',frame:dense,expectation:'More defenders and higher density in the box; Density is not a success probability',check:r=>r.tactical.boxDefenders>=7&&Math.max(...r.tactical.grid.map(q=>q.density))>3},
  {id:'high-press',name:'High press',frame:press,expectation:'Detect pressure on the carrier; A contested carry must not be labelled an open window',check:r=>r.analysis.pressure.length>=3&&r.comparison.find(x=>x.id==='carry').margin<.6},
  {id:'counter',name:'Counterattack',frame:counter,switches:[regained],expectation:'A completed regain plus two forward runners triggers a counterattack candidate',check:r=>r.strategy.phase==='Counter candidate'},
  {id:'weak-side',name:'Weak-side switch',frame:weak,expectation:'A receiving candidate spans at least8mlaterally',check:r=>r.comparison.find(x=>x.id==='wide').available},
  {id:'red-card',name:'Playing with ten',frame:red,expectation:'21players with a completed red-card event, Do not mislabel as missing tracking',check:r=>r.quality.expected===21&&r.quality.missing===0},
  {id:'ball-gap',name:'Ball tracking gap',frame:noBall,expectation:'Keep positions and movement, Disable pass and carry comparison',check:r=>r.analysis.grid.length===600&&r.analysis.runs.length>0&&r.comparison.every(x=>!x.available)},
  {id:'player-gap',name:'Player tracking gap',frame:missing,expectation:'Without a red card, identify missing players:1 players, Disable incomplete decision comparison',check:r=>r.quality.missing===1&&r.comparison.every(x=>!x.available)},
 ];
}
export function evaluateFixture(fixture){const frame=fixture.frame,analysis=analyzeSnapshot(frame),tactical=tacticalReading(frame,analysis),strategy=tacticalChoices(frame,analysis,fixture.switches),quality=trackingQuality(frame),comparison=decisionComparison(frame,analysis,fixture.switches);const result={analysis,tactical,strategy,quality,comparison};return {...result,pass:fixture.check(result)};}
