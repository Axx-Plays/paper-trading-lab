import {modelStudy,parseCSV,rankUniverse} from './core.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const euro=x=>Number.isFinite(x)?new Intl.NumberFormat('de-DE',{style:'currency',currency:'EUR'}).format(x):'—';
const usd=x=>Number.isFinite(x)?new Intl.NumberFormat('de-DE',{style:'currency',currency:'USD',maximumFractionDigits:x<1?5:2}).format(x):'—';
const pct=x=>Number.isFinite(x)?`${x>=0?'+':''}${(x*100).toFixed(2).replace('.',',')} %`:'—';
const date=x=>x?new Date(x).toLocaleString('de-DE',{timeZone:'Europe/Berlin',dateStyle:'short',timeStyle:'short'}):'Noch kein Abruf';
const escape=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names={AAPL:'Apple',MSFT:'Microsoft',GOOGL:'Alphabet',AMZN:'Amazon',META:'Meta Platforms',NVDA:'NVIDIA',TSLA:'Tesla',AMD:'Advanced Micro Devices',AVGO:'Broadcom',NFLX:'Netflix',JPM:'JPMorgan Chase',V:'Visa',MA:'Mastercard',COST:'Costco',WMT:'Walmart',KO:'Coca-Cola',PEP:'PepsiCo',PG:'Procter & Gamble',JNJ:'Johnson & Johnson',UNH:'UnitedHealth',XOM:'ExxonMobil',HD:'Home Depot',CRM:'Salesforce',ADBE:'Adobe',ORCL:'Oracle',INTC:'Intel',QCOM:'Qualcomm',DIS:'Walt Disney',PYPL:'PayPal',UBER:'Uber',BTC:'Bitcoin',XBT:'Bitcoin',ETH:'Ethereum',SOL:'Solana',ADA:'Cardano',DOGE:'Dogecoin',XRP:'XRP',DOT:'Polkadot',LINK:'Chainlink',AVAX:'Avalanche',LTC:'Litecoin',BCH:'Bitcoin Cash',SHIB:'Shiba Inu',PEPE:'Pepe',SUI:'Sui',TRX:'TRON',XLM:'Stellar',UNI:'Uniswap',AAVE:'Aave',NEAR:'NEAR Protocol',ATOM:'Cosmos',APT:'Aptos',ARB:'Arbitrum',OP:'Optimism',INJ:'Injective',FIL:'Filecoin',ICP:'Internet Computer',ETC:'Ethereum Classic',ALGO:'Algorand',HBAR:'Hedera',RENDER:'Render',FET:'Artificial Superintelligence Alliance',BONK:'Bonk',WIF:'dogwifhat',TAO:'Bittensor',TON:'Toncoin',PAXG:'PAX Gold'};
Object.assign(names,{QNT:'Quant',NIGHT:'Midnight',XDG:'Dogecoin',ZEC:'Zcash',XMR:'Monero',HYPE:'Hyperliquid'});
const name=s=>names[s.split('/')[0]]??s.split('/')[0];
const bucket={medium:'Mittel',high:'Hoch',crypto:'Krypto'};
let state={portfolio:null,market:null,research:null},filter='all';
function chart(target,rows,keys=['equity']){
  const el=$(target);if(!rows.length){el.innerHTML='<div class="chart-empty">Noch keine Beobachtungen gespeichert</div>';return;}
  const values=rows.flatMap(r=>keys.map(k=>r[k])).filter(Number.isFinite);if(!values.length)return;
  let lo=Math.min(...values),hi=Math.max(...values),pad=Math.max((hi-lo)*0.14,hi*0.005);lo-=pad;hi+=pad;
  const w=Math.max(280,el.clientWidth),h=Math.max(160,el.clientHeight),left=46,top=12,bottom=28,plotH=h-top-bottom;
  const x=i=>left+i/Math.max(rows.length-1,1)*(w-left-12),y=v=>top+(hi-v)/(hi-lo)*plotH;
  const colors=['#73e2b1','#b1a1ed'];let svg=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="Wertentwicklung über ${rows.length} Beobachtungen"><defs><linearGradient id="fade-${el.id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#73e2b1" stop-opacity=".16"/><stop offset="100%" stop-color="#73e2b1" stop-opacity="0"/></linearGradient></defs>`;
  for(let i=0;i<4;i++){const yy=top+i/3*plotH;svg+=`<line x1="${left}" x2="${w}" y1="${yy}" y2="${yy}" stroke="#2a3945" stroke-dasharray="3 5"/><text x="0" y="${yy+4}">${Math.round(hi-i/3*(hi-lo)).toLocaleString('de-DE')}</text>`;}
  keys.forEach((key,j)=>{const points=rows.map((r,i)=>`${x(i).toFixed(1)},${y(r[key]).toFixed(1)}`).join(' ');if(j===0)svg+=`<polygon points="${left},${h-bottom} ${points} ${x(rows.length-1)},${h-bottom}" fill="url(#fade-${el.id})"/>`;svg+=`<polyline points="${points}" stroke="${colors[j]}" fill="none" stroke-width="2.2" stroke-linejoin="round"/>`;});
  for(const i of [...new Set([0,Math.floor(rows.length/2),rows.length-1])]){const label=new Date(rows[i].at).toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit'});svg+=`<text x="${x(i)}" y="${h-3}" text-anchor="${i===0?'start':i===rows.length-1?'end':'middle'}">${label}</text>`;}
  el.innerHTML=svg+'</svg>';
}
function positionCard(p){
  const value=p.quantity*p.markEUR,pnl=value-p.costEUR,stale=Date.now()-Date.parse(p.markAt)>30*60000;
  return `<article class="card position"><div class="position-header"><span class="asset-avatar ${p.kind==='crypto'?'crypto':''}">${escape(p.symbol.split('/')[0].slice(0,3))}</span><div><span class="asset-name">${escape(name(p.symbol))}</span><span class="symbol">${escape(p.symbol)}</span></div><span class="pill ${p.bucket==='high'?'amber':''}">${bucket[p.bucket]}</span></div><div class="position-value">${euro(value)}</div><div class="position-change ${pnl>=0?'positive':'negative'}">${euro(pnl)} · ${pct(pnl/p.costEUR)}</div><div class="position-details"><div><span>Eingesetzt</span>${euro(p.costEUR)}</div><div><span>Trailing Stop</span>${usd(p.stopUSD)}</div><div><span>Abstand</span>${(p.stopPercent*100).toFixed(1)} %</div></div><p class="caption">${p.quantity.toLocaleString('de-DE',{maximumFractionDigits:6})} Stück · ${stale?'Letzter verfügbarer Kurs: ':''}${date(p.markAt)}</p></article>`;
}
function render(){
  const p=state.portfolio,m=state.market;
  const statuses={waiting:'Wartet auf Start',running:'Paper-Bot aktiv',completed:'Test beendet',risk_stopped:'Verlustgrenze · gestoppt'};
  $('#bot-state').textContent=statuses[p.status]??p.status;$('#bot-state').classList.toggle('amber',p.status!=='running');
  $('#balance').textContent=euro(p.equityEUR);$('#cash').textContent=euro(p.cashEUR);$('#invested').textContent=euro(p.equityEUR-p.cashEUR);
  const change=p.equityEUR-p.initialCapitalEUR;$('#total-return').textContent=`${euro(change)} · ${pct(change/p.initialCapitalEUR)} seit Start`;$('#total-return').className=`return ${change>=0?'positive':'negative'}`;
  const age=m.generatedAt?(Date.now()-Date.parse(m.generatedAt))/60000:Infinity;
  $('#updated').textContent=`Stand: ${date(m.generatedAt)}${age>45?' · Abruf veraltet':''}`;
  $('#run-days').textContent=p.startedAt?`Tag ${Math.min(14,1+Math.floor((Date.now()-Date.parse(p.startedAt))/86400000))} / 14`:'14-Tage-Test · noch nicht gestartet';
  let message=p.status==='waiting'?p.message:p.status==='running'?`Cloud-Test läuft bis ${date(p.endsAt)}. ${m.stockMessage}`:p.status==='completed'?`Test beendet. Abschlussbewertung vom ${date(p.updatedAt)}; offene Positionen wurden eingefroren.`:'Depot-Verlustgrenze erreicht. Neue Käufe sind gesperrt.';
  if(p.riskStopTriggered&&p.positions.length)message='Verlustgrenze ausgelöst. Neue Käufe gesperrt; offene Verkäufe warten auf gültige Kurse.';
  if(m.errors?.length)message+=' Datenfehler: '+m.errors.join(' · ');
  $('#run-message').textContent=message;$('#run-message').classList.toggle('warning',p.status!=='running'||!!m.errors?.length);
  chart('#equity-chart',p.history);$('#chart-caption').textContent=p.history.length?`${p.history.length} Beobachtungen · Gebühren und geschätzte Ausführungskosten enthalten.`:'Es werden keine historischen Gewinne als Paper-Ergebnis ausgegeben.';
  const empty='<div class="empty-state"><strong>Noch keine virtuellen Käufe.</strong>Der Bot wartet auf vollständige Kurse und eine geöffnete US-Börse. Erst danach beginnt dein 14-Tage-Test.</div>';
  const preview=[...p.positions.filter(x=>x.bucket==='medium').slice(0,2),...p.positions.filter(x=>x.bucket==='high').slice(0,2),...p.positions.filter(x=>x.kind==='crypto').slice(0,2)];
  $('#overview-positions').innerHTML=p.positions.length?preview.map(positionCard).join(''):empty;$('#all-positions').innerHTML=p.positions.length?p.positions.map(positionCard).join(''):empty;
  renderMarkets();renderJournal();
  const selected=$('#study-select').value;$('#study-select').replaceChildren(...Object.keys(state.research.studies).map(symbol=>{const o=document.createElement('option');o.value=symbol;o.textContent=`${name(symbol)} · ${symbol}`;return o;}));
  if(state.research.studies[selected])$('#study-select').value=selected;renderStudy();
}
function renderMarkets(){
  const search=$('#search').value.toLowerCase();const m=state.market;
  const rows=m.assets.filter(a=>(filter==='all'||a.kind===filter)&&`${name(a.symbol)} ${a.symbol}`.toLowerCase().includes(search));
  $('#market-rows').innerHTML=rows.map(a=>`<tr><td><span class="asset-name">${escape(name(a.symbol))}</span><span class="symbol">${escape(a.symbol)} · ${escape(a.source??'Alpaca IEX')}</span></td><td>${usd(a.quote?.last??a.metrics?.last)}</td><td class="${a.metrics?.m20>=0?'positive':'negative'}">${pct(a.metrics?.m20)}</td><td>${a.metrics?(a.metrics.volatility*100).toFixed(2)+' %':'—'}</td><td><span class="pill ${a.status==='ok'?'':'amber'}">${{ok:'Kurs verfügbar',stale:'Verzögert / geschlossen',error:'Abruffehler',unconfigured:'Anbindung offen',insufficient:'Zu wenig Historie'}[a.status]??'Wartet'}</span></td></tr>`).join('')||'<tr><td colspan="5">Keine passenden Daten.</td></tr>';
  $('#market-note').textContent=`${m.assets.filter(a=>a.kind==='stock').length} Aktien · ${m.assets.filter(a=>a.kind==='crypto').length} Kryptos. Kurse in USD; Depot in EUR. EZB: 1 EUR = ${m.usdPerEUR??'—'} USD (${m.fxAt?.slice(0,10)??'offen'}). Keine garantierten Echtzeitkurse.`;
}
function stat(label,value,cls=''){return `<div class="stat"><span>${label}</span><strong class="${cls}">${value}</strong></div>`;}
function renderStudy(){
  const s=state.research.studies[$('#study-select').value];if(!s){$('#study-stats').innerHTML='';$('#study-chart').innerHTML='<div class="chart-empty">Noch kein Datensatz. CSV importieren oder Cloud-Abruf abwarten.</div>';return;}
  $('#study-stats').innerHTML=stat('Modell · Testzeitraum',pct(s.returnPct),s.returnPct>=0?'positive':'negative')+stat('Kaufen & Halten',pct(s.benchmarkPct))+stat('Größter Rückgang',pct(-s.maxDrawdown),'negative')+stat('Trainings- / Testfälle',`${s.trainCount} / ${s.testCount}`);
  chart('#study-chart',s.curve,['equity','benchmark']);$('#study-note').textContent=`Grün: Modell · Violett: Kaufen & Halten. Normierter Startwert 1.000 Einheiten, keine Euro-Prognose. Test ${s.testFrom.slice(0,10)} bis ${s.testUntil.slice(0,10)}. ${s.trades} Transaktionen, ${(s.costPerSide*100).toFixed(2)} % Kosten je Seite. Schwelle 55 %, unverändert. Keine Parameterwahl anhand dieses Tests; erneut betrachtete Testdaten sind kein unberührter Nachweis mehr.`;
}
function renderJournal(){const trades=state.portfolio.trades,closed=trades.filter(t=>t.side==='sell');$('#journal-stats').innerHTML=stat('Transaktionen',trades.length)+stat('Realisierter Gewinn / Verlust',euro(closed.reduce((s,t)=>s+t.pnlEUR,0)))+stat('Angenommene Gebühren',euro(trades.reduce((s,t)=>s+t.feeEUR,0)))+stat('Ranking-Entscheidungen',state.portfolio.decisions.length);
  $('#trade-rows').innerHTML=[...trades].reverse().map(t=>`<tr><td>${date(t.at)}</td><td><span class="asset-name">${escape(name(t.symbol))}</span><span class="symbol">${escape(t.symbol)}</span></td><td class="${t.side==='buy'?'positive':'amber-text'}">${t.side==='buy'?'Kauf':'Verkauf'}</td><td>${euro(t.amountEUR)}</td><td>${euro(t.feeEUR)}</td><td>${t.pnlEUR===null?'—':euro(t.pnlEUR)}</td><td>${escape(t.reason)}</td></tr>`).join('')||'<tr><td colspan="7">Noch keine Transaktionen. Hier erscheinen später alle simulierten Käufe und Verkäufe.</td></tr>';
}
function navigate(){let id=location.hash.slice(1)||'overview';if(!['overview','positions','markets','research','journal'].includes(id))id='overview';$$('.view').forEach(v=>v.hidden=v.id!==id);$$('[data-tab]').forEach(a=>{a.classList.toggle('active',a.dataset.tab===id);if(a.dataset.tab===id)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});$('#page-title').textContent={overview:'Super-reich-werd-Bot',positions:'Unternehmen & Kryptos.',markets:'Was die Märkte bewegt.',research:'Aus Daten lernen.',journal:'Jeder Trade zählt.'}[id];window.scrollTo(0,0);}
let cloudRevision=null,revisionCheckedAt=0;
async function load(force=false){
  const button=$('#refresh');button.disabled=true;
  try{
    const remote=location.protocol==='https:';
    if(remote && (force || !cloudRevision || Date.now()-revisionCheckedAt>=300000)){
      const response=await fetch('https://api.github.com/repos/Axx-Plays/paper-trading-lab/git/ref/heads/main',{cache:'no-store',signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw Error('Aktueller Datenstand konnte nicht geprüft werden ('+response.status+').');
      const ref=await response.json();if(!/^[a-f0-9]{40}$/.test(ref.object?.sha??''))throw Error('Ungültige Datenversion.');
      cloudRevision=ref.object.sha;revisionCheckedAt=Date.now();
    }
    const read=async f=>{
      const url=remote?'https://raw.githubusercontent.com/Axx-Plays/paper-trading-lab/'+cloudRevision+'/docs/data/'+f+'.json':'data/'+f+'.json?t='+Date.now();
      const r=await fetch(url,{cache:remote?'default':'no-store',signal:AbortSignal.timeout(20000)});
      if(!r.ok)throw Error('Datenabruf fehlgeschlagen ('+r.status+').');return r.json();
    };
    const [portfolio,market]=await Promise.all(['portfolio','market'].map(read));
    const research=state.research??await read('research');state={portfolio,market,research};render();$('#load-error').hidden=true;
  }catch(e){$('#load-error').hidden=false;$('#load-error').textContent=e.message+' Der zuletzt geladene Stand bleibt sichtbar. Bitte später erneut versuchen.';}
  finally{button.disabled=false;}
}
function download(filename,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#refresh').addEventListener('click',()=>load(true));window.addEventListener('hashchange',navigate);$('#search').addEventListener('input',()=>state.market&&renderMarkets());$('#study-select').addEventListener('change',renderStudy);
$('#market-filters').addEventListener('click',e=>{if(!e.target.dataset.filter)return;filter=e.target.dataset.filter;$$('[data-filter]').forEach(b=>b.classList.toggle('selected',b.dataset.filter===filter));renderMarkets();});
$('#export-portfolio').addEventListener('click',()=>download('paper-depot.json',JSON.stringify(state.portfolio,null,2),'application/json'));
$('#export-trades').addEventListener('click',()=>{const cols=['at','symbol','side','quantity','priceUSD','usdPerEUR','amountEUR','feeEUR','pnlEUR','reason'];const csv=[cols.join(','),...state.portfolio.trades.map(t=>cols.map(c=>'"'+String(t[c]??'').replaceAll('"','""')+'"').join(','))].join('\n');download('paper-journal.csv','\uFEFF'+csv,'text/csv;charset=utf-8');});
$('#csv-file').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>5e6)throw Error('CSV darf höchstens 5 MB groß sein.');$('#csv-status').textContent='Daten werden auf deinem Gerät getestet …';const bars=parseCSV(await f.text());if(bars.length>10000)throw Error('Maximal 10.000 Tageskerzen je Test.');const result=modelStudy(bars);state.research.studies['Eigene CSV']=result;const o=document.createElement('option');o.value='Eigene CSV';o.textContent='Eigene CSV · lokal';const existing=[...$('#study-select').options].find(o=>o.value==='Eigene CSV');if(!existing)$('#study-select').append(o);$('#study-select').value='Eigene CSV';renderStudy();$('#csv-status').textContent=`${bars.length} Kerzen geprüft. Ergebnis nur in dieser Sitzung gespeichert.`;}catch(err){$('#csv-status').textContent=err.message;}});
$('#load-stock-chart').addEventListener('click',()=>{const host=$('#tradingview');host.replaceChildren();const wrap=document.createElement('div');wrap.className='tradingview-widget-container';wrap.style.height='100%';const chart=document.createElement('div');chart.className='tradingview-widget-container__widget';chart.style.height='calc(100% - 32px)';wrap.append(chart);const credit=document.createElement('a');credit.href='https://www.tradingview.com/';credit.target='_blank';credit.rel='noopener';credit.textContent='Charts von TradingView ↗';credit.className='caption';wrap.append(credit);const script=document.createElement('script');script.src='https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';script.async=true;script.textContent=JSON.stringify({autosize:true,symbol:$('#stock-chart-select').value,interval:'D',timezone:'Europe/Berlin',theme:'dark',style:'1',locale:'de_DE',allow_symbol_change:true,calendar:false,support_host:'https://www.tradingview.com'});script.onerror=()=>{host.textContent='TradingView konnte nicht geladen werden. Bitte später erneut versuchen.';};wrap.append(script);host.append(wrap);});
window.addEventListener('hashchange',()=>{if(state.portfolio){chart('#equity-chart',state.portfolio.history);renderStudy();}});
window.addEventListener('resize',()=>{if(state.portfolio){chart('#equity-chart',state.portfolio.history);renderStudy();}});
navigate();load();setInterval(()=>{if(!document.hidden)load();},60000);
