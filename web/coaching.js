import {getFrame,analyzeSnapshot,arrival,outsidePitch,clamp,eventName,observationsAt} from './real-match.js';
import {tacticalChoices} from './tactical-reading.js';
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
export const OBSERVATION_MODES=Object.freeze({
 decision:{label:'On ball',layers:{space:true,pressure:true,defense:false,corridors:false,runs:false,passes:true,trail:false}},
 movement:{label:'Off ball',layers:{space:false,pressure:false,defense:false,corridors:true,runs:true,passes:true,trail:false}},
 defense:{label:'Defence',layers:{space:true,pressure:true,defense:true,corridors:false,runs:false,passes:false,trail:false}},
});
export function trackingQuality(frame,{connected=true,buffering=false,watermark=frame.time}={}){
 const red=new Set((frame.events||[]).filter(e=>Math.max(e.time,e.end||0)<=frame.time&&e.type==='CARD'&&/RED|SECOND YELLOW/.test(e.subtype)).map(e=>e.from||e.id));
 const expected=Math.max(0,22-red.size),count=frame.players.length,missing=Math.max(0,expected-count),stale=Math.max(0,frame.time-frame.sourceTime);
 const status=!connected?'Disconnected':buffering?'Buffering':stale>.6?'Tracking delayed':missing?'Incomplete tracking':!frame.ball?'Ball tracking gap':!frame.holder&&!frame.dead?'Carrier unconfirmed':frame.dead?'Dead ball':'Tracking ready';
 return {status,count,expected,missing,stale,ball:!!frame.ball,holder:!!frame.holder,buffering,connected,bufferSeconds:Math.max(0,watermark-frame.time),redCards:red.size,
  rows:[['Connection',!connected?'Disconnected, Reconnect available':buffering?'Buffering, Match clock paused':'Connected'],['Player tracking',`${count}  players / expected ${expected}  players${missing?' · missing '+missing+'  players':''}`],['Ball tracking',frame.ball?'Current observation':`Missing ${(frame.ballMissingSeconds||0).toFixed(1)}s`],['Possession',frame.holder?`${frame.holder.number} · Proximity estimate`:frame.dead?'Dead ball':'Unconfirmed'],['Data age',`${stale.toFixed(1)}s · Received ${Math.max(0,watermark-frame.time).toFixed(1)}s buffer`]],
  limitation:missing?'Missing tracking may overstate passing windows, Route comparison is paused. ':!frame.ball?'Player positions and movement are retained; Pause passes, carrier pressure and carry estimates. ':!frame.holder?'Continue observing positions and movement; Wait for a confirmed carrier before comparing choices. ':'Arrival and route estimates use shared parameters, Individual ability is not calibrated. '};
}
function consequences(frame,target,receiver){
 const ours=frame.players.filter(p=>p.team===frame.team&&!outsidePitch(p)&&p.id!==frame.holder.id&&p.id!==receiver),opponents=frame.players.filter(p=>p.team!==frame.team&&!outsidePitch(p));
 return {support:ours.filter(p=>distance(p,target)<=12).length,
  threats:opponents.filter(p=>(p.x-target.x)*frame.direction<0&&distance(p,target)<=30).length,
  cover:ours.filter(p=>(p.x-target.x)*frame.direction<0&&distance(p,target)<=30).length};
}
export function decisionComparison(frame,analysis,switches=[]){
 const quality=trackingQuality(frame),strategy=tacticalChoices(frame,analysis,switches);
 const why=quality.missing?'Incomplete tracking':!frame.ball?'Ball coordinates missing':frame.dead?'Awaiting restart':!frame.holder?'Carrier unconfirmed':null;
 const rows=strategy.choices.map(c=>{const o=!why&&c.option;return {id:c.id,label:c.label,available:!!o,reason:why||c.reason,...(o?{type:'pass',receiver:o.id,number:o.player.number,target:o.target,progress:o.progress,margin:o.margin,duration:o.duration,...consequences(frame,o.target,o.id)}:{})};});
 let carry=null;
 if(!why){const defenders=frame.players.filter(p=>p.team!==frame.team&&!outsidePitch(p));
  for(const angle of [-.55,0,.55]){const target={x:clamp(frame.holder.x+frame.direction*Math.cos(angle)*7,0,105),y:clamp(frame.holder.y+Math.sin(angle)*7,0,68)},duration=distance(frame.ball,target)/3.5;if(duration<.2)continue;let margin=Infinity;
   for(let step=1;step<=16;step++){const u=step/16,q={x:frame.ball.x+(target.x-frame.ball.x)*u,y:frame.ball.y+(target.y-frame.ball.y)*u};for(const p of defenders)margin=Math.min(margin,arrival(p,q)-duration*u);}
   const candidate={type:'carry',id:'carry',label:'Carry forward',available:true,target,duration,margin,progress:(target.x-frame.ball.x)*frame.direction,...consequences(frame,target,null)};
   if(!carry||candidate.margin>carry.margin)carry=candidate;
  }
 }
 rows.push(carry||{id:'carry',label:'Carry forward',available:false,reason:why||'Insufficient space'});
 return rows.map(r=>({...r,risk:!r.available?'Unknown':r.margin<=0?'Interception risk':r.margin<.6?'Narrow window':'Ball arrives first'}));
}
export function sequenceReview(data,end,selected,seconds=10){
 end=Math.min(end,data.watermark??end,data.frames.at(-1)?.[1]??end);const start=Math.max(data.meta.start,end-seconds),samples=[];
 for(let t=start;t<end-.05;t+=1)samples.push(getFrame(data,t));samples.push(getFrame(data,end));
 while(samples.length>1&&samples[0].sourceTime<start)samples.shift();
 const last=samples.at(-1),team=last.team,records=[],trajectories=[];let previous=null,peak=null;
 for(const f of samples){const a=analyzeSnapshot(f);if(trackingQuality(f).missing){a.options=[];a.nearest=null;}const pressure=a.nearest?.time;
  if(f.ball&&!f.dead&&Number.isFinite(pressure)&&(!peak||pressure<peak.value))peak={time:f.sourceTime,value:pressure};
  if(previous&&f.holder&&previous.frame.holder?.id===f.holder.id&&f.sourceTime-previous.frame.sourceTime<=1.25){
   const old=new Map(previous.analysis.options.filter(o=>!o.offside).map(o=>[o.id,o.margin]));
   for(const o of a.options.filter(o=>!o.offside)){const before=old.get(o.id);if(before===undefined)continue;let label;if(before<=.25&&o.margin>.25)label='Window opens';if(before>.25&&o.margin<=.25)label='Window narrows';if(label)records.push({time:f.sourceTime,label:label+' · '+o.player.number+' shirt',kind:'estimate',receiver:o.id,margin:o.margin});}
  }previous={frame:f,analysis:a};
 }
 const events=observationsAt(data,end).filter(e=>Math.max(e.time,e.end||0)>=start);for(const e of events)records.push({time:Math.max(e.time,e.end||0),label:eventName(e),kind:'observed',eventId:e.id});
 const ids=[...new Set([selected,last.holder?.id,...last.players.filter(p=>p.team===team&&p.vx*last.direction>1).sort((a,b)=>b.speed-a.speed).slice(0,2).map(p=>p.id)])].filter(Boolean);
 for(const id of ids){let points=[];const flush=()=>{if(points.length>1)trajectories.push({id,team:points[0].team,points});points=[];};for(const f of samples){const p=f.players.find(p=>p.id===id&&!outsidePitch(p));if(!p){flush();continue;}const prior=points.at(-1);if(prior&&(f.sourceTime-prior.time>1.25||distance(prior,p)>12*(f.sourceTime-prior.time)||f.period!==prior.period))flush();points.push({x:p.x,y:p.y,time:f.sourceTime,team:p.team,period:f.period});}flush();}
 const meaningful=records.sort((a,b)=>a.time-b.time);const distinct=[];for(const r of meaningful){if(!distinct.some(p=>Math.abs(p.time-r.time)<.5&&p.label===r.label))distinct.push(r);}
 const keyframes=[{time:start,label:'Clip start',kind:'anchor'},...distinct.slice(-2),{time:end,label:'Current state',kind:'anchor'}];
 return {start,end,samples:samples.length,keyframes,records:distinct,trajectories,peak,
  summary:peak?`Peak pressure: about ${peak.value.toFixed(1)}s to ball`:'No ball-pressure estimate in this clip',limits:'1s sampling; Window changes are estimates, Tracking alone cannot confirm decoy intent. '};
}
