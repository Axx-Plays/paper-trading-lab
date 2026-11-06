import {readFile,appendFile} from 'node:fs/promises';
import {experimentsFinished} from '../docs/comparison.js';
const p=JSON.parse(await readFile(new URL('../docs/data/portfolio.json',import.meta.url),'utf8'));
let comparison=null;
try{comparison=JSON.parse(await readFile(new URL('../docs/data/comparison.json',import.meta.url),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
const stop=experimentsFinished(p,comparison);
if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`stop=${stop}\n`);
console.log(JSON.stringify({status:p.status,startedAt:p.startedAt,endsAt:p.endsAt,stop}));
