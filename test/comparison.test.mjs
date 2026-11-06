import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newPortfolio,portfolioStep} from '../docs/core.js';
import {confirmEntries,comparisonStep,quoteDiagnostics,experimentsFinished} from '../docs/comparison.js';
const config={initialCapitalEUR:1000,durationDays:14,mediumWeight:.55,highWeight:.25,cryptoWeight:.1,reserveWeight:.1,maxDrawdown:.08};
const at='2026-11-06T16:00:00.000Z',later='2026-11-06T16:15:00.000Z';
function market(time=at){return {generatedAt:time,usdPerEUR:1.1,fxAt:time,stocksReady:true,assets:[...Array.from({length:16},(_,i)=>({symbol:'S'+i,kind:'stock',status:'ok',metrics:{volatility:.005+i*.002,atr:2,last:100,score:1,m20:.1,sma20:95},quote:{bid:100,ask:100.1,at:time}})),...['BTC/USD','ETH/USD','SOL/USD'].map(symbol=>({symbol,kind:'crypto',status:'ok',metrics:{volatility:.03,atr:2,last:100,score:1,m20:.1,sma20:95},quote:{bid:100,ask:100.1,at:time}}))]};}
test('entry signals require two distinct fresh observations and reject duplicate/manual rapid checks',()=>{
  const first=confirmEntries({},market(),at);assert.equal(first.eligible.length,0);
  assert.equal(confirmEntries(first.confirmations,market(),at).eligible.length,0);
  assert.equal(confirmEntries(first.confirmations,market('2026-11-06T16:00:30Z'),'2026-11-06T16:00:30Z').eligible.length,0);
  assert.equal(confirmEntries(first.confirmations,market(later),later).eligible.length,19);
});
test('negative trend, below-average price, stale or wide quotes reset confirmation; long gaps cannot confirm',()=>{
  const first=confirmEntries({},market(),at),m=market(later);
  m.assets[0].metrics.m20=-.1;m.assets[1].metrics.sma20=110;m.assets[2].quote.at='2020-01-01';m.assets[3].quote.ask=120;
  const next=confirmEntries(first.confirmations,m,later);
  for(const a of m.assets.slice(0,4))assert.equal(next.confirmations[a.symbol].count,0);
  assert.equal(confirmEntries(first.confirmations,market('2026-11-06T18:00:00Z'),'2026-11-06T18:00:00Z').eligible.length,0);
});
test('comparison clones the same holdings without resetting the live ledger and retains inherited stops',()=>{
  const m=market();let before=portfolioStep(newPortfolio(config,at),m,config,at);const original=structuredClone(before);
  const next=portfolioStep(before,market(later),config,later),c=comparisonStep(null,before,next,market(later),config,later);
  assert.deepEqual(before,original);assert.deepEqual(c.filtered.positions,next.positions);assert.equal(c.filtered.endsAt,before.endsAt);
  assert.equal(c.base.tradeCount,10);assert.equal(c.baselineStats.trades,0);assert.equal(c.filteredStats.trades,0);
  assert.equal(c.baselineStats.returnPct,c.filteredStats.returnPct);
});
test('filtered exits execute immediately while replacement waits for confirmation; A and B use identical sell costs',()=>{
  const before=portfolioStep(newPortfolio(config,at),market(),config,at),m=market(later),stopped=before.positions[0].symbol;
  m.assets.find(a=>a.symbol===stopped).quote={bid:90,ask:90.1,at:later};
  const main=portfolioStep(before,m,config,later),c=comparisonStep(null,before,main,m,config,later);
  assert.equal(main.positions.length,10);assert.equal(c.filtered.positions.length,9);
  assert.deepEqual(main.trades.find(t=>t.side==='sell'),c.filtered.trades.find(t=>t.side==='sell'));
  assert.equal(c.baselineStats.trades,2);assert.equal(c.filteredStats.trades,1);
  const nextAt='2026-11-06T16:30:00.000Z',m2=market(nextAt);m2.assets.find(a=>a.symbol===stopped).quote={bid:90,ask:90.1,at:nextAt};
  const nextMain=portfolioStep(main,m2,config,nextAt),c2=comparisonStep(c,main,nextMain,m2,config,nextAt);
  assert.equal(c2.filtered.positions.length,10);assert.equal(c2.filteredStats.trades,2);
});
test('failure or closed stock market cannot confirm stock entries but does not block crypto confirmations',()=>{
  const first=confirmEntries({},market(),at),m=market(later);m.stocksReady=false;
  const next=confirmEntries(first.confirmations,m,later);assert.deepEqual(next.eligible,['BTC/USD','ETH/USD','SOL/USD']);
});
test('one portfolio reaching its risk limit does not stop the other; expiry completes both',()=>{
  assert.equal(experimentsFinished({status:'risk_stopped'},{filtered:{status:'running'}}),false);
  assert.equal(experimentsFinished({status:'completed'},{filtered:{status:'completed'}}),true);
  const m=market(),before=portfolioStep(newPortfolio(config,at),m,config,at);
  const c=comparisonStep(null,before,before,m,config,at),end=before.endsAt;
  const main=portfolioStep(before,market(end),config,end),done=comparisonStep(c,before,main,market(end),config,end);
  assert.equal(done.status,'completed');assert.equal(done.filtered.status,'completed');assert.equal(done.filtered.trades.length,before.trades.length);
});
test('quality diagnostics distinguish wide spreads and suspicious jumps without editing quotes or suppressing stops',()=>{
  const old=market(),m=market(later);m.assets[0].quote.ask=120;m.assets[1].quote={bid:80,ask:80.1,at:later};const copy=structuredClone(m);
  const warnings=quoteDiagnostics(m,old,later);assert.ok(warnings.some(x=>x.symbol==='S0'&&x.type==='spread'));assert.ok(warnings.some(x=>x.symbol==='S1'&&x.type==='jump'));assert.deepEqual(m,copy);
});
