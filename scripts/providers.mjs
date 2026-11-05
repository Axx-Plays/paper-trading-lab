import {indicators,validateBars,DAY} from '../docs/core.js';
export async function json(url,headers={}) {
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw new Error(`Datenanbieter: HTTP ${response.status} (${new URL(url).hostname})`);
  return response.json();
}
export async function fxRate() {
  const r=await fetch('https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml',{signal:AbortSignal.timeout(25000)});
  if(!r.ok)throw new Error(`EZB: HTTP ${r.status}`);
  const xml=await r.text(),rate=xml.match(/currency=['"]USD['"]\s+rate=['"]([\d.]+)['"]/),date=xml.match(/time=['"]([\d-]+)['"]/);
  if(!rate || !date)throw new Error('EZB-Referenzkurs nicht lesbar.');
  return {usdPerEUR:Number(rate[1]),fxAt:`${date[1]}T00:00:00Z`};
}
export async function cryptoUniverse(config, held=[]) {
  const [pairs,tickers]=await Promise.all([json('https://api.kraken.com/0/public/AssetPairs'),json('https://api.kraken.com/0/public/Ticker')]);
  if(pairs.error?.length || tickers.error?.length)throw Error('Kraken-Universum nicht verfügbar.');
  const excluded=new Set(['USDT','USDC','USDG','USDE','USDD','USD1','USDS','PYUSD','DAI','TUSD','FDUSD','USDP','GUSD','RLUSD','EUR','EURC','GBP','CHF','CAD','JPY','AUD','PAXG','XAUT','UST','USTC']);
  const defs=Object.entries(pairs.result).flatMap(([id,p])=>{
    const [base,quote]=(p.wsname??'').split('/');const t=tickers.result[id]??tickers.result[p.altname];
    if(quote!=='USD'||!t||p.status!=='online'||excluded.has(base)||/[.]/.test(base)||base.endsWith('x'))return [];
    const volume=Number(t.v[1])*Number(t.p[1]),symbol=(base==='XBT'?'BTC':base)+'/USD';
    if(!Number.isFinite(volume)||volume<config.minCryptoDailyVolumeUSD)return [];
    return [{pair:p.altname,symbol,volume,ticker:t}];
  }).sort((a,b)=>b.volume-a.volume);
  const selected=defs.slice(0,config.maxCryptoCandidates);
  // Continue valuing held assets even if they leave the daily liquidity shortlist.
  for(const symbol of held){if(!selected.some(d=>d.symbol===symbol)){const d=defs.find(d=>d.symbol===symbol);if(d)selected.push(d);}}
  return selected;
}
export async function cryptoAsset(def,previous) {
  const base='https://api.kraken.com/0/public/';
  let bars=previous?.bars;
  const yesterday=Math.floor(Date.now()/DAY)*DAY-DAY;
  if(!bars?.length || bars.at(-1).time<yesterday){
    const ohlc=await json(`${base}OHLC?pair=${def.pair}&interval=1440`);
    if(ohlc.error?.length)throw new Error(ohlc.error.join(', '));
    const rows=Object.entries(ohlc.result).find(([k])=>k!=='last')?.[1];
    if(!Array.isArray(rows))throw new Error('Kraken: Kursreihe fehlt.');
    bars=validateBars(rows.slice(0,-1).map(r=>({time:r[0]*1000,open:r[1],high:r[2],low:r[3],close:r[4],volume:r[6]})));
  }
  const t=def.ticker;
  return {symbol:def.symbol,kind:'crypto',source:'Kraken Public API',status:bars.length>=180?'ok':'insufficient',dailyVolumeUSD:def.volume,bars,metrics:indicators(bars),quote:{bid:Number(t.b[0]),ask:Number(t.a[0]),last:Number(t.c[0]),at:new Date().toISOString()}};
}
export async function stockAssets(symbols) {
  const key=process.env.ALPACA_API_KEY,secret=process.env.ALPACA_SECRET_KEY;
  if(!key || !secret)return {assets:symbols.map(symbol=>({symbol,kind:'stock',status:'unconfigured',bars:[]})),ready:false,message:'Alpaca-Paper-Schlüssel fehlen. Aktiencharts sind separat verfügbar.'};
  const headers={'APCA-API-KEY-ID':key,'APCA-API-SECRET-KEY':secret};
  const start=new Date(Date.now()-900*DAY).toISOString(),end=new Date(Date.now()-20*60000).toISOString();
  const all={}, names=symbols.join(',');let page;
  do {
    const url=new URL('https://data.alpaca.markets/v2/stocks/bars');
    for(const [k,v] of Object.entries({symbols:names,timeframe:'1Day',start,end,adjustment:'all',feed:'iex',limit:'10000',sort:'asc',...(page?{page_token:page}:{})}))url.searchParams.set(k,v);
    const data=await json(url,headers);
    for(const [s,b] of Object.entries(data.bars??{}))all[s]=[...(all[s]??[]),...b];
    page=data.next_page_token;
  }while(page);
  const [q,clock]=await Promise.all([json(`https://data.alpaca.markets/v2/stocks/quotes/latest?symbols=${names}&feed=iex`,headers),json('https://paper-api.alpaca.markets/v2/clock',headers)]);
  const today=new Date().toLocaleDateString('en-CA',{timeZone:'America/New_York'});
  const assets=symbols.map(symbol=>{
    const bars=validateBars((all[symbol]??[]).filter(b=>b.t.slice(0,10)<today).map(b=>({time:Date.parse(b.t),open:b.o,high:b.h,low:b.l,close:b.c,volume:b.v})));
    const quote=q.quotes?.[symbol];
    const valid=quote && quote.bp>0 && quote.ap>=quote.bp && Date.now()-Date.parse(quote.t)<15*60000;
    return {symbol,kind:'stock',source:'Alpaca IEX',status:valid&&bars.length>=180?'ok':'stale',bars,metrics:indicators(bars),quote:quote?{bid:quote.bp,ask:quote.ap,last:(quote.ap+quote.bp)/2,at:quote.t}:null};
  });
  // Rank only when the entire configured universe has valid observations; no hidden missing-data bias.
  return {assets,ready:clock.is_open && assets.every(a=>a.status==='ok'),message:!clock.is_open?'US-Börse geschlossen.':assets.every(a=>a.status==='ok')?'Aktien-Datenanbindung bereit.':'Einige IEX-Kurse sind zu alt oder fehlen. Neue Käufe warten.'};
}
