import {portfolioStep} from './core.js';

const fresh=(a,now)=>a.status==='ok' && a.quote?.bid>0 && a.quote?.ask>=a.quote.bid && Math.abs(Date.parse(now)-Date.parse(a.quote.at))<15*60000;
const spread=a=>(a.quote.ask-a.quote.bid)/a.quote.bid;
const terminal=p=>['completed','risk_stopped'].includes(p?.status);
export const experimentsFinished=(main,comparison)=>terminal(main) && (!comparison?.filtered || terminal(comparison.filtered));

export function quoteDiagnostics(market,previous,now){
  const events=[];
  for(const a of market.assets){
    if(!fresh(a,now)){events.push({at:now,symbol:a.symbol,type:'unavailable',message:'Kurs fehlt, ist veraltet oder nicht verwendbar.'});continue;}
    const width=spread(a),limit=a.kind==='crypto'?0.01:0.005;
    if(width>limit)events.push({at:now,symbol:a.symbol,type:'spread',value:width,message:'Großer Spread: kann Bewertung und Stop-Verkäufe beeinflussen.'});
    const old=previous?.assets?.find(x=>x.symbol===a.symbol),gap=Date.parse(a.quote.at)-Date.parse(old?.quote?.at);
    if(old?.quote?.bid>0 && old.quote.ask>=old.quote.bid && gap>0 && gap<=60*60000){
      const change=(a.quote.bid+a.quote.ask)/(old.quote.bid+old.quote.ask)-1;
      const threshold=Math.max(0.03,3*(a.metrics?.atr??0)/(a.metrics?.last||1));
      if(Math.abs(change)>threshold)events.push({at:now,symbol:a.symbol,type:'jump',value:change,message:'Auffälliger Kurssprung. Kann Marktbewegung oder Datenproblem sein; nicht unabhängig bestätigt.'});
    }
  }
  return events;
}

export function confirmEntries(previous,market,now){
  const confirmations={},checks=[],eligible=[];
  for(const a of market.assets){
    const valid=fresh(a,now)&&a.entryEligible!==false&&spread(a)<=(a.kind==='crypto'?0.01:0.005)&&(a.kind!=='stock'||market.stocksReady);
    const positive=valid && a.metrics?.m20>0 && a.metrics?.sma20>0 && a.quote.bid>a.metrics.sma20;
    let record={count:0,at:now,quoteAt:a.quote?.at??null};
    if(positive){
      const old=previous?.[a.symbol],gap=Date.parse(now)-Date.parse(old?.at);
      const newer=Date.parse(a.quote.at)>Date.parse(old?.quoteAt);
      if(old?.count>0 && gap>=0 && gap<60000)record=old;
      else if(old?.count>0 && gap>=60000 && gap<=60*60000 && newer)record={count:Math.min(2,old.count+1),at:now,quoteAt:a.quote.at};
      else if(old?.count>0 && gap>=0 && gap<=60*60000 && !newer)record=old;
      else record={count:1,at:now,quoteAt:a.quote.at};
    }
    confirmations[a.symbol]=record;
    if(positive && record.count>=2)eligible.push(a.symbol);
    checks.push({symbol:a.symbol,count:record.count,eligible:positive&&record.count>=2,reason:!valid?'Kurs, Spread oder Handelszeit ungeeignet':!positive?'Positiver 20-Tage-Trend und Kurs über SMA20 fehlen':record.count<2?'Wartet auf zweite unabhängige Beobachtung':'Kaufsignal bestätigt'});
  }
  return {confirmations,checks,eligible};
}

function startingValue(p,market,now){
  return p.cashEUR+p.positions.reduce((sum,pos)=>{
    const a=market.assets.find(x=>x.symbol===pos.symbol);
    const fee=a?.kind==='crypto'?0.001:0.0005;
    return sum+pos.quantity*(a&&fresh(a,now)?a.quote.bid*(1-fee)*(1-fee)/market.usdPerEUR:pos.markEUR);
  },0);
}
function stats(p,base,history,key){
  const trades=p.trades.slice(base.tradeCount);let peak=base.equityEUR,drawdown=0;
  for(const row of history){peak=Math.max(peak,row[key]);drawdown=Math.max(drawdown,1-row[key]/peak);}
  return {status:p.status,equityEUR:p.equityEUR,cashEUR:p.cashEUR,returnPct:p.equityEUR/base.equityEUR-1,trades:trades.length,feesEUR:trades.reduce((sum,t)=>sum+t.feeEUR,0),maxDrawdown:drawdown};
}

// A is the live paper ledger. B clones its holdings once, before this observation's actions.
// Neither ledger sees future observations. Their fills, costs and stops share portfolioStep.
export function comparisonStep(saved,before,after,market,config,now,quality=[]){
  if(!saved?.filtered && (!before?.startedAt || before.status!=='running' || before.riskStopTriggered))return saved??{status:'waiting'};
  if(saved?.updatedAt && Date.parse(now)<=Date.parse(saved.updatedAt))return saved;
  const c=saved?.filtered?structuredClone(saved):{
    version:1,startedAt:now,endsAt:before.endsAt,base:{equityEUR:startingValue(before,market,now),tradeCount:before.trades.length},
    filtered:structuredClone(before),confirmations:{},history:[],qualityHistory:[],
    rules:{m20Positive:true,aboveSMA20:true,confirmations:2,minObservationGapSeconds:60,maxObservationGapMinutes:60},
    note:'Gleiche übernommenen Positionen und Stops. Nur neue Käufe der Filter-Variante brauchen zusätzliche Signale. Ergebnisse gelten ab Vergleichsstart, nicht ab dem ursprünglichen 1.000-Euro-Start.'
  };
  const signals=confirmEntries(c.confirmations,market,now);
  c.confirmations=signals.confirmations;c.checks=signals.checks;
  c.filtered=portfolioStep(c.filtered,market,config,now,{entrySymbols:signals.eligible});
  c.history.push({at:now,baseline:after.equityEUR,filtered:c.filtered.equityEUR});
  c.qualityHistory.push({at:now,events:quality});c.latestQuality=quality;
  c.baselineStats=stats(after,c.base,c.history,'baseline');c.filteredStats=stats(c.filtered,c.base,c.history,'filtered');
  c.updatedAt=now;c.status=experimentsFinished(after,c)?'completed':'running';
  return c;
}
