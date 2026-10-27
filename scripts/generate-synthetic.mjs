import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {createSimulation,stepSimulation} from '../web/situation-model.js';

// Only coordinates and event observations cross into the replay/analysis pipeline.
// No authored pressure, route score, control probability or ability is exported.
export function generateSynthetic({seed=7,duration=600}={}) {
 let state=createSimulation(seed),pendingPass=null,lastEventTime=-1,eventId=0;
 const playerId=p=>{const [team,n]=p.split('-');return 'Player'+(team==='home'?(Number(n)===1?11:Number(n)-1):Number(n)+14);};
 const roster=state.players.map(p=>({id:playerId(p.id),name:p.name,number:p.number,team:p.team,role:p.role,fictional:true}));
 const teamOf=id=>roster.find(p=>p.id===id)?.team;
 const events=[],frames=[];
 const emit=(e)=>events.push({id:'S'+String(++eventId).padStart(5,'0'),period:1,subtype:'',to:null,end:e.time,endX:e.x,endY:e.y,...e});
 for(let tick=1;tick<=Math.round(duration*5);tick++){
  // This changes the simulated team's behaviour, not the downstream predictions.
  state.press=['high','mid','low'][Math.floor(tick/450)%3];state.tempo='forward';
  state=stepSimulation(state,.2);state.time=Number((tick/5).toFixed(1));
  for(const e of state.events.filter(e=>e.time>lastEventTime+1e-6)){
   const time=Number(e.time.toFixed(3)),from=playerId(e.players[0]),to=e.players[1]?playerId(e.players[1]):null;
   if(e.type==='pass')pendingPass={type:'PASS',team:teamOf(from),from,to,time,x:e.x,y:e.y};
   else if(e.type==='receive'){
    if(pendingPass)emit({...pendingPass,to:from,end:time,endX:e.x,endY:e.y});
    pendingPass=null;
   }else if(e.type==='interception'){
    emit({type:'BALL LOST',subtype:'INTERCEPTION',team:teamOf(to),from:to,time,x:e.x,y:e.y});
    emit({type:'RECOVERY',subtype:'INTERCEPTION',team:teamOf(from),from,time,x:e.x,y:e.y});
    if(!pendingPass){emit({type:'CHALLENGE',subtype:'GROUND-WON',team:teamOf(from),from,time,x:e.x,y:e.y});emit({type:'CHALLENGE',subtype:'GROUND-LOST',team:teamOf(to),from:to,time,x:e.x,y:e.y});}
    pendingPass=null;
   }else if(e.type==='goal'||e.type==='shot'){
    emit({type:'SHOT',subtype:e.type==='goal'?'ON TARGET-GOAL':'ON TARGET-SAVED',team:teamOf(from),from,time,x:e.x,y:e.y});
    const restart=playerId(state.possession);emit({type:'SET PIECE',subtype:e.type==='goal'?'KICK OFF':'GOAL KICK',team:teamOf(restart),from:restart,time:Number((time+.001).toFixed(3)),x:state.ball.x,y:state.ball.y});
   }
  }
  lastEventTime=state.events.at(-1)?.time??lastEventTime;
  frames.push([tick,state.time,1,state.ball.x,state.ball.y,...state.players.flatMap(p=>[p.x,p.y])].map((v,i)=>i<3?v:Number(v.toFixed(3))));
 }
 const meta={title:'Next Touch · Synthetic training match',synthetic:true,seed,notice:'Fictional football behaviour, generated from a seeded player simulation. Coordinates and completed events are observations of that simulation. Pressure, passing choices and movement projections are computed from the current and past observations. No real match or player-performance claims.',start:.2,end:duration,frames:frames.length,sourceHz:5,replayHz:5,pitch:[105,68],roster,eventCount:events.length,eventTypes:[...new Set(events.map(e=>e.type))],chunks:[]};
 return {meta,frames,events:events.sort((a,b)=>a.time-b.time)};
}
export async function writeSynthetic(options={}) {
 const {meta,frames,events}=generateSynthetic(options),root=new URL('../web/data/synthetic/',import.meta.url);await mkdir(root,{recursive:true});
 for(let offset=0;offset<frames.length;offset+=1500){const rows=frames.slice(offset,offset+1500),file=`tracking-${offset/1500}.json`;meta.chunks.push({file,start:rows[0][1],end:rows.at(-1)[1]});await writeFile(new URL(file,root),JSON.stringify(rows));}
 await writeFile(new URL('events.json',root),JSON.stringify(events));await writeFile(new URL('manifest.json',root),JSON.stringify(meta,null,2));
 console.log(JSON.stringify({frames:frames.length,events:events.length,types:Object.fromEntries(meta.eventTypes.map(t=>[t,events.filter(e=>e.type===t).length]))}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await writeSynthetic();
