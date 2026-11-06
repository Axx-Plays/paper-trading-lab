import {mkdir,copyFile,readdir} from 'node:fs/promises';
const target=new URL('../.local/site/',import.meta.url),source=new URL('../docs/',import.meta.url);
await mkdir(new URL('data/',target),{recursive:true});
for(const entry of await readdir(source,{withFileTypes:true}))if(entry.isFile())await copyFile(new URL(entry.name,source),new URL(entry.name,target));
for(const name of ['portfolio.json','market.json','research.json','comparison.json'])await copyFile(new URL('data/'+name,source),new URL('data/'+name,target));
console.log('Static dashboard prepared; full training cache excluded.');
