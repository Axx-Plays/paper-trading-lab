export const DAY = 86400000;
export const average = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export function validateBars(input) {
  if (!Array.isArray(input)) throw new Error('Keine Kursreihe.');
  const rows = input.map(b => ({time:Number(b.time),open:Number(b.open),high:Number(b.high),low:Number(b.low),close:Number(b.close),volume:Number(b.volume ?? 0)}));
  for (const b of rows) {
    if (!Object.values(b).every(Number.isFinite) || b.time <= 0 || b.low <= 0 || b.high < b.low || b.high < Math.max(b.open,b.close) || b.low > Math.min(b.open,b.close) || b.volume < 0) throw new Error('Ungültige OHLC-Kursdaten.');
  }
  rows.sort((a,b)=>a.time-b.time);
  if (new Set(rows.map(b=>b.time)).size !== rows.length) throw new Error('Doppelte Zeitstempel.');
  return rows;
}
export function indicators(bars) {
  if (bars.length < 65) return null;
  const c = bars.map(b=>b.close), last=c.at(-1);
  const returns=c.slice(-21).map((v,i,a)=>i ? v/a[i-1]-1 : null).slice(1);
  const mean=average(returns), volatility=Math.sqrt(average(returns.map(x=>(x-mean)**2)));
  const atr=average(bars.slice(-14).map((b,i)=>{const prev=bars[bars.length-15+i].close;return Math.max(b.high-b.low,Math.abs(b.high-prev),Math.abs(b.low-prev));}));
  const m20=last/c.at(-21)-1, m60=last/c.at(-61)-1;
  return {last,m20,m60,volatility,atr,sma20:average(c.slice(-20)),sma50:average(c.slice(-50)),score:(m20*0.4+m60*0.6)/Math.max(volatility,0.005)};
}
export function rankUniverse(assets) {
  const usable=assets.filter(a=>a.metrics && a.quote && a.status==='ok' && a.entryEligible!==false && (a.quote.ask-a.quote.bid)/a.quote.bid <= (a.kind==='crypto'?0.01:0.005));
  const stocks=usable.filter(a=>a.kind==='stock').sort((a,b)=>a.metrics.volatility-b.metrics.volatility || a.symbol.localeCompare(b.symbol));
  const middle=Math.floor(stocks.length/2);
  const pick=(a,n,bucket)=>a.sort((x,y)=>y.metrics.score-x.metrics.score || x.symbol.localeCompare(y.symbol)).slice(0,n).map(x=>({...x,bucket}));
  return [...pick(stocks.slice(0,middle),4,'medium'),...pick(stocks.slice(middle),4,'high'),...pick(usable.filter(a=>a.kind==='crypto'),2,'crypto')];
}
export function stopPercent(asset) {
  const ranges={medium:[0.04,0.08],high:[0.07,0.12],crypto:[0.08,0.15]};
  const [min,max]=ranges[asset.bucket];
  return clamp(2*asset.metrics.atr/asset.metrics.last,min,max);
}
export function startTimeReached(config, now) {
  return !config.startNotBefore || Date.parse(now) >= Date.parse(config.startNotBefore);
}
export function waitingPortfolio(config, now, startRequested = true) {
  const scheduled = config.startNotBefore ? new Date(config.startNotBefore).toLocaleString('de-DE', {timeZone:'Europe/Berlin',dateStyle:'short',timeStyle:'short'}) : null;
  const message = !startRequested ? 'Cloud-Start noch nicht aktiviert.' : !startTimeReached(config, now)
    ? `Start frühestens ${scheduled} Uhr (Berlin). Bis dahin bleibt das Startkapital unverändert. Danach warten Käufe auf eine geöffnete US-Börse und vollständige, handelbare Kurse.`
    : 'Startzeit erreicht. Wartet auf eine geöffnete US-Börse und vollständige, handelbare Kurse. Erst mit dem Start beginnt der 14-Tage-Test.';
  return {version:1,status:'waiting',startNotBefore:config.startNotBefore??null,initialCapitalEUR:config.initialCapitalEUR,cashEUR:config.initialCapitalEUR,equityEUR:config.initialCapitalEUR,positions:[],trades:[],decisions:[],history:[],message};
}
export function newPortfolio(config, now) {
  if (!startTimeReached(config, now)) throw new Error('Der geplante Startzeitpunkt ist noch nicht erreicht oder ungültig.');
  return {version:1,status:'running',startedAt:now,endsAt:new Date(Date.parse(now)+config.durationDays*DAY).toISOString(),initialCapitalEUR:config.initialCapitalEUR,cashEUR:config.initialCapitalEUR,equityEUR:config.initialCapitalEUR,peakEUR:config.initialCapitalEUR,positions:[],trades:[],decisions:[],history:[],lastRebalance:null,stopCooldown:{}};
}
export function portfolioStep(state, market, config, now) {
  const p=structuredClone(state), stamp=Date.parse(now), day=now.slice(0,10);
  if (p.status!=='running') return p;
  if (stamp>=Date.parse(p.endsAt)) {p.status='completed';p.finishedAt=now;return p;}
  const fx=market.usdPerEUR;
  if (!(fx>0) || stamp-Date.parse(market.fxAt)>4*DAY) throw new Error('EUR/USD-Referenzkurs fehlt oder ist zu alt.');
  const assets=market.assets.filter(a=>a.status==='ok' && a.quote?.bid>0 && a.quote?.ask>=a.quote.bid && Math.abs(stamp-Date.parse(a.quote.at))<15*60*1000);
  const bySymbol=new Map(assets.map(a=>[a.symbol,a]));
  // Liquidation value: bid less configured slippage and fees; no invented marks.
  const netPrice=a=>a.quote.bid*(1-(a.kind==='crypto'?0.001:0.0005))*(1-(a.kind==='crypto'?0.001:0.0005))/fx;
  for (const pos of p.positions) {const a=bySymbol.get(pos.symbol);if(a){pos.markEUR=netPrice(a);pos.markAt=a.quote.at;}}
  const equity=()=>p.cashEUR+p.positions.reduce((s,x)=>s+x.quantity*x.markEUR,0);
  const sell=(pos,reason)=>{
    const a=bySymbol.get(pos.symbol);if(!a)return false;
    const priceUSD=a.quote.bid*(1-(a.kind==='crypto'?0.001:0.0005));
    const feeRate=a.kind==='crypto'?0.001:0.0005, gross=pos.quantity*priceUSD/fx, fee=gross*feeRate;
    p.cashEUR+=gross-fee;
    p.trades.push({id:`${now}-${pos.symbol}-sell`,at:now,symbol:pos.symbol,side:'sell',quantity:pos.quantity,priceUSD,usdPerEUR:fx,amountEUR:gross-fee,feeEUR:fee,pnlEUR:gross-fee-pos.costEUR,reason});
    p.positions=p.positions.filter(x=>x.symbol!==pos.symbol);return true;
  };
  for (const pos of [...p.positions]) {const a=bySymbol.get(pos.symbol);if(a){pos.highWaterUSD=Math.max(pos.highWaterUSD??pos.entryUSD,a.quote.bid);pos.stopUSD=Math.max(pos.stopUSD,pos.highWaterUSD*(1-pos.stopPercent));if(a.quote.bid<=pos.stopUSD){sell(pos,'Trailing Stop ausgelöst');p.stopCooldown[pos.symbol]=day;}}}
  p.peakEUR=Math.max(p.peakEUR,equity());
  if (equity()<=p.peakEUR*(1-config.maxDrawdown) || p.riskStopTriggered) {
    p.riskStopTriggered=true;
    for(const pos of [...p.positions])sell(pos,'Depot-Verlustgrenze');
    // Keep retrying exits when a market or data feed is unavailable.
    if(!p.positions.length)p.status='risk_stopped';
  } else if(p.lastRebalance!==day && market.stocksReady) {
    const selected=rankUniverse(assets), stocks=selected.filter(a=>a.kind==='stock');
    if(stocks.length===8 && selected.filter(a=>a.kind==='crypto').length===2) {
      const wanted=new Set(selected.map(a=>a.symbol));
      for(const pos of [...p.positions])if(!wanted.has(pos.symbol))sell(pos,'Tägliches Ranking');
      const budget=equity();
      for(const a of selected) {
        if(p.positions.some(x=>x.symbol===a.symbol) || p.stopCooldown[a.symbol]===day)continue;
        const weight=a.bucket==='medium'?config.mediumWeight/4:a.bucket==='high'?config.highWeight/4:config.cryptoWeight/2;
        const allocation=Math.min(budget*weight,Math.max(0,p.cashEUR-budget*config.reserveWeight));
        if(allocation<5)continue;
        const feeRate=a.kind==='crypto'?0.001:0.0005, priceUSD=a.quote.ask*(1+feeRate), net=allocation/(1+feeRate), quantity=net*fx/priceUSD;
        const stop=stopPercent(a);
        p.cashEUR-=allocation;
        p.positions.push({symbol:a.symbol,kind:a.kind,bucket:a.bucket,quantity,entryUSD:priceUSD,highWaterUSD:priceUSD,stopUSD:priceUSD*(1-stop),stopPercent:stop,costEUR:allocation,openedAt:now,markEUR:netPrice(a),markAt:a.quote.at});
        p.trades.push({id:`${now}-${a.symbol}-buy`,at:now,symbol:a.symbol,side:'buy',quantity,priceUSD,usdPerEUR:fx,amountEUR:allocation,feeEUR:allocation-net,pnlEUR:null,reason:`Ranking · ${a.bucket}`});
      }
      p.lastRebalance=day;
      p.decisions.push({at:now,selection:selected.map(a=>({symbol:a.symbol,bucket:a.bucket,score:a.metrics.score,volatility:a.metrics.volatility})),reason:'Momentum 20/60 Tage, Risiko relativ zum Aktienuniversum'});
    }
  }
  p.equityEUR=equity();p.updatedAt=now;p.peakEUR=Math.max(p.peakEUR,p.equityEUR);
  p.history.push({at:now,equity:p.equityEUR,cash:p.cashEUR});
  return p;
}
const features=(bars,i)=>{
  const c=bars[i].close;
  return [c/bars[i-1].close-1,c/bars[i-5].close-1,c/bars[i-20].close-1,c/average(bars.slice(i-19,i+1).map(b=>b.close))-1];
};
const sigmoid=x=>1/(1+Math.exp(-clamp(x,-30,30)));
export function modelStudy(input) {
  const bars=validateBars(input);
  if(bars.length<180)throw new Error('Mindestens 180 Tageskerzen für einen getrennten Trainings- und Testzeitraum erforderlich.');
  // A signal from close t predicts the move open t+1 -> open t+2. No same-close execution.
  const samples=[];
  for(let i=20;i<bars.length-2;i++)samples.push({i,x:features(bars,i),r:bars[i+2].open/bars[i+1].open-1});
  const split=Math.floor(samples.length*0.7), train=samples.slice(0,split-2), test=samples.slice(split);
  const means=[0,1,2,3].map(j=>average(train.map(s=>s.x[j])));
  const scales=means.map((m,j)=>Math.max(1e-8,Math.sqrt(average(train.map(s=>(s.x[j]-m)**2)))));
  const transform=x=>[1,...x.map((v,j)=>(v-means[j])/scales[j])];
  const weights=[0,0,0,0,0];
  for(let epoch=0;epoch<250;epoch++){
    const g=[0,0,0,0,0];
    for(const s of train){const x=transform(s.x),p=sigmoid(x.reduce((v,n,j)=>v+n*weights[j],0));for(let j=0;j<5;j++)g[j]+=(p-(s.r>0?1:0))*x[j];}
    for(let j=0;j<5;j++)weights[j]-=0.035*(g[j]/train.length+(j?0.02*weights[j]:0));
  }
  let value=1000,benchmark=1000*(1-0.002),position=0,peak=1000,drawdown=0,correct=0,trades=0;
  const curve=[];
  for(const s of test){
    const x=transform(s.x),prob=sigmoid(x.reduce((v,n,j)=>v+n*weights[j],0)),next=prob>=0.55?1:0;
    if((prob>=0.5)===(s.r>0))correct++;
    if(next!==position){value*=1-0.002;trades++;}position=next;
    value*=1+position*s.r;benchmark*=1+s.r;peak=Math.max(peak,value);drawdown=Math.max(drawdown,1-value/peak);
    curve.push({at:new Date(bars[s.i+2].time).toISOString(),equity:value,benchmark});
  }
  if(position){value*=0.998;trades++;}benchmark*=0.998;
  if(curve.length){curve.at(-1).equity=value;curve.at(-1).benchmark=benchmark;}
  drawdown=Math.max(drawdown,1-value/peak);
  return {name:'Logistische Regression · CPU',trainCount:train.length,testCount:test.length,trainUntil:new Date(bars[train.at(-1).i+2].time).toISOString(),testFrom:new Date(bars[test[0].i+1].time).toISOString(),testUntil:new Date(bars.at(-1).time).toISOString(),returnPct:value/1000-1,benchmarkPct:benchmark/1000-1,accuracy:correct/test.length,maxDrawdown:drawdown,trades,costPerSide:0.002,curve,weights,means,scales};
}
export function parseCSV(text) {
  const lines=text.replace(/^\uFEFF/,'').trim().split(/\r?\n/), sep=lines[0].includes(';')?';':',';
  const header=lines.shift().split(sep).map(x=>x.trim().toLowerCase());
  const col=name=>header.indexOf(name);
  if(!['date','open','high','low','close'].every(x=>col(x)>=0))throw new Error('CSV benötigt date,open,high,low,close und optional volume.');
  return validateBars(lines.filter(Boolean).map(line=>{const p=line.split(sep);return {time:Date.parse(p[col('date')]),open:+p[col('open')],high:+p[col('high')],low:+p[col('low')],close:+p[col('close')],volume:col('volume')<0?0:+p[col('volume')]};}));
}
