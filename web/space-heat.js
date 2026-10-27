// Heat identifies teams, independently of possession and attack direction.
export const heatColors = Object.freeze({home:'#489cfa',away:'#ef826b'});
export function spaceHeat(cell) {
 const {homeArrival,awayArrival}=cell;
 if(!Number.isFinite(homeArrival)||!Number.isFinite(awayArrival))return null;
 const advantage=awayArrival-homeArrival;
 const team=advantage>.25?'home':advantage<-.25?'away':null;
 const opacity=Math.tanh(Math.abs(advantage)/1.8)*Math.exp(-Math.min(homeArrival,awayArrival)/5)*.62;
 return {team,color:team?heatColors[team]:null,opacity:team?opacity:0};
}
export function spaceShare(grid){
 const tally={home:0,away:0,neutral:0};for(const q of grid){const h=spaceHeat(q);tally[h?.team||'neutral']++;}
 const n=grid.length||1;return {home:Math.round(tally.home/n*100),away:Math.round(tally.away/n*100),neutral:Math.round(tally.neutral/n*100)};
}
