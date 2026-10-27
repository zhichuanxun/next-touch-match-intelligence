import {trackingQuality,decisionComparison,sequenceReview} from '../web/coaching.js';
import {tacticalReading,tacticalChoices} from '../web/tactical-reading.js';
import {readFile} from 'node:fs/promises';
import {prepareData,getFrame,analyzeSnapshot,playerMetrics,matchFacts,observationsAt} from '../web/real-match.js';
import {combinationOptions} from '../web/tactical-shapes.js';

let loaded;
export function loadMatchData(){
 return loaded??=(async()=>{
  const root=new URL('../web/data/synthetic/',import.meta.url),read=name=>readFile(new URL(name,root),'utf8').then(JSON.parse);
  const meta=await read('manifest.json');
  const [events,...chunks]=await Promise.all([read('events.json'),...meta.chunks.map(c=>read(c.file))]);
  return prepareData(meta,chunks.flat(),events);
 })();
}
export function matchEvidence(data,input){
 const phase=input.phase??'match';
 if(!['pre','match','post'].includes(phase)||!Number.isFinite(input.time)||input.time<0||input.time>data.meta.end)throw Error('Invalid match time or phase. ');
 const player=data.meta.roster.find(p=>p.id===input.player);
 if(!player)throw Error('Player is not in the match roster. ');
 if(phase==='post'&&input.time<data.meta.end-.25)throw Error('Reach full time before generating a post-match report. ');
 const limits=['TrackingIDIDs are not an official registered or starting lineup; Playing roles are not verified, Individual goal and assist totals are unavailable. Missing records do not establish zero goals/Assists. ','Out-of-bounds coordinates may reflect a crossing or tracking error; Inclusion in geometry does not prove active playing eligibility, Do not infer substitution or injury. ','Seeded synthetic tracking sample; No verified individual ability, gaze or orientation, Heart rate, Injuries, official substitution eligibility or physiological truth. ','to arrive/Routes assume a shared reaction time of0.6s, Running6.5m/s, ball speed15m/sgeometric estimates, Not calibrated success probabilities; Combinations do not establish tactical intent. '];
 if(phase==='pre')return {phase,time:0,player,source:data.meta.title,roster:data.meta.roster,limits:[...limits,'Pre-match analysis must not use later outcomes. ']};
 const frame=getFrame(data,input.time),a=analyzeSnapshot(frame),m=playerMetrics(data,player.id,input.time),previous=playerMetrics(data,player.id,Math.max(0,input.time-300));
 const quality=trackingQuality(frame);if(quality.missing){a.options=[];a.pressure=[];a.nearest=null;}const comparison=decisionComparison(frame,a,data.switches),process=sequenceReview(data,input.time,input.player);
 const tactical=tacticalReading(frame,a),strategy=tacticalChoices(frame,a,data.switches);
 const event=e=>({id:e.id,time:e.time,end:e.end,team:e.team,type:e.type,subtype:e.subtype,from:e.from,to:e.to});
 const metrics=({events,...values})=>values;
 return {quality:{status:quality.status,tracked:quality.count,expectedReference:quality.expected,limitation:quality.limitation},decisionComparison:comparison,process:{start:process.start,end:process.end,keyframes:process.keyframes,records:process.records,pressurePeak:process.peak,limits:process.limits},phase,time:input.time,source:data.meta.title,player,visualization:{blue:'Home arrives first',coral:'Away arrives first',heat:'Compare each team earliest estimated arrival; Fixed team colors, Colors do not swap with possession, Not control probability'},score:frame.score,ball:frame.ball,holder:frame.holder?.id??null,dead:Boolean(frame.dead),possessionTeam:frame.team,
  selectedMetrics:{windowSeconds:300,scope:'Last 300s, not full match. Touches represent event involvement, not individual physical touches. ',current:metrics(m),wholeMatch:phase==='post'?metrics(playerMetrics(data,player.id,input.time,input.time+1)):null,previous:input.time>=600?metrics(previous):null},
  matchStatsScope:{start:0,end:input.time,meaning:'Accumulated from kickoff to the cited time, not the last 5 min'},matchStats:matchFacts(data,input.time),events:m.events.slice(-8).map(event),recentMatchEvents:observationsAt(data,input.time).slice(-4).map(event),
  positions:frame.players.map(p=>({id:p.id,team:p.team,x:p.x,y:p.y,vx:p.vx,vy:p.vy,outsidePitch:p.x<0||p.x>105||p.y<0||p.y>68})),
  estimates:{tacticalPhase:{label:strategy.phase,reason:strategy.reason,transitionEvent:strategy.transition?.id,choices:strategy.choices.map(c=>({kind:c.label,to:c.option?.id,margin:c.option?.margin,reason:c.option?undefined:c.reason})),limits:'After a regain8s and at least2forward runners indicate only a counterattack candidate, Not a confirmed tactic. '},decisionState:{holderConfirmed:Boolean(frame.holder),availablePassCount:a.options.length,combinationCount:combinationOptions(frame,a.options).length,crossingCount:tactical.crossings.length,meaning:'Pass, Two-pass links, and crosses are separate candidate sets; No crosses does not mean no passes. '},defensiveStructure:{defendingTeam:tactical.defendingTeam,boxDefenders:tactical.boxDefenders,boxAttackers:tactical.boxAttackers,notice:tactical.notice,limits:'Density uses 7mGaussian-kernel sum, measures player concentration; Not defensive ability or scoring probability. '},wideOptions:tactical.corridors.map(o=>({from:frame.holder?.id,to:o.id,margin:o.margin})),crossings:tactical.crossings,passOptions:a.options.slice(0,5).map(o=>({from:frame.holder?.id,to:o.id,player:o.id,distance:o.distance,interceptionMarginSeconds:o.margin,interpretation:o.margin<0?'Opponent may arrive first, Not a safe recommendation':'Ball arrives first, Not a success guarantee',progress:o.progress,offside:o.offside})),
   combinations:combinationOptions(frame,a.options).map(c=>({players:[c.holder.id,c.first.id,c.third.id],margin:c.margin,interpretation:c.margin<0?'An opponent may arrive first on at least one leg, Not recommended as a safe combination':'Geometrically viable candidate, Not a planned tactic',progress:c.progress})),
   pressureTarget:{kind:'ball',position:frame.ball,meaning:'Arrival at the current ball position, not arrival at the selected player'},pressure:a.pressure.slice(0,3).map(p=>({player:p.player.id,arrivalSeconds:p.time})),movementScope:frame.ball?'Off-ball candidates for the current team in possession':'Ball coordinates missing, Only player movement is known, Off-ball status cannot be confirmed',offBallRuns:a.runs.map(r=>({player:r.player.id,target:r.target,speed:r.player.speed}))},limits};
}
