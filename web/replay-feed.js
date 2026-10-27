// Bounded prefetch + incremental NDJSON decoding. A stopped stream never advances the clock.
export async function readReplayWindow(after,until,onPacket,{signal,fetchImpl=fetch}={}){
 const response=await fetchImpl(`/api/replay/stream?after=${after}&until=${until}`,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Match stream connection failed, Retry to reconnect. ');
 const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',cursor=after;
 const consume=line=>{if(!line.trim())return;const p=JSON.parse(line);if(p.type!=='observations'||Math.abs(p.after-cursor)>.001||p.time<=cursor||p.time>until+.001)throw Error('Match stream sequence is discontinuous, Reception paused. ');if(p.frames.some(f=>f[1]<=p.after||f[1]>p.time)||p.events.some(e=>Math.max(e.time,e.end||0)>p.time))throw Error('Match packet contains future observations. ');onPacket(p);cursor=p.time;};
 try{while(true){const {value,done}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});let i;while((i=pending.indexOf('\n'))>=0){consume(pending.slice(0,i));pending=pending.slice(i+1);}}pending+=decoder.decode();if(pending.trim())consume(pending);if(Math.abs(cursor-until)>.001)throw Error('Match stream ended early, Retry from the last received time. ');return cursor;}
 finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
export function advanceReplay(time,elapsed,speed,available,end){return Math.min(end,available,time+Math.min(Math.max(elapsed,0),.3)*speed);}
