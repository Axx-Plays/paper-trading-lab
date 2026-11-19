export const INTERVAL_MS=15*60*1000;
export const slotAt=now=>Math.floor(Date.parse(now)/INTERVAL_MS);

export function shouldObserve(runtime,now){
  return !Number.isFinite(runtime?.lastProcessedSlot)||slotAt(now)>runtime.lastProcessedSlot;
}

// Only automatically dispatched observations count, not manual test requests.
export function schedulerVerified(runtime){
  const rows=(runtime?.runs??[]).filter(r=>r.source==='cron-job.org'&&r.event==='workflow_dispatch').slice(-3);
  if(rows.length!==3||rows.some(r=>r.outcome!=='success'||r.delaySeconds>180))return false;
  return rows.slice(1).every((r,i)=>r.slot===rows[i].slot+1 &&
    Date.parse(r.startedAt)-Date.parse(rows[i].startedAt)>=12*60000 &&
    Date.parse(r.startedAt)-Date.parse(rows[i].startedAt)<=18*60000);
}

export function summarize(runtime,now){
  const rows=runtime.runs??[],processed=rows.filter(r=>r.processed);
  const last=processed.at(-1);
  return {intervalMinutes:15,lastAttemptAt:runtime.lastAttemptAt??null,lastObservationAt:last?.observationAt??null,
    lastOutcome:rows.at(-1)?.outcome??null,observations:processed.length,
    missedSlots:processed.slice(1).reduce((n,r,i)=>n+Math.max(0,r.slot-processed[i].slot-1),0),
    schedulerVerified:schedulerVerified(runtime),checkedAt:now};
}
