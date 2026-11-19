import {readFile,writeFile,mkdir,cp,rename,mkdtemp,access} from 'node:fs/promises';
import {join} from 'node:path';
import {waitingPortfolio} from '../docs/core.js';

export async function restartExperiment(root,id,now){
  if(!/^[a-z0-9][a-z0-9-]{5,60}$/.test(id))throw Error('Invalid experiment identifier');
  const data=join(root,'docs','data'),file=join(data,'portfolio.json');
  const old=JSON.parse(await readFile(file,'utf8'));
  if(old.experimentId===id)return false;
  const config=JSON.parse(await readFile(join(root,'config.json'),'utf8'));
  const archives=join(root,'archives');await mkdir(archives,{recursive:true});
  const archive=join(archives,`before-${id}`);
  try{await access(archive);throw Error('Archive already exists; refusing to overwrite or repeat reset');}catch(e){if(e.code!=='ENOENT')throw e;}
  const staging=await mkdtemp(join(archives,'.pending-'));
  await cp(data,join(staging,'data'),{recursive:true});
  await cp(join(root,'config.json'),join(staging,'config.json'));
  await writeFile(join(staging,'README.md'),`# Archived paper experiment\n\nArchived at ${now} before ${id}. Full original ledgers, quotes, daily training cache and studies retained. No retroactive trades or performance changes.\n`);
  await rename(staging,archive);
  const portfolio={...waitingPortfolio({...config,startNotBefore:now},now,true),experimentId:id,resetAt:now};
  await writeFile(file,JSON.stringify(portfolio,null,2));
  await writeFile(join(data,'comparison.json'),JSON.stringify({status:'waiting',experimentId:id},null,2));
  // Daily input cache and frozen research are retained; trading signals start fresh.
  return true;
}
