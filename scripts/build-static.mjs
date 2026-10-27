import {cp,mkdir} from 'node:fs/promises';
// This app requires its Node streaming API. Build a runnable server package.
const root=new URL('../',import.meta.url),out=new URL('../dist/',import.meta.url);
await mkdir(out,{recursive:true});
for(const name of ['web','lib','server.mjs','match-agent.mjs','local-agent.mjs','package.json','Dockerfile'])await cp(new URL(name,root),new URL(name,out),{recursive:true});
console.log('Runnable server package written to dist/. Start with node dist/server.mjs.');
