import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCSV, transformRows, windowRows, parseICS, registerMacro } from './macro-api.js';
import { MACRO_SERIES } from './macro-series.js';
import { calendarEvent, monthDays } from './public/macro-calendar.js';

test('Calendar converts UTC releases to Eastern time and the correct date across DST',()=>{
  const summer=calendarEvent({date:'2026-10-09',time:'00:30',timezone:'UTC',title:'Release'});
  assert.equal(summer.date,'2026-10-08');assert.equal(summer.time,'20:30');assert.equal(summer.timeLabel,'8:30 PM ET');
  const winter=calendarEvent({date:'2026-12-04',time:'13:30',timezone:'UTC',title:'Release'});
  assert.equal(winter.date,'2026-12-04');assert.equal(winter.time,'08:30');
  assert.equal(calendarEvent({date:'2026-10-09',time:'08:30',timezone:'America/New_York'}).timeLabel,'08:30 ET');
});
test('Calendar lays out complete weeks, including leap February and six-week months',()=>{
  const leap=monthDays(new Date('2024-02-01T12:00:00Z'));
  assert.equal(leap.length%7,0);assert.equal(leap.filter(x=>!x.outside).length,29);assert.equal(new Date(leap[0].date+'T12:00:00Z').getUTCDay(),0);
  assert.equal(monthDays(new Date('2026-08-01T12:00:00Z')).length,42);
});

test('CSV preserves zero and negative observations and skips missing values',()=>{
  assert.deepEqual(parseCSV('observation_date,X\n2025-01-01,0\n2025-01-02,.\n2025-01-03,-1.5\n2025-01-04,\n'),[{date:'2025-01-01',value:0},{date:'2025-01-03',value:-1.5}]);
});
test('Inflation compares the same month last year rather than twelve surviving rows',()=>{
  const rows=[{date:'2024-01-01',value:100},{date:'2024-03-01',value:120},{date:'2025-01-01',value:103},{date:'2025-02-01',value:105}];
  const actual=transformRows(rows,{transform:'yoy'});assert.equal(actual.length,1);assert.equal(actual[0].date,'2025-01-01');assert.ok(Math.abs(actual[0].value-3)<1e-10);
});
test('Payrolls display jobs gained or lost, preserving negative months',()=>{
  assert.deepEqual(transformRows([{date:'2025-01-01',value:1000},{date:'2025-02-01',value:990}],{transform:'diff'}),[{date:'2025-02-01',value:-10}]);
});
test('Short horizons never manufacture daily releases from monthly observations',()=>{
  const rows=[{date:'2025-01-01',value:3},{date:'2025-02-01',value:2.9}],now=new Date('2025-03-20T12:00:00Z');
  const win=windowRows(rows,'1D',now);assert.equal(win.noNewObservation,true);assert.deepEqual(win.points,[rows[1]]);assert.equal(win.baseline.date,'2025-02-01');
  const month=windowRows(rows,'3M',now);assert.equal(month.noNewObservation,false);assert.equal(month.points.length,2);
});
test('Calendar unfolds lines, preserves Eastern time, and excludes cancellations',()=>{
  const input='BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nDTSTART;TZID=US-Eastern:20261009T083000\r\nSUMMARY:Employment Situation\r\n continued\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nDTSTART:20261010T100000Z\r\nSUMMARY:Cancelled\r\nSTATUS:CANCELLED\r\nEND:VEVENT\r\nEND:VCALENDAR';
  assert.deepEqual(parseICS(input,'BLS','https://www.bls.gov/schedule/'),[{date:'2026-10-09',time:'08:30',timezone:'America/New_York',title:'Employment Situationcontinued',source:'BLS',sourceUrl:'https://www.bls.gov/schedule/'}]);
});
test('Catalog covers every requested item and Treasury maturity without ticker collisions',()=>{
  assert.equal(MACRO_SERIES.length,32);assert.equal(new Set(MACRO_SERIES.map(x=>x.symbol)).size,32);
  assert.deepEqual(MACRO_SERIES.filter(x=>x.number).map(x=>x.number),Array.from({length:25},(_,i)=>i+1).filter(n=>n!==22&&n!==23));
  for(const s of ['UST.1M','UST.3M','UST.6M','UST.1Y','UST.2Y','UST.5Y','UST.10Y','UST.30Y','UST.10-2'])assert.ok(MACRO_SERIES.find(x=>x.symbol===s));
});
test('API rejects unknown symbols and invalid horizons before reaching providers',async()=>{
  const handlers=new Map();registerMacro({get:(path,fn)=>handlers.set(path,fn)});
  const call=async(params,query)=>{let status=200,body;const res={status:n=>(status=n,res),json:j=>(body=j,res),set:()=>res};await handlers.get('/api/macro/series/:symbol')({params,query},res);return {status,body};};
  assert.equal((await call({symbol:'FAKE'},{horizon:'1Y'})).status,404);
  for(const symbol of ['MAC.PMIMFG','MAC.PMISVC'])assert.equal((await call({symbol},{horizon:'1Y'})).status,404);
  assert.equal((await call({symbol:'MAC.CPI'},{horizon:'BAD'})).status,400);
});
