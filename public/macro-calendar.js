const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateLabel=s=>new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(`${s}T12:00:00Z`));
const monthLabel=d=>new Intl.DateTimeFormat('en-US',{month:'long',year:'numeric',timeZone:'UTC'}).format(d);
export function easternDate(date=new Date()){
  const p=new Intl.DateTimeFormat('en-US',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:'America/New_York'}).formatToParts(date);
  const part=k=>p.find(x=>x.type===k).value;return `${part('year')}-${part('month')}-${part('day')}`;
}
export function calendarEvent(event){
  if(!event.time)return {...event,timeLabel:'Time not specified'};
  if(event.timezone!=='UTC')return {...event,timeLabel:`${event.time} ET`};
  const d=new Date(`${event.date}T${event.time}:00Z`);
  return {...event,date:easternDate(d),time:new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hourCycle:'h23',timeZone:'America/New_York'}).format(d),timeLabel:new Intl.DateTimeFormat('en-US',{hour:'numeric',minute:'2-digit',timeZone:'America/New_York'}).format(d)+' ET'};
}
export function monthDays(month){
  const first=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth(),1));
  const days=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+1,0)).getUTCDate();
  const start=new Date(first);start.setUTCDate(1-first.getUTCDay());
  return Array.from({length:Math.ceil((first.getUTCDay()+days)/7)*7},(_,i)=>{
    const d=new Date(start);d.setUTCDate(start.getUTCDate()+i);
    return {date:d.toISOString().slice(0,10),day:d.getUTCDate(),outside:d.getUTCMonth()!==first.getUTCMonth()};
  });
}
export function initMacroCalendar({onHistory,onHorizon}){
  const root=$('#macroCalendar');let month=new Date(`${easternDate().slice(0,7)}-01T12:00:00Z`),selected=null,feed=null,shownHorizon=null;
  function render(){
    const today=easternDate(),events=(feed?.events||[]).map(calendarEvent).filter(e=>e.date>=today).sort((a,b)=>`${a.date} ${a.time||''}`.localeCompare(`${b.date} ${b.time||''}`));
    const key=month.toISOString().slice(0,7),byDate=new Map();for(const e of events){if(!byDate.has(e.date))byDate.set(e.date,[]);byDate.get(e.date).push(e);}
    const monthEvents=events.filter(e=>e.date.startsWith(key)),agenda=selected?(byDate.get(selected)||[]):monthEvents;
    const status=feed?.error&&!feed.events?'Release schedule unavailable.':!feed?'Loading upcoming releases…':selected?'No upcoming releases on this date.':'No upcoming releases in this month’s available agency schedule.';
    root.innerHTML=`<div class="macro-calendar-top"><div><h2 class="macro-calendar-title">Economic Calendar</h2><div class="muted small">MAC.CALENDAR · Upcoming BLS + BEA releases · Times ET</div></div><div class="macro-calendar-actions"><button type="button" class="horizon-button" data-calendar-history>History</button><button type="button" class="horizon-button" data-calendar-horizon aria-label="Economic Release Calendar horizon">${esc(shownHorizon||'1Y')}</button></div></div><div class="macro-calendar-toolbar"><strong>${esc(monthLabel(month))}</strong><div class="macro-calendar-actions"><button type="button" class="horizon-button" data-calendar-month="-1" aria-label="Previous calendar month">‹</button><button type="button" class="horizon-button" data-calendar-today>Today</button><button type="button" class="horizon-button" data-calendar-month="1" aria-label="Next calendar month">›</button></div></div><div class="macro-calendar-weekdays" aria-hidden="true">${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=>`<span>${d}</span>`).join('')}</div><div class="macro-calendar-grid" role="group" aria-label="${esc(monthLabel(month))} economic releases">${monthDays(month).map(d=>{
      const releases=byDate.get(d.date)||[];return `<button type="button" class="macro-calendar-day${d.outside?' outside':''}${d.date===today?' today':''}${d.date===selected?' selected':''}${releases.length?' has-releases':''}" data-calendar-date="${d.date}" aria-pressed="${d.date===selected}" aria-label="${esc(dateLabel(d.date))} · ${releases.length} upcoming ${releases.length===1?'release':'releases'}"><span class="macro-calendar-number">${d.day}</span>${releases.slice(0,2).map(e=>`<span class="macro-calendar-release" title="${esc(e.title+' · '+e.timeLabel)}"><span class="macro-calendar-time">${esc(e.timeLabel)}</span>${esc(e.title)}</span>`).join('')}${releases.length>2?`<span class="macro-calendar-more">+${releases.length-2} more</span>`:''}</button>`;
    }).join('')}</div><div class="macro-calendar-agenda"><div class="macro-calendar-agenda-head"><strong>${selected?esc(dateLabel(selected)):'Upcoming this month'}</strong>${selected?'<button class="horizon-button" type="button" data-calendar-clear>All dates</button>':''}</div><div aria-live="polite">${agenda.length?agenda.map(e=>`<div class="macro-calendar-agenda-event"><span class="muted">${esc(dateLabel(e.date))}<span class="macro-calendar-agenda-time">${esc(e.timeLabel)}</span></span><strong>${esc(e.title)}</strong><span class="muted">${esc(e.source)}</span></div>`).join(''):`<p class="muted small macro-calendar-empty">${esc(status)}</p>`}</div>${feed?.stale?'<p class="muted small macro-calendar-empty">Showing the cached release schedule.</p>':''}${(feed?.warnings||[]).map(x=>`<p class="muted small macro-calendar-empty">${esc(x)}</p>`).join('')}</div>`;
  }
  root.addEventListener('click',e=>{
    const button=e.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-calendar-history'))return onHistory();
    if(button.hasAttribute('data-calendar-horizon'))return onHorizon(button);
    if(button.hasAttribute('data-calendar-month')){month=new Date(Date.UTC(month.getUTCFullYear(),month.getUTCMonth()+Number(button.dataset.calendarMonth),1,12));selected=null;}
    else if(button.hasAttribute('data-calendar-today')){month=new Date(`${easternDate().slice(0,7)}-01T12:00:00Z`);selected=null;}
    else if(button.hasAttribute('data-calendar-clear'))selected=null;
    else if(button.dataset.calendarDate){selected=button.dataset.calendarDate;month=new Date(`${selected.slice(0,7)}-01T12:00:00Z`);}
    render();
  });
  render();return (d,h)=>{if(feed===d&&shownHorizon===h)return;feed=d;shownHorizon=h;render();};
}
