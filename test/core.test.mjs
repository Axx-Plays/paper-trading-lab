import {test} from 'node:test';
import assert from 'node:assert/strict';
import {newPortfolio,waitingPortfolio,startTimeReached,portfolioStep,rankUniverse,modelStudy,validateBars,parseCSV,DAY} from '../docs/core.js';
const config={initialCapitalEUR:1000,durationDays:14,mediumWeight:.55,highWeight:.25,cryptoWeight:.10,reserveWeight:.10,maxDrawdown:.08};
const now='2026-11-05T16:00:00.000Z';
test('scheduled reset retains 1000 EUR and prohibits startup before 22:00 Berlin',()=>{
  const scheduled={...config,startNotBefore:'2026-11-05T21:00:00.000Z'};
  const before='2026-11-05T20:59:59.999Z',at='2026-11-05T21:00:00.000Z';
  assert.equal(startTimeReached(scheduled,before),false);
  assert.throws(()=>newPortfolio(scheduled,before));
  const p=waitingPortfolio(scheduled,before);assert.equal(p.equityEUR,1000);assert.equal(p.cashEUR,1000);assert.equal(p.trades.length,0);assert.equal(p.startedAt,undefined);assert.match(p.message,/22:00/);
  assert.equal(startTimeReached(scheduled,at),true);
  assert.equal(newPortfolio(scheduled,at).endsAt,'2026-11-19T21:00:00.000Z');
  const m=market();m.stocksReady=false;assert.equal(portfolioStep(newPortfolio(scheduled,at),m,scheduled,at).trades.length,0);
  assert.equal(startTimeReached({...config,startNotBefore:'invalid'},at),false);
});
function asset(symbol,kind,vol=.02){return {symbol,kind,status:'ok',metrics:{volatility:vol,atr:2,last:100,score:1},quote:{bid:100,ask:100.1,last:100,at:now}};}
function market(){return {usdPerEUR:1.1,fxAt:now,stocksReady:true,assets:[...Array.from({length:16},(_,i)=>asset('S'+i,'stock',.005+i*.002)),asset('BTC/USD','crypto'),asset('ETH/USD','crypto')]};}
test('1000 EUR creates eight stocks, two cryptos and a 10% reserve without borrowing',()=>{const p=portfolioStep(newPortfolio(config,now),market(),config,now);assert.equal(p.positions.length,10);assert.equal(p.positions.filter(x=>x.bucket==='medium').length,4);assert.equal(p.positions.filter(x=>x.bucket==='high').length,4);assert.ok(Math.abs(p.cashEUR-100)<1e-8);assert.ok(p.equityEUR<1000);assert.ok(p.trades.every(t=>t.feeEUR>0));});
test('repeated runs on the same day do not duplicate orders',()=>{const first=portfolioStep(newPortfolio(config,now),market(),config,now);const second=portfolioStep(first,market(),config,now);assert.equal(second.trades.length,first.trades.length);assert.equal(second.cashEUR,first.cashEUR);});
test('missing stocks cannot start an all-crypto substitute portfolio',()=>{const m=market();m.stocksReady=false;const p=portfolioStep(newPortfolio(config,now),m,config,now);assert.equal(p.positions.length,0);assert.equal(p.cashEUR,1000);});
test('trailing stop ratchets upward, never downward, and exits at the observed bid',()=>{let m=market(),p=portfolioStep(newPortfolio(config,now),m,config,now);const symbol=p.positions[0].symbol;const firstStop=p.positions[0].stopUSD;m.assets.find(a=>a.symbol===symbol).quote={bid:110,ask:110.1,at:now};p=portfolioStep(p,m,config,now);assert.ok(p.positions[0].stopUSD>firstStop);const stop=p.positions[0].stopUSD;m.assets.find(a=>a.symbol===symbol).quote={bid:109,ask:109.1,at:now};p=portfolioStep(p,m,config,now);assert.equal(p.positions[0].stopUSD,stop);m.assets.find(a=>a.symbol===symbol).quote={bid:90,ask:90.1,at:now};p=portfolioStep(p,m,config,now);assert.ok(!p.positions.find(x=>x.symbol===symbol));assert.ok(p.trades.find(t=>t.symbol===symbol && t.side==='sell').priceUSD<90);assert.equal(p.stopCooldown[symbol],now.slice(0,10));});
test('stop losses never execute using stale prices',()=>{const m=market();let p=portfolioStep(newPortfolio(config,now),m,config,now);m.assets.forEach(a=>a.quote={bid:1,ask:1.1,at:'2020-01-01'});const count=p.trades.length;p=portfolioStep(p,m,config,now);assert.equal(p.trades.length,count);});
test('14-day cutoff does not open or close positions after expiry',()=>{const p=portfolioStep(newPortfolio(config,now),market(),config,'2026-11-19T16:00:00.000Z');assert.equal(p.status,'completed');assert.equal(p.trades.length,0);});
test('portfolio drawdown closes available positions and stops new buys',()=>{const m=market();let p=portfolioStep(newPortfolio(config,now),m,config,now);m.assets.forEach(a=>a.quote={bid:75,ask:75.1,at:now});p=portfolioStep(p,m,config,now);assert.equal(p.status,'risk_stopped');assert.equal(p.positions.length,0);assert.ok(p.equityEUR<920);});
test('invalid CSV and duplicate dates are rejected',()=>{assert.throws(()=>parseCSV('date,open,high,low,close\n2025-01-01,10,9,8,10'));assert.throws(()=>validateBars([{time:1,open:1,high:1,low:1,close:1},{time:1,open:1,high:1,low:1,close:1}]));});
function series(){return Array.from({length:350},(_,i)=>{const c=100+i*.03+Math.sin(i/5)*4;return {time:Date.UTC(2024,0,1)+i*DAY,open:c,high:c+2,low:c-2,close:c+.3,volume:1000};});}
test('training cannot see changes in the final test period',()=>{const bars=series(),a=modelStudy(bars),changed=structuredClone(bars);for(let i=300;i<350;i++){for(const k of ['open','high','low','close'])changed[i][k]*=1.3;}const b=modelStudy(changed);assert.deepEqual(a.weights,b.weights);assert.deepEqual(a.means,b.means);assert.ok(Date.parse(a.trainUntil)<Date.parse(a.testFrom));assert.notEqual(a.returnPct,b.returnPct);});
test('ranking uses separate volatility halves and selects only eligible assets',()=>{const m=market();m.assets.push({...asset('BAD','crypto'),status:'error'});const list=rankUniverse(m.assets);assert.equal(new Set(list.map(a=>a.symbol)).size,10);assert.ok(!list.some(a=>a.symbol==='BAD'));assert.ok(list.filter(a=>a.bucket==='medium').every(a=>a.metrics.volatility<.021));});
test('wide bid-ask spreads prohibit new entries without blocking valuation or stop exits',()=>{const m=market();m.assets[0].quote.ask=120;const list=rankUniverse(m.assets);assert.ok(!list.some(a=>a.symbol==='S0'));let p=portfolioStep(newPortfolio(config,now),market(),config,now);m.assets.find(a=>a.symbol===p.positions[0].symbol).quote={bid:90,ask:120,at:now};const before=p.positions[0].symbol;p=portfolioStep(p,m,config,now);assert.ok(!p.positions.some(x=>x.symbol===before));});
function refresh(m,at){for(const a of m.assets)a.quote.at=at;return m;}
test('a stock stopped later the same day is replaced immediately by another in its risk group',()=>{
  const m=market();let p=portfolioStep(newPortfolio(config,now),m,config,now);
  const stopped=p.positions.find(x=>x.bucket==='medium').symbol,held=new Set(p.positions.map(x=>x.symbol)),later='2026-11-05T16:15:00.000Z';
  refresh(m,later);m.assets.find(a=>a.symbol===stopped).quote={bid:90,ask:90.1,at:later};
  p=portfolioStep(p,m,config,later);
  assert.equal(p.positions.length,10);assert.equal(p.positions.filter(x=>x.bucket==='medium').length,4);
  assert.ok(!p.positions.some(x=>x.symbol===stopped));assert.ok(p.positions.some(x=>x.bucket==='medium'&&!held.has(x.symbol)));
  const actions=p.trades.filter(t=>t.at===later);assert.deepEqual(actions.map(t=>t.side),['sell','buy']);
  const again=portfolioStep(p,m,config,later);assert.equal(again.trades.length,p.trades.length);assert.ok(p.cashEUR>=0);
});
test('crypto can be replaced outside stock hours without buying stocks or exceeding two crypto slots',()=>{
  const m=market();m.assets.push(asset('SOL/USD','crypto'));let p=portfolioStep(newPortfolio(config,now),m,config,now);
  const later='2026-11-05T23:00:00.000Z';refresh(m,later);m.stocksReady=false;
  const stopped=p.positions.find(x=>x.kind==='crypto').symbol;
  m.assets.find(a=>a.symbol===stopped).quote={bid:80,ask:80.1,at:later};
  m.assets.find(a=>a.symbol===p.positions.find(x=>x.kind==='stock').symbol).quote={bid:90,ask:90.1,at:later};
  p=portfolioStep(p,m,config,later);
  const buys=p.trades.filter(t=>t.at===later&&t.side==='buy');assert.deepEqual(buys.map(t=>t.symbol),['SOL/USD']);
  assert.equal(p.positions.filter(x=>x.kind==='crypto').length,2);assert.equal(p.positions.filter(x=>x.kind==='stock').length,7);
});
test('no replacement is forced if remaining candidates have wide spreads',()=>{
  const m=market();let p=portfolioStep(newPortfolio(config,now),m,config,now);const held=new Set(p.positions.map(x=>x.symbol));
  for(const a of m.assets)if(!held.has(a.symbol))a.quote.ask=120;
  const stopped=p.positions[0].symbol;m.assets.find(a=>a.symbol===stopped).quote={bid:90,ask:90.1,at:now};
  p=portfolioStep(p,m,config,now);assert.equal(p.positions.length,9);assert.equal(p.trades.filter(t=>t.side==='buy').length,10);assert.ok(p.cashEUR>100);
});
test('an improving position is retained even when another candidate moves above it in the ranking',()=>{
  const m=market();let p=portfolioStep(newPortfolio(config,now),m,config,now);const held=p.positions[0].symbol;
  m.assets.find(a=>a.symbol===held).quote={bid:105,ask:105.1,at:now};m.assets.find(a=>!p.positions.some(x=>x.symbol===a.symbol)).metrics.score=100;
  const after=portfolioStep(p,m,config,now);assert.equal(after.trades.length,p.trades.length);assert.ok(after.positions.some(x=>x.symbol===held));
});
test('replacement respects cash reserve and legacy portfolios retain their ledger and end time',()=>{
  const m=market();let p=portfolioStep(newPortfolio(config,now),m,config,now);delete p.strategyVersion;delete p.strategyChanges;
  const original=structuredClone(p),after=portfolioStep(p,m,config,now);assert.deepEqual(after.trades,original.trades);assert.equal(after.endsAt,original.endsAt);assert.equal(after.strategyVersion,2);assert.equal(after.strategyChanges.length,1);
  m.assets.find(a=>a.symbol===p.positions[0].symbol).quote={bid:90,ask:90.1,at:now};const next=portfolioStep(after,m,config,now);
  assert.ok(next.cashEUR>=next.equityEUR*config.reserveWeight-1e-8);assert.equal(next.strategyChanges.length,1);
});
