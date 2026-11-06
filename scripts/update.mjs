import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {cryptoAsset,cryptoUniverse,stockAssets,fxRate} from './providers.mjs';
import {modelStudy,newPortfolio,waitingPortfolio,startTimeReached,portfolioStep,rankUniverse,DAY} from '../docs/core.js';
import {comparisonStep,quoteDiagnostics,experimentsFinished} from '../docs/comparison.js';
const config=JSON.parse(await readFile(new URL('../config.json',import.meta.url),'utf8'));
const dir=new URL('../docs/data/',import.meta.url);await mkdir(dir,{recursive:true});
async function read(name,fallback){try{return JSON.parse(await readFile(new URL(name,dir),'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
async function save(name,value){const target=new URL(name,dir),tmp=new URL(name+'.tmp',dir);await writeFile(tmp,JSON.stringify(value,null,2));await rename(tmp,target);}
const now=new Date().toISOString();let p=await read('portfolio.json',null);
let comparison=await read('comparison.json',{status:'waiting'});
if(p?.startedAt && Date.parse(now)>=Date.parse(p.endsAt)){
  if(p.status==='running'){p.status='completed';p.finishedAt=now;}
  if(comparison.filtered?.status==='running'){comparison.filtered.status='completed';comparison.filtered.finishedAt=now;}
  comparison.status='completed';
  if(comparison.baselineStats)comparison.baselineStats.status=p.status;
  if(comparison.filteredStats)comparison.filteredStats.status=comparison.filtered.status;
  await save('portfolio.json',p);await save('comparison.json',comparison);
}
if(experimentsFinished(p,comparison)){
  console.log('14-Tage-Lauf beendet oder gestoppt. Keine weiteren simulierten Orders.');process.exit(0);
}
const previous=await read('history-cache.json',{assets:[]});const errors=[];
const fx=await fxRate().catch(e=>{errors.push(e.message);return {usdPerEUR:previous.usdPerEUR,fxAt:previous.fxAt};});
const assets=[];
const heldCrypto=[...new Set([...(p?.positions??[]),...(comparison.filtered?.positions??[])].filter(x=>x.kind==='crypto').map(x=>x.symbol))];
let crypto=[];try{crypto=await cryptoUniverse(config,heldCrypto);}catch(e){errors.push(e.message);assets.push(...previous.assets.filter(a=>a.kind==='crypto').map(a=>({...a,status:'error'})));}
for(const def of crypto){
  try{assets.push(await cryptoAsset(def,previous.assets.find(a=>a.symbol===def.symbol)));}catch(e){errors.push(`${def.symbol}: ${e.message}`);const old=previous.assets.find(a=>a.symbol===def.symbol);assets.push({...old,symbol:def.symbol,kind:'crypto',status:'error',bars:old?.bars??[]});}
}
let stock=await stockAssets(config.stocks).catch(e=>{errors.push(e.message);return {ready:false,message:'Aktienabruf fehlgeschlagen; keine neuen Käufe.',assets:config.stocks.map(symbol=>({...previous.assets.find(a=>a.symbol===symbol),symbol,kind:'stock',status:'error'}))};});
assets.push(...stock.assets);
const market={generatedAt:now,...fx,stocksReady:stock.ready,stockMessage:stock.message,assets,errors};
market.quality=quoteDiagnostics(market,previous,now);
await save('history-cache.json',market);
// Freeze studies once generated. A new dataset/model experiment must be explicitly requested.
const studies=await read('research.json',{generatedAt:now,studies:{}});
for(const a of assets){if(a.bars?.length>=180 && !studies.studies[a.symbol]){try{studies.studies[a.symbol]={...modelStudy(a.bars),source:a.source};}catch(e){errors.push(`${a.symbol}: ${e.message}`);}}}
await save('research.json',studies);
const startRequested=process.env.START_PAPER_RUN==='true';
const fxReady=fx.usdPerEUR>0 && Date.parse(now)-Date.parse(fx.fxAt)<4*DAY;
if(!p?.startedAt && startRequested && startTimeReached(config,now) && stock.ready && fxReady && rankUniverse(assets).length===10)p=newPortfolio(config,now);
if(p?.startedAt){
  try{
    const before=p,next=portfolioStep(p,market,config,now);
    const nextComparison=comparisonStep(comparison,before,next,market,config,now,market.quality);
    p=next;comparison=nextComparison;
  }catch(e){errors.push(e.message);}
}else p=waitingPortfolio(config,now,startRequested);
await save('portfolio.json',p);
await save('comparison.json',comparison);
await save('market.json',{...market,assets:assets.map(({bars,...a})=>a)});
console.log(JSON.stringify({status:p.status,assets:assets.length,valid:assets.filter(a=>a.status==='ok').length,studies:Object.keys(studies.studies).length,errors}));
if(errors.length)process.exitCode=1;
