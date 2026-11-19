import {readFile,writeFile,mkdir,mkdtemp,cp,readdir,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {slotAt,shouldObserve,schedulerVerified,summarize,INTERVAL_MS} from './cadence.mjs';
import {restartExperiment} from './restart.mjs';
import {experimentsFinished} from '../docs/comparison.js';

const root=resolve(fileURLToPath(new URL('..',import.meta.url))),dir=join(root,'docs','data');
async function read(name,fallback){try{return JSON.parse(await readFile(join(dir,name),'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
const now=new Date().toISOString(),slot=slotAt(now);
let runtime=await read('runtime.json',{version:1,runs:[]});
const config=JSON.parse(await readFile(join(root,'config.json'),'utf8'));
let p=await read('portfolio.json',null),comparison=await read('comparison.json',null);
const pending=config.nextExperimentId && p?.experimentId!==config.nextExperimentId;
if(!pending&&experimentsFinished(p,comparison)){console.log('Experiment ended. No orders.');process.exit(0);}
if(!shouldObserve(runtime,now)){console.log('This UTC quarter-hour was already processed. No duplicate observation.');process.exit(0);}
// A pending reset is armed explicitly in config. It cannot fire before a proven cadence.
if(pending&&schedulerVerified(runtime)){
  await restartExperiment(root,config.nextExperimentId,now);
  runtime={version:1,experimentId:config.nextExperimentId,verifiedAt:now,verificationRuns:runtime.runs.slice(-3),runs:[]};
}
const staged=await mkdtemp(join(tmpdir(),'paper-lab-'));
await cp(dir,staged,{recursive:true});
const result=spawnSync(process.execPath,[join(root,'scripts','update.mjs')],{
  env:{...process.env,PAPER_DATA_DIR:staged},encoding:'utf8',timeout:240000,maxBuffer:1024*1024,
});
if(result.stdout)process.stdout.write(result.stdout);
// Do not copy a partially written update after a crash or timeout.
let processed=false,observationAt=null,terminal=false;
try{
  const m=JSON.parse(await readFile(join(staged,'market.json'),'utf8'));
  const next=JSON.parse(await readFile(join(staged,'portfolio.json'),'utf8'));
  const c=JSON.parse(await readFile(join(staged,'comparison.json'),'utf8'));
  terminal=experimentsFinished(next,c);
  const published=Date.parse(m.generatedAt)>=Date.parse(now);
  if(!result.error && (result.status===0||result.status===1) && (published||terminal)){
    for(const file of await readdir(staged))if(file.endsWith('.json'))await copyFile(join(staged,file),join(dir,file));
    processed=true;observationAt=published?m.generatedAt:null;
  }
}catch{/* The failure is persisted below; prior financial state stays intact. */}
const source=['cron-job.org','manual'].includes(process.env.TRIGGER_SOURCE)?process.env.TRIGGER_SOURCE:'github-schedule';
const outcome=processed&&result.status===0?'success':processed?'degraded':'failed';
const row={slot,startedAt:now,finishedAt:new Date().toISOString(),source,event:process.env.GITHUB_EVENT_NAME??'local',
  runId:process.env.GITHUB_RUN_ID??null,delaySeconds:(Date.parse(now)-slot*INTERVAL_MS)/1000,
  outcome,processed,observationAt};
runtime.runs.push(row);runtime.lastAttemptAt=now;
if(processed)runtime.lastProcessedSlot=slot;
runtime.summary=summarize(runtime,now);
await writeFile(join(dir,'runtime.json'),JSON.stringify(runtime,null,2));
const market=await read('market.json',{});
market.runtime={...runtime.summary,verifiedAt:runtime.verifiedAt??null,
  pendingRestart:!!(config.nextExperimentId&&(await read('portfolio.json',null))?.experimentId!==config.nextExperimentId)};
await writeFile(join(dir,'market.json'),JSON.stringify(market,null,2));
console.log(JSON.stringify({outcome,slot,processed,terminal,schedulerVerified:schedulerVerified(runtime)}));
if(outcome!=='success')process.exitCode=1;
