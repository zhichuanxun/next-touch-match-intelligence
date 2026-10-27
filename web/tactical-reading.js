import {arrival,outsidePitch} from './real-match.js';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const density=(players,q)=>players.reduce((sum,p)=>sum+Math.exp(-(dist(p,q)**2)/(2*7**2)),0);
function routeMargin(from,to,defenders,delay=0){const duration=dist(from,to)/15;let margin=Infinity;for(let i=1;i<=18;i++){const u=i/18,q={x:from.x+(to.x-from.x)*u,y:from.y+(to.y-from.y)*u};for(const p of defenders)margin=Math.min(margin,arrival(p,q)-delay-duration*u);}return margin;}
export function tacticalReading(frame,analysis){
 const none={grid:[],corridors:[],crossings:[],boxDefenders:0,boxAttackers:0,defendingTeam:null,notice:'Tracking is incomplete, Defensive structure estimate is unavailable. ',key:'unavailable'};
 if(!frame.ball||!frame.team||frame.dead)return {...none,notice:!frame.ball?'Ball tracking gap; Player positions and movement continue, Passing analysis paused. ':'Dead-ball window: Check restart positions and marking. ',key:frame.dead?'dead':'missing'};
 const defenders=frame.players.filter(p=>p.team!==frame.team&&!outsidePitch(p)),attackers=frame.players.filter(p=>p.team===frame.team&&!outsidePitch(p));
 if(!defenders.length||!attackers.length)return none;
 const towardGoal=p=>frame.direction===1?105-p.x:p.x,inBox=p=>towardGoal(p)<=16.5&&Math.abs(p.y-34)<=20.16;
 const boxDefenders=defenders.filter(inBox).length,boxAttackers=attackers.filter(inBox).length;
 const grid=analysis.grid.map(q=>({...q,density:density(defenders,q)}));
 const corridors=analysis.options.filter(o=>!o.offside&&Math.abs(o.target.y-34)>=17&&o.progress>=-5).sort((a,b)=>b.margin-a.margin).slice(0,2);
 const crossings=[];
 for(const wide of corridors){if(towardGoal(wide.target)>32)continue;for(const target of attackers.filter(p=>p.id!==wide.id&&p.id!==frame.holder?.id&&inBox(p))){
  const line=defenders.map(p=>p.x*frame.direction).sort((a,b)=>b-a)[1];
  if(target.x*frame.direction>Math.max(wide.target.x*frame.direction,line??Infinity))continue;
  const margin=Math.min(wide.margin,routeMargin(wide.target,target,defenders,wide.duration+.4));
  crossings.push({from:wide.id,to:target.id,start:wide.target,target:{x:target.x,y:target.y},margin});
 }}
 crossings.sort((a,b)=>b.margin-a.margin);
 const open=corridors.filter(o=>o.margin>0),pressure=analysis.nearest?.time;
 let notice=boxDefenders>=5?`In the box: ${boxDefenders} defenders, ${boxAttackers} attackers, Central congestion. `:`${boxDefenders} defenders in the box. ${pressure<1.5?'Carrier under pressure, Nearest opponent about '+pressure.toFixed(1)+'s to arrive. ':'Check the direction of support. '}`;
 if(open.length)notice+=`Wide options ${open.map(o=>o.player.number).join(' / ')}: positive arrival margin. Review the switch. `;
 else if(frame.holder)notice+='No positive-margin wide receiver found, No clear opening is asserted. ';
 else notice+='Carrier unconfirmed, No passing routes shown. ';
 if(crossings.length)notice+=crossings[0].margin>0?'A crossing combination is available, Check the receiving point. ':'The crossing candidate has a negative interception margin. ';
 return {grid,corridors,crossings:crossings.slice(0,2),boxDefenders,boxAttackers,defendingTeam:frame.team==='home'?'away':'home',notice,
  key:[frame.team,boxDefenders>=5?'dense':'open',pressure<1.5?'pressed':'clear',open.map(o=>o.id).sort().join(',')].join(':')};
}
export function shouldAutoAnalyze({enabled,busy,now,lastWall,key,lastKey,trigger}){
 return enabled&&!busy&&(lastWall===null||now-lastWall>=45000)&&(['entry','dead-ball','full-time'].includes(trigger)||key!==lastKey);
}

// Tactical labels are hypotheses derived from observations, never authored match events.
export function tacticalChoices(frame,analysis,switches=[]){
 const transition=switches.filter(e=>e.team===frame.team&&Math.max(e.time,e.end||0)<=frame.time&&frame.time-Math.max(e.time,e.end||0)<=8).at(-1);
 const forwardRuns=analysis.runs.filter(r=>r.player.team===frame.team&&r.player.vx*frame.direction>1);
 const phase=!frame.ball?'Ball tracking gap':frame.dead?'Set piece / Restart':transition&&forwardRuns.length>=2?'Counter candidate':transition?'Transition':analysis.nearest?.time<1.5?'Under pressure':'Build-up';
 const usable=frame.ball&&frame.holder&&!frame.dead?analysis.options.filter(o=>!o.offside):[];
 const specs=[['forward',transition&&forwardRuns.length>=2?'Counter pass':'Forward pass',o=>o.progress>=8],['wide','Wide switch',o=>Math.abs(o.target.y-34)>=17&&Math.abs(o.target.y-frame.ball.y)>=8],['retain','Recycle pass',o=>o.progress<3]];
 const choices=specs.map(([id,label,accept])=>{const option=usable.filter(accept).sort((a,b)=>b.margin-a.margin)[0];return {id,label,option,reason:!frame.ball?'Ball coordinates missing':frame.dead?'Awaiting restart':!frame.holder?'Carrier unconfirmed':'No receiving window'};});
 return {phase,transition,forwardRuns:forwardRuns.length,choices,reason:transition?`Following a regain: ${(frame.time-Math.max(transition.time,transition.end||0)).toFixed(1)}s · ${forwardRuns.length} forward runners`:'Computed from current positions · Not a declared tactic'};
}
