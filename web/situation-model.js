/** Local behaviour simulation and a snapshot-only tactical estimator.
 * Predictions never receive a timeline, an event result or a future frame.
 * Arrival-time idea: Friends-of-Tracking/LaurieOnTracking (Spearman-inspired).
 * This is an independent, simplified heuristic, not a calibrated pitch-control model.
 */
export const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const other=t=>t==='home'?'away':'home';
const roles=['GK','RB','LB','CB','CB','DM','RW','CM','ST','AM','LW'];
const names={home:['Eli Noor','Luca Vale','Milo Reed','Arin Sol','Theo Kade','Nico Hart','Ivo Lane','Leo Voss','Sam Rook','Finn Moss','Kai Vale'],away:['Ari West','Noah Skye','Tao Flint','Remy Hale','Owen Crest','Max Rowan','Jan Tide','Ezra Lake','Beau Lark','Rui North','Jules Grey']};
const anchors=[[5,34],[28,57],[28,11],[22,25],[22,43],[38,34],[53,59],[44,44],[63,34],[46,23],[53,9]];
export function attributes(number,role){return {passing:['DM','AM','CM'].includes(role)?83+number%8:65+number%17,maxSpeed:role==='GK'?5.3:6.2+number%5*.23,reaction:.48+(number%4)*.07};}
export function createSimulation(seed=7){
 const players=['home','away'].flatMap(team=>names[team].map((name,i)=>{const [ax,y]=anchors[i];const x=team==='home'?ax:105-ax;return {id:`${team}-${i+1}`,name,number:i+1,role:roles[i],team,x,y,vx:0,vy:0,baseX:x,baseY:y,energy:1,...attributes(i+1,roles[i])};}));
 // Initial formation only. There is no authored passing sequence or outcome.
 const pressers=players.filter(p=>p.team==='away'&&['ST','AM','RW','LW'].includes(p.role));
 const targets=[[34,53],[31,31],[34,22],[37,10]];
 pressers.forEach((p,i)=>{p.x=targets[i][0];p.y=targets[i][1];});
 const holder=players.find(p=>p.id==='home-4');
 const bench=['home','away'].flatMap(team=>[['Alex Wynn','CM'],['Robin Cole','RW'],['Jesse Park','CB'],['Morgan Lee','ST'],['Casey Fox','GK']].map(([name,role],i)=>({id:`${team}-reserve-${i}`,name,number:14+i,role,team,energy:1,...attributes(14+i,role)})));
 return {time:0,players,bench,ball:{x:holder.x+1.6,y:holder.y+1},possession:holder.id,flight:null,hold:0,press:'high',tempo:'balanced',seed:seed>>>0,events:[],score:{home:0,away:0},substitutions:[],version:0};
}
function arrival(p,q){const reaction=p.reaction??.6,rx=p.x+(p.vx||0)*reaction,ry=p.y+(p.vy||0)*reaction;return reaction+Math.max(0,Math.hypot(q.x-rx,q.y-ry)-.8)/((p.maxSpeed||6.5)*(.78+.22*(p.energy??1)));}
export function controlAt(frame,q,team){
 const a=frame.players.filter(p=>p.team===team),d=frame.players.filter(p=>p.team!==team);
 const at=Math.min(...a.map(p=>arrival(p,q))),dt=Math.min(...d.map(p=>arrival(p,q)));
 return {advantage:dt-at,attackingArrival:at,defendingArrival:dt};
}
function isOffside(frame,p,team){const sign=team==='home'?1:-1;const defs=frame.players.filter(v=>v.team!==team).map(v=>v.x*sign).sort((a,b)=>b-a);return p.x*sign>Math.max(frame.ball.x*sign,defs[1])&&p.x*sign>(team==='home'?52.5:-52.5);}
export function evaluatePass(frame,actor,receiver){
 const d=dist(actor,receiver),ballSpeed=14+actor.passing/30,t=clamp(d/ballSpeed,.3,3.5);
 const target={x:clamp(receiver.x+receiver.vx*t*.65,1,104),y:clamp(receiver.y+receiver.vy*t*.65,1,67)};
 const travel=dist(actor,target)/ballSpeed;
 let margin=Infinity,interceptor=null,interceptPoint=null;
 for(let i=1;i<=14;i++){const u=i/14,q={x:actor.x+(target.x-actor.x)*u,y:actor.y+(target.y-actor.y)*u};for(const p of frame.players){if(p.team===actor.team)continue;const m=arrival(p,q)-travel*u;if(m<margin){margin=m;interceptor=p.id;interceptPoint=q;}}}
 const space=Math.min(...frame.players.filter(p=>p.team!==actor.team).map(p=>dist(p,target)));
 const receiving=arrival(receiver,target),receivingDelay=Math.max(0,receiving-travel-.7);
 const execution=clamp(.45+actor.passing*.005-distancePenalty(d),.25,.96);
 const score=clamp(100*(1/(1+Math.exp(-2.3*(margin-.15))))*execution-15*receivingDelay,1,98);
 const offside=isOffside(frame,receiver,actor.team),progress=(target.x-actor.x)*(actor.team==='home'?1:-1);
 return {id:receiver.id,receiver,target,distance:d,travel,margin,space,offside,interceptor,interceptPoint,score:offside?0:score,progress,utility:offside?-1e4:score+progress*(frame.tempo==='forward'?1.1:.35),label:offside?'Offside position':score>=65?'Receiving candidate':score>=38?'Narrow window':'Interception risk'};
}
const distancePenalty=d=>Math.max(0,d-18)*.006;
export function analyzeFrame(frame){
 const actor=frame.players.find(p=>p.id===frame.possession),team=actor?.team||frame.flight?.team||'home';
 const nearby=frame.players.filter(p=>p.team!==team).map(p=>({player:p,time:arrival(p,frame.ball),distance:dist(p,frame.ball)})).sort((a,b)=>a.time-b.time);
 const pressure=nearby.filter(p=>p.time<2.7);
 const options=actor&&!frame.flight?frame.players.filter(p=>p.team===team&&p.id!==actor.id).map(p=>evaluatePass(frame,actor,p)).sort((a,b)=>b.utility-a.utility):[];
 const grid=[];for(let y=1.7;y<68;y+=3.4)for(let x=1.75;x<105;x+=3.5){const c=controlAt(frame,{x,y},team);grid.push({x,y,...c,safe:c.advantage>.75&&dist({x,y},frame.ball)<42,pressure:c.defendingArrival<2.1&&dist({x,y},frame.ball)<28});}
 const runs=frame.players.filter(p=>p.team===team&&p.id!==actor?.id&&p.role!=='GK').map(p=>{const speed=Math.hypot(p.vx,p.vy),q={x:clamp(p.x+p.vx*2,1,104),y:clamp(p.y+p.vy*2,1,67)};const progress=p.vx*(team==='home'?1:-1);return {player:p,target:q,speed,type:Math.abs(p.vy)>Math.abs(p.vx)*1.3?'Move wide':progress>1?'Forward run':progress<-.6?'Drop to support':'Lateral support',control:controlAt(frame,q,team).advantage};}).filter(r=>r.speed>.6).sort((a,b)=>b.speed-a.speed).slice(0,4);
 const ballX=team==='home'?frame.ball.x:105-frame.ball.x;
 return {actor,team,pressure,nearest:nearby[0],options,grid,runs,phase:frame.flight?'Pass in flight':ballX<38?'Build from back':ballX<72?'Midfield progression':'Final-third attack',safeCount:options.filter(o=>o.score>=65&&!o.offside).length};
}
function random(s){s.seed=(Math.imul(s.seed,1664525)+1013904223)>>>0;return s.seed/4294967296;}
function record(s,type,text,players=[]){s.events.push({time:s.time,type,text,players,x:s.ball.x,y:s.ball.y});if(s.events.length>200)s.events.shift();}
function restart(s,team){s.flight=null;const p=s.players.find(p=>p.team===team&&p.role==='GK');s.possession=p.id;s.ball={x:p.x+1.6,y:p.y};s.hold=0;}
export function stepSimulation(input,dt=.2){
 const s=structuredClone(input);s.time+=dt;s.version++;
 const actor=s.players.find(p=>p.id===s.possession),team=actor?.team||s.flight?.team||'home',sign=team==='home'?1:-1;
 const defense=s.players.filter(p=>p.team!==team&&p.role!=='GK').sort((a,b)=>dist(a,s.ball)-dist(b,s.ball));
 for(const p of s.players){let tx=p.x,ty=p.y;const homeSign=p.team==='home'?1:-1;
  if(s.flight?.receiver===p.id){tx=s.flight.target.x;ty=s.flight.target.y;}
  else if(p.id===s.possession&&!s.flight){tx=p.x+sign*(s.tempo==='forward'?2.4:1.0);ty=p.y;}
  else if(p.team!==team){const rank=defense.indexOf(p),n=s.press==='high'?3:s.press==='mid'?2:1;
   if(rank>=0&&rank<n){tx=s.ball.x+(actor?.vx||0)*.5;ty=s.ball.y+(actor?.vy||0)*.5;}
   else{const bx=p.team==='home'?p.baseX:105-p.baseX;const depth=s.press==='high'?20:s.press==='mid'?6:-8;tx=homeSign===1?clamp(bx+depth+s.ball.x*.10,4,84):105-clamp(bx+depth+(105-s.ball.x)*.10,4,84);ty=clamp(p.baseY+(s.ball.y-34)*.2,3,65);}
  }else if(p.role==='GK'){tx=p.baseX;ty=clamp(34+(s.ball.y-34)*.15,25,43);}
  else{const advance=(s.ball.x-(team==='home'?24:81))*sign*.40;tx=p.baseX+sign*clamp(advance,-9,26);ty=p.baseY;
   // Supporters actively choose nearby space rather than follow authored tracks.
   const probes=[{x:tx,y:ty},{x:tx-sign*5,y:ty},{x:tx+sign*6,y:ty},{x:tx,y:clamp(ty-6,4,64)},{x:tx,y:clamp(ty+6,4,64)}];
   let best=-Infinity;for(const q of probes){const free=Math.min(...defense.map(d=>dist(d,q))),value=Math.min(free,14)-dist(p,q)*.15;if(value>best){best=value;tx=q.x;ty=q.y;}}
  }
  tx=clamp(tx,2,103);ty=clamp(ty,2,66);const dx=tx-p.x,dy=ty-p.y,d=Math.hypot(dx,dy),max=p.maxSpeed*(.78+.22*p.energy)*(p.id===s.possession?.42:.85),speed=Math.min(max,d*1.4);
  const desiredX=d?dx/d*speed:0,desiredY=d?dy/d*speed:0;p.vx+=(desiredX-p.vx)*Math.min(1,dt*3);p.vy+=(desiredY-p.vy)*Math.min(1,dt*3);p.x=clamp(p.x+p.vx*dt,1,104);p.y=clamp(p.y+p.vy*dt,1,67);p.energy=clamp(p.energy-Math.hypot(p.vx,p.vy)*dt*.00012,.55,1);
 }
 if(s.flight){const f=s.flight;f.elapsed+=dt;const u=clamp(f.elapsed/f.duration,0,1);s.ball={x:f.start.x+(f.target.x-f.start.x)*u,y:f.start.y+(f.target.y-f.start.y)*u};
  const intercept=s.players.filter(p=>p.team!==f.team&&dist(p,s.ball)<1.15).sort((a,b)=>dist(a,s.ball)-dist(b,s.ball))[0];
  if(intercept){s.possession=intercept.id;s.flight=null;s.hold=0;record(s,'interception',`${intercept.name} intercepts`,[intercept.id,f.actor]);}
  else if(u===1){const r=s.players.find(p=>p.id===f.receiver);if(r&&dist(r,s.ball)<2.6){s.possession=r.id;s.hold=0;record(s,'receive',`${r.name} receives`,[r.id,f.actor]);s.flight=null;}else if(f.elapsed>f.duration+2){const winner=[...s.players].sort((a,b)=>dist(a,s.ball)-dist(b,s.ball))[0];s.possession=winner.id;s.flight=null;s.hold=0;record(s,winner.team===f.team?'receive':'interception',`${winner.name} collects the loose ball`,[winner.id,f.actor]);}}
 }else if(actor){s.hold+=dt;s.ball={x:clamp(actor.x+sign*1.6,0,105),y:clamp(actor.y+1,0,68)};const nearest=s.players.filter(p=>p.team!==team).sort((a,b)=>dist(a,actor)-dist(b,actor))[0];
  if(dist(nearest,actor)<1.3&&s.hold>.9&&random(s)<dt*.65){s.possession=nearest.id;s.hold=0;record(s,'interception',`${nearest.name} regains under pressure`,[nearest.id,actor.id]);}
  else if((actor.team==='home'?actor.x:105-actor.x)>94&&s.hold>1.2){const goal=random(s)<.24;s.score[team]+=goal?1:0;record(s,goal?'goal':'shot',`${actor.name} ${goal?'scores':'shot saved'}`,[actor.id]);restart(s,other(team));}
  else if(s.hold>2.6||s.hold>1.4&&dist(nearest,actor)<5){const options=analyzeFrame(s).options.filter(o=>!o.offside&&o.distance>5);if(options.length){const best=options[0];s.flight={actor:actor.id,receiver:best.id,team,start:{...s.ball},target:best.target,duration:best.travel,elapsed:0};s.possession=null;s.hold=0;record(s,'pass',`${actor.name} passes to ${best.receiver.name}`,[actor.id,best.id]);}}
 }
 return s;
}
export function movePlayer(frame,id,x,y){const s=structuredClone(frame),p=s.players.find(p=>p.id===id);if(!p)return s;p.x=clamp(x,1,104);p.y=clamp(y,1,67);p.vx=0;p.vy=0;p.baseX=p.x;p.baseY=p.y;if(s.possession===id)s.ball={x:clamp(p.x+(p.team==='home'?1.6:-1.6),0,105),y:clamp(p.y+1,0,68)};s.version++;return s;}
export function substitute(frame,outId,inId){const s=structuredClone(frame),out=s.players.find(p=>p.id===outId),incoming=s.bench.find(p=>p.id===inId);if(!out||!incoming||out.team!==incoming.team)throw Error('Choose an active player and substitute from the same team');if(s.flight)throw Error('Wait for a player to control the ball before substituting');const index=s.players.indexOf(out);s.players[index]={...incoming,x:out.x,y:out.y,baseX:out.baseX,baseY:out.baseY,vx:0,vy:0};s.bench=s.bench.filter(p=>p.id!==inId);if(s.possession===outId)s.possession=inId;s.substitutions.push({time:s.time,out:out.name,in:incoming.name,team:out.team});record(s,'sub',`${out.name} → ${incoming.name}`,[outId,inId]);s.version++;return s;}
