import {readFile,appendFile} from 'node:fs/promises';
const p=JSON.parse(await readFile(new URL('../docs/data/portfolio.json',import.meta.url),'utf8'));
const stop=['completed','risk_stopped'].includes(p.status);
if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,`stop=${stop}\n`);
console.log(JSON.stringify({status:p.status,startedAt:p.startedAt,endsAt:p.endsAt,stop}));
