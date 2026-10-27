import {readFile} from 'node:fs/promises';
import path from 'node:path';

// Recorded tracking is delivered through the same incremental contract as a live feed.
// Each watermark publishes only completed observations; no final-match statistics.
export function createReplaySource(root){
 let metadata,allEvents;const chunks=new Map();
 const json=async file=>JSON.parse(await readFile(path.join(root,file),'utf8'));
 async function meta(){return metadata??=await json('manifest.json');}
 async function* packets(after,until){
  const m=await meta();
  if(!Number.isFinite(after)||!Number.isFinite(until)||after<0||until<=after||until-after>15.001||until>m.end+.001)throw new RangeError('Requests must span no more than 15s of continuous match time. ');
  allEvents??=await json('events.json');
  const frames=[];
  for(const c of m.chunks.filter(c=>c.end>after&&c.start<=until)){
   if(!chunks.has(c.file)){chunks.set(c.file,await json(c.file));if(chunks.size>2)chunks.delete(chunks.keys().next().value);}
   frames.push(...chunks.get(c.file).filter(f=>f[1]>after&&f[1]<=until));
  }
  const events=allEvents.filter(e=>Math.max(e.time,e.end||0)>after&&Math.max(e.time,e.end||0)<=until);
  let cursor=after;
  while(cursor<until){const time=Math.min(until,cursor+1);yield {type:'observations',after:cursor,time,frames:frames.filter(f=>f[1]>cursor&&f[1]<=time),events:events.filter(e=>Math.max(e.time,e.end||0)>cursor&&Math.max(e.time,e.end||0)<=time)};cursor=time;}
 }
 return {meta,packets};
}
export async function serveReplay(source,url,res){
 const after=Number(url.searchParams.get('after')),until=Number(url.searchParams.get('until'));
 const iterator=source.packets(after,until);const first=await iterator.next();
 res.writeHead(200,{'Content-Type':'application/x-ndjson; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','X-Accel-Buffering':'no'});
 const send=async packet=>{if(res.destroyed)return false;res.write(JSON.stringify(packet)+'\n');await new Promise(resolve=>setImmediate(resolve));return !res.destroyed;};
 if(!first.done)await send(first.value);
 for await(const packet of iterator)if(!await send(packet))break;
 res.end();
}
