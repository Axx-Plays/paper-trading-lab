import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,copyFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {slotAt,shouldObserve,schedulerVerified,summarize} from '../scripts/cadence.mjs';
import {restartExperiment} from '../scripts/restart.mjs';

const times=['2026-11-19T08:00:12Z','2026-11-19T08:15:20Z','2026-11-19T08:30:15Z'];
const good=()=>({runs:times.map(startedAt=>({startedAt,observationAt:startedAt,slot:slotAt(startedAt),delaySeconds:20,source:'cron-job.org',event:'workflow_dispatch',outcome:'success',processed:true}))});
test('duplicates and old slots are rejected; the next quarter-hour is eligible',()=>{
  const r={lastProcessedSlot:slotAt(times[0])};
  assert.equal(shouldObserve(r,'2026-11-19T08:14:59Z'),false);
  assert.equal(shouldObserve(r,'2026-11-19T07:45:00Z'),false);
  assert.equal(shouldObserve(r,'2026-11-19T08:15:00Z'),true);
});

async function fixture(update){
  const root=await mkdtemp(join(tmpdir(),'paper-runner-test-'));
  await mkdir(join(root,'scripts'));await mkdir(join(root,'docs','data'),{recursive:true});
  await writeFile(join(root,'package.json'),'{"type":"module"}');
  for(const file of ['runner.mjs','restart.mjs','cadence.mjs'])await copyFile(new URL('../scripts/'+file,import.meta.url),join(root,'scripts',file));
  for(const file of ['core.js','comparison.js'])await copyFile(new URL('../docs/'+file,import.meta.url),join(root,'docs',file));
  await writeFile(join(root,'config.json'),'{"initialCapitalEUR":1000,"durationDays":14}');
  await writeFile(join(root,'docs','data','portfolio.json'),'{"status":"waiting","cashEUR":1000}');
  await writeFile(join(root,'docs','data','comparison.json'),'{"status":"waiting"}');
  await writeFile(join(root,'docs','data','market.json'),'{"generatedAt":"2020-01-01T00:00:00Z","assets":[]}');
  await writeFile(join(root,'scripts','update.mjs'),`import {writeFile} from 'node:fs/promises';import {join} from 'node:path';const dir=process.env.PAPER_DATA_DIR;${update}`);
  return root;
}
const execute=root=>spawnSync(process.execPath,[join(root,'scripts','runner.mjs')],{encoding:'utf8',env:{...process.env,TRIGGER_SOURCE:'manual',GITHUB_EVENT_NAME:'workflow_dispatch'}});
test('runner publishes a coherent update and suppresses duplicate invocation',async()=>{
  const root=await fixture(`await writeFile(join(dir,'portfolio.json'),'{"status":"waiting","cashEUR":999}');await writeFile(join(dir,'market.json'),JSON.stringify({generatedAt:new Date().toISOString(),assets:[]}));`);
  const first=execute(root);assert.equal(first.status,0,first.stderr);
  const p=JSON.parse(await readFile(join(root,'docs','data','portfolio.json')));assert.equal(p.cashEUR,999);
  const second=execute(root);assert.equal(second.status,0);assert.match(second.stdout,/already processed/);
  const r=JSON.parse(await readFile(join(root,'docs','data','runtime.json')));assert.equal(r.runs.length,1);assert.equal(r.runs[0].processed,true);
});
test('runner discards a crashed partial ledger and leaves the same slot retryable',async()=>{
  const root=await fixture(`await writeFile(join(dir,'portfolio.json'),'{"status":"waiting","cashEUR":1}');process.exit(1);`);
  assert.equal(execute(root).status,1);
  const p=JSON.parse(await readFile(join(root,'docs','data','portfolio.json')));assert.equal(p.cashEUR,1000);
  const r=JSON.parse(await readFile(join(root,'docs','data','runtime.json')));assert.equal(r.runs[0].outcome,'failed');assert.equal(r.lastProcessedSlot,undefined);
});
test('reset requires three consecutive timely automatic successful observations',()=>{
  assert.equal(schedulerVerified(good()),true);
  for(const change of [{outcome:'degraded'},{outcome:'failed'},{source:'manual'},{event:'schedule'},{delaySeconds:181},{slot:slotAt(times[2])+1},{startedAt:'2026-11-19T09:00:00Z'}]){
    const r=good();Object.assign(r.runs[2],change);assert.equal(schedulerVerified(r),false,JSON.stringify(change));
  }
  assert.equal(schedulerVerified({runs:good().runs.slice(0,2)}),false);
});
test('a recovered scheduler records missing slots without inventing observations',()=>{
  const r=good();r.runs[2].slot+=4;const summary=summarize(r,times[2]);
  assert.equal(summary.missedSlots,4);assert.equal(summary.observations,3);
});
test('restart archives exact ledgers and training data, starts at 1000 and is idempotent',async()=>{
  const root=await mkdtemp(join(tmpdir(),'paper-restart-test-')),data=join(root,'docs','data');await mkdir(data,{recursive:true});
  const config={initialCapitalEUR:1000,durationDays:14};await writeFile(join(root,'config.json'),JSON.stringify(config));
  const old={equityEUR:986.59,cashEUR:98.64,trades:[{id:'retain-me'}],positions:[],status:'running'};
  await writeFile(join(data,'portfolio.json'),JSON.stringify(old));
  await writeFile(join(data,'history-cache.json'),'{"assets":["history"]}');
  assert.equal(await restartExperiment(root,'2026-11-19-test',times[0]),true);
  assert.deepEqual(JSON.parse(await readFile(join(root,'archives','before-2026-11-19-test','data','portfolio.json'))),old);
  assert.equal(await readFile(join(root,'archives','before-2026-11-19-test','data','history-cache.json'),'utf8'),'{"assets":["history"]}');
  const p=JSON.parse(await readFile(join(data,'portfolio.json')));assert.equal(p.equityEUR,1000);assert.equal(p.status,'waiting');assert.equal(p.startedAt,undefined);
  assert.equal(await restartExperiment(root,'2026-11-19-test',times[1]),false);
  await assert.rejects(()=>restartExperiment(root,'../escape',times[0]));
});
