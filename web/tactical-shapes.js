// Display geometry from current arrival-time estimates. No stored tactical zones.
import {clamp,outsidePitch} from './real-match.js';
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const pointKey=p=>`${p.x.toFixed(4)},${p.y.toFixed(4)}`;
export function zoneContours(grid,side='own',horizon=2.5,lead=.6){
 if(!grid.length)return [];
 const xs=[...new Set(grid.map(p=>p.x))].sort((a,b)=>a-b),ys=[...new Set(grid.map(p=>p.y))].sort((a,b)=>a-b),by=new Map(grid.map(p=>[`${p.x},${p.y}`,p]));
 const value=p=>Math.min(horizon-p[side],(side==='own'?p.advantage:-p.advantage)-lead);
 const edges=new Map();
 function edge(a,b){const ka=pointKey(a),kb=pointKey(b);if(ka===kb)return;const inverse=kb+'|'+ka;if(edges.has(inverse))edges.delete(inverse);else edges.set(ka+'|'+kb,{a,b,ka,kb});}
 function triangle(points){let clipped=[];for(let i=0;i<3;i++){const a=points[i],b=points[(i+1)%3],va=value(a),vb=value(b);if(va>=0)clipped.push(a);if((va>=0)!==(vb>=0)){const t=va/(va-vb);clipped.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});}}for(let i=0;i<clipped.length;i++)edge(clipped[i],clipped[(i+1)%clipped.length]);}
 for(let y=0;y<ys.length-1;y++)for(let x=0;x<xs.length-1;x++){const a=by.get(`${xs[x]},${ys[y]}`),b=by.get(`${xs[x+1]},${ys[y]}`),c=by.get(`${xs[x+1]},${ys[y+1]}`),d=by.get(`${xs[x]},${ys[y+1]}`);if([a,b,c,d].every(Boolean)){triangle([a,b,c]);triangle([a,c,d]);}}
 const next=new Map();for(const e of edges.values()){if(!next.has(e.ka))next.set(e.ka,[]);next.get(e.ka).push(e);}const used=new Set(),loops=[];
 for(const first of edges.values()){if(used.has(first))continue;const points=[first.a];let e=first;for(let n=0;e&&n<=edges.size;n++){used.add(e);points.push(e.b);if(e.kb===first.ka)break;e=next.get(e.kb)?.find(v=>!used.has(v));}if(points.length>=4&&pointKey(points[0])===pointKey(points.at(-1)))loops.push(points);}
 return loops;
}
export function contourPath(points){return points.map((p,i)=>`${i?'L':'M'}${p.x.toFixed(2)},${p.y.toFixed(2)}`).join('')+'Z';}
const arrival=(p,q)=>.6+Math.hypot(q.x-clamp(p.x+p.vx*.6,0,105),q.y-clamp(p.y+p.vy*.6,0,68))/6.5;
function lineMargin(a,b,opponents,startTime=0){const duration=dist(a,b)/15;let margin=Infinity;for(let i=1;i<=18;i++){const t=i/18,q={x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};for(const p of opponents)margin=Math.min(margin,arrival(p,q)-startTime-duration*t);}return {margin,duration};}
// A hypothetical two-pass route. Both legs face the same current defensive snapshot.
export function combinationOptions(frame,options){if(!frame.holder||frame.dead)return [];const opponents=frame.players.filter(p=>p.team!==frame.team),ours=frame.players.filter(p=>p.team===frame.team),result=[];
 for(const first of options.filter(o=>!o.offside).slice(0,4)){
  for(const third of ours.filter(p=>p.id!==frame.holder.id&&p.id!==first.id&&!outsidePitch(p))){
   const secondTravel=dist(first.target,third)/15,dt=Math.min(first.duration+.4+secondTravel,4),target={x:clamp(third.x+third.vx*dt*.5,0,105),y:clamp(third.y+third.vy*dt*.5,0,68)};
   const defenders=opponents.map(p=>p.x*frame.direction).sort((a,b)=>b-a);if(target.x*frame.direction>Math.max(first.target.x*frame.direction,defenders[1]??Infinity)&&target.x*frame.direction>52.5*frame.direction)continue;
   const progress=(target.x-frame.ball.x)*frame.direction;if(progress<4||dist(first.target,target)<4)continue;
   const leg=lineMargin(first.target,target,opponents,first.duration+.4),margin=Math.min(first.margin,leg.margin),area=Math.abs((first.target.x-frame.ball.x)*(target.y-frame.ball.y)-(first.target.y-frame.ball.y)*(target.x-frame.ball.x))/2;
   if(area<5)continue;
   result.push({id:first.id+'-'+third.id,holder:frame.holder,first,third,target,progress,margin,secondMargin:leg.margin,duration:first.duration+.4+leg.duration,score:margin+progress*.025});
  }
 }
 return result.sort((a,b)=>b.score-a.score).slice(0,3);
}
// Only completed, linked passes from one uninterrupted possession; future outcomes excluded.
export function recentCombination(events,time,team,window=25){let chain=[];for(const e of events){if(e.time>time)break;if(e.time<time-window||Math.max(e.time,e.end||0)>time)continue;
 if(['BALL LOST','BALL OUT','SHOT','FAULT RECEIVED','SET PIECE'].includes(e.type)||e.team!==team&&['PASS','RECOVERY'].includes(e.type)){chain=[];continue;}
 if(e.type==='PASS'&&e.team===team&&e.from&&e.to&&[e.x,e.y,e.endX,e.endY].every(Number.isFinite)){if(chain.length&&chain.at(-1).to!==e.from)chain=[];chain.push(e);}}
 return chain.slice(-4);
}
// Keep data positions exact; only the ball glyph gets a leader when players cover it.
export function ballIndicator(ball,players){if(!ball)return null;const occupied=q=>players.some(p=>Math.hypot(q.x-p.x,q.y-p.y)<2.6);if(!occupied(ball))return {...ball,offset:false};
 for(const radius of [3.5,5,6.5])for(let i=0;i<16;i++){const angle=i*Math.PI/8,q={x:clamp(ball.x+Math.cos(angle)*radius,-1,106),y:clamp(ball.y+Math.sin(angle)*radius,-1,69)};if(!occupied(q))return {...q,offset:true};}
 return {x:clamp(ball.x+5,0,105),y:clamp(ball.y-5,0,68),offset:true};
}
