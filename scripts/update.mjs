import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {cryptoAsset,cryptoUniverse,stockAssets,fxRate} from './providers.mjs';
import {modelStudy,newPortfolio,portfolioStep,DAY} from '../docs/core.js';
const config=JSON.parse(await readFile(new URL('../config.json',import.meta.url),'utf8'));
const dir=new URL('../docs/data/',import.meta.url);await mkdir(dir,{recursive:true});
async function read(name,fallback){try{return JSON.parse(await readFile(new URL(name,dir),'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
async function save(name,value){const target=new URL(name,dir),tmp=new URL(name+'.tmp',dir);await writeFile(tmp,JSON.stringify(value,null,2));await rename(tmp,target);}
const now=new Date().toISOString();let p=await read('portfolio.json',null);
if(p?.startedAt && (p.status!=='running' || Date.parse(now)>=Date.parse(p.endsAt))){
  if(p.status==='running'){p.status='completed';p.finishedAt=now;await save('portfolio.json',p);}
  console.log('14-Tage-Lauf beendet oder gestoppt. Keine weiteren simulierten Orders.');process.exit(0);
}
const previous=await read('history-cache.json',{assets:[]});const errors=[];
const fx=await fxRate().catch(e=>{errors.push(e.message);return {usdPerEUR:previous.usdPerEUR,fxAt:previous.fxAt};});
const assets=[];
let crypto=[];try{crypto=await cryptoUniverse(config,p?.positions?.filter(x=>x.kind==='crypto').map(x=>x.symbol)??[]);}catch(e){errors.push(e.message);assets.push(...previous.assets.filter(a=>a.kind==='crypto').map(a=>({...a,status:'error'})));}
for(const def of crypto){
  try{assets.push(await cryptoAsset(def,previous.assets.find(a=>a.symbol===def.symbol)));}catch(e){errors.push(`${def.symbol}: ${e.message}`);const old=previous.assets.find(a=>a.symbol===def.symbol);assets.push({...old,symbol:def.symbol,kind:'crypto',status:'error',bars:old?.bars??[]});}
}
let stock=await stockAssets(config.stocks).catch(e=>{errors.push(e.message);return {ready:false,message:'Aktienabruf fehlgeschlagen; keine neuen Käufe.',assets:config.stocks.map(symbol=>({...previous.assets.find(a=>a.symbol===symbol),symbol,kind:'stock',status:'error'}))};});
assets.push(...stock.assets);
const market={generatedAt:now,...fx,stocksReady:stock.ready,stockMessage:stock.message,assets,errors};
await save('history-cache.json',market);
// Freeze studies once generated. A new dataset/model experiment must be explicitly requested.
const studies=await read('research.json',{generatedAt:now,studies:{}});
for(const a of assets){if(a.bars?.length>=180 && !studies.studies[a.symbol]){try{studies.studies[a.symbol]={...modelStudy(a.bars),source:a.source};}catch(e){errors.push(`${a.symbol}: ${e.message}`);}}}
await save('research.json',studies);
const startRequested=process.env.START_PAPER_RUN==='true';
const fxReady=fx.usdPerEUR>0 && Date.parse(now)-Date.parse(fx.fxAt)<4*DAY;
if(!p?.startedAt && startRequested && stock.ready && fxReady && assets.filter(a=>a.kind==='crypto'&&a.status==='ok').length>=2)p=newPortfolio(config,now);
if(p?.startedAt){
  try{p=portfolioStep(p,market,config,now);}catch(e){errors.push(e.message);}
}else p={version:1,status:'waiting',initialCapitalEUR:config.initialCapitalEUR,cashEUR:config.initialCapitalEUR,equityEUR:config.initialCapitalEUR,positions:[],trades:[],decisions:[],history:[],message:startRequested?'Wartet auf vollständige Aktienkurse während der US-Handelszeit. Dann beginnt der 14-Tage-Test.':'Bereit zur Einrichtung. Cloud-Workflow startet erst mit vollständigen Kursdaten.'};
await save('portfolio.json',p);
await save('market.json',{...market,assets:assets.map(({bars,...a})=>a)});
console.log(JSON.stringify({status:p.status,assets:assets.length,valid:assets.filter(a=>a.status==='ok').length,studies:Object.keys(studies.studies).length,errors}));
if(errors.length)process.exitCode=1;
