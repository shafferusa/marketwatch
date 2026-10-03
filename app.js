const DEFAULT_WATCHLIST = ['SPY', 'QQQ', 'US2Y', 'US10Y', 'US30Y', 'USDJPY=X', 'CL=F', 'GC=F', 'NVDA', 'AMZN', 'META', 'TSLA'];
const STORAGE_KEY = 'tablet-market-watcher-symbols-v2';
const LEGACY_STORAGE_KEY = 'tablet-market-watcher-symbols-v1';
const QUOTE_REFRESH_MS = 3000;
const CHART_REFRESH_MS = 15000;

const $ = (id) => document.getElementById(id);
const els = {
  watchScreen: $('watchScreen'), chartScreen: $('chartScreen'), watchlist: $('watchlist'), emptyState: $('emptyState'),
  feedStatus: $('feedStatus'), feedDot: $('feedDot'), lastRefresh: $('lastRefresh'), settingsBtn: $('settingsBtn'),
  settingsPanel: $('settingsPanel'), closeSettings: $('closeSettings'), addForm: $('addForm'), tickerInput: $('tickerInput'),
  settingsList: $('settingsList'), emptyAddBtn: $('emptyAddBtn'), wakeBtn: $('wakeBtn'), backBtn: $('backBtn'),
  chartSymbol: $('chartSymbol'), chartFeed: $('chartFeed'), chartPrice: $('chartPrice'), chartChange: $('chartChange'),
  rangeBar: $('rangeBar'), chartCanvas: $('chartCanvas'), chartTooltip: $('chartTooltip'), chartLoader: $('chartLoader'),
  clock: $('clock'), date: $('date')
};

const ALIASES = {
  '2Y': 'US2Y', 'UST2Y': 'US2Y', '10Y': 'US10Y', 'UST10Y': 'US10Y', '30Y': 'US30Y', 'UST30Y': 'US30Y',
  'USDJPY': 'USDJPY=X', 'USD/JPY': 'USDJPY=X', 'EURUSD': 'EURUSD=X', 'EUR/USD': 'EURUSD=X',
  'GBPUSD': 'GBPUSD=X', 'GBP/USD': 'GBPUSD=X', 'WTI': 'CL=F', 'OIL': 'CL=F', 'CL': 'CL=F',
  'GOLD': 'GC=F', 'GC': 'GC=F', 'SPX': '^GSPC', 'DOW': '^DJI', 'DJI': '^DJI', 'NASDAQ': '^IXIC',
  'NDX': '^NDX', 'RUT': '^RUT', 'VIX': '^VIX'
};

let symbols = loadSymbols();
let quoteMap = new Map();
let quoteTimer = null;
let activeSymbol = null;
let activeRange = '1D';
let activeChartMeta = null;
let chartBars = [];
let chartTimer = null;
let chartAbort = null;
let wakeLock = null;
let pointerIndex = null;
let dragState = null;

function cleanTicker(value) {
  const raw = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  if (ALIASES[raw]) return ALIASES[raw];
  return raw.replace(/[^A-Z0-9.^=\-\/]/g, '').slice(0, 16);
}

function loadSymbols() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) return [...new Set(saved.map(cleanTicker).filter(Boolean))].slice(0, 30);
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
    if (Array.isArray(legacy) && legacy.length) {
      const migrated = [...new Set(legacy.map(cleanTicker).filter(Boolean))].slice(0, 30);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch {}
  return [...DEFAULT_WATCHLIST];
}

function saveSymbols() { localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols)); }

function formatValue(value, meta = {}) {
  if (!Number.isFinite(value)) return '—';
  if (meta.format === 'percent' || meta.assetType === 'rate') return `${value.toFixed(3)}%`;
  if (meta.format === 'fx' || meta.assetType === 'fx') return value >= 100 ? value.toFixed(3) : value.toFixed(5);
  if (meta.format === 'number' || meta.assetType === 'index') {
    return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
  }
  const digits = Math.abs(value) >= 1000 ? 2 : Math.abs(value) >= 1 ? 2 : 4;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: digits }).format(value);
}

function signed(value, digits = 2) {
  if (!Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function changeParts(q) {
  if (!q) return { primary: '—', detail: '—' };
  if (q.assetType === 'rate') {
    const bp = Number.isFinite(q.change) ? q.change * 100 : null;
    return { primary: Number.isFinite(bp) ? `${signed(bp, 1)} bp` : '—', detail: Number.isFinite(q.changePct) ? `${signed(q.changePct, 2)}% today` : '—' };
  }
  const primary = Number.isFinite(q.changePct) ? `${signed(q.changePct, 2)}%` : '—';
  let detail = '—';
  if (Number.isFinite(q.change)) {
    if (q.assetType === 'fx') detail = `${signed(q.change, q.price >= 100 ? 3 : 5)} today`;
    else if (q.assetType === 'index') detail = `${signed(q.change, 2)} today`;
    else detail = `${q.change > 0 ? '+' : ''}${formatValue(q.change, q)} today`;
  }
  return { primary, detail };
}

function updateClock() {
  const now = new Date();
  els.clock.textContent = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(now);
  els.date.textContent = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric' }).format(now) + ' · ET';
}

function renderWatchlist() {
  if (dragState) return;
  els.emptyState.classList.toggle('hidden', symbols.length > 0);
  els.watchlist.classList.toggle('hidden', symbols.length === 0);

  els.watchlist.innerHTML = symbols.map((symbol) => {
    const q = quoteMap.get(symbol);
    const direction = q?.change > 0 ? 'positive' : q?.change < 0 ? 'negative' : '';
    const parts = changeParts(q);
    return `
      <div class="watch-row ${q ? '' : 'skeleton'}" data-symbol="${symbol}" tabindex="0" role="button" aria-label="Open ${q?.name || symbol} chart">
        <div class="security-block">
          <div class="symbol">${q?.displaySymbol || symbol}</div>
          <div class="subtext">${q?.name || 'Loading security…'}</div>
        </div>
        <div class="price">${q ? formatValue(q.price, q) : 'Loading…'}</div>
        <div class="change ${direction}">${parts.primary}<span class="change-detail">${parts.detail}</span></div>
        <button class="drag-handle" type="button" aria-label="Drag ${q?.displaySymbol || symbol} to reorder" title="Drag to reorder">⠿</button>
      </div>`;
  }).join('');

  els.watchlist.querySelectorAll('.watch-row').forEach(row => {
    row.addEventListener('click', (e) => { if (!e.target.closest('.drag-handle')) openChart(row.dataset.symbol); });
    row.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !dragState) { e.preventDefault(); openChart(row.dataset.symbol); } });
  });
  els.watchlist.querySelectorAll('.drag-handle').forEach(handle => handle.addEventListener('pointerdown', beginDrag));
}

function beginDrag(e) {
  if (e.button != null && e.button !== 0) return;
  e.preventDefault(); e.stopPropagation();
  const row = e.currentTarget.closest('.watch-row');
  if (!row) return;
  dragState = { row, handle: e.currentTarget, pointerId: e.pointerId };
  row.classList.add('dragging');
  document.body.classList.add('is-reordering');
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  e.currentTarget.addEventListener('pointermove', moveDrag);
  e.currentTarget.addEventListener('pointerup', endDrag, { once: true });
  e.currentTarget.addEventListener('pointercancel', endDrag, { once: true });
}

function moveDrag(e) {
  if (!dragState || e.pointerId !== dragState.pointerId) return;
  const target = document.elementFromPoint(e.clientX, e.clientY)?.closest('.watch-row');
  if (!target || target === dragState.row || target.parentElement !== els.watchlist) return;
  const rect = target.getBoundingClientRect();
  const after = e.clientY > rect.top + rect.height / 2;
  if (after) target.after(dragState.row); else target.before(dragState.row);
}

function endDrag(e) {
  if (!dragState) return;
  try { dragState.handle.releasePointerCapture(dragState.pointerId); } catch {}
  dragState.handle.removeEventListener('pointermove', moveDrag);
  dragState.row.classList.remove('dragging');
  document.body.classList.remove('is-reordering');
  symbols = [...els.watchlist.querySelectorAll('.watch-row')].map(row => row.dataset.symbol);
  saveSymbols();
  dragState = null;
  renderWatchlist();
  renderSettings();
}

function renderSettings() {
  els.settingsList.innerHTML = symbols.length ? symbols.map(symbol => {
    const q = quoteMap.get(symbol);
    return `<div class="settings-item"><div><strong>${q?.displaySymbol || symbol}</strong><span class="settings-name">${q?.name || ''}</span></div><button class="remove-button" data-remove="${symbol}">Remove</button></div>`;
  }).join('') : '<div class="settings-item muted">No symbols yet.</div>';

  els.settingsList.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      symbols = symbols.filter(s => s !== btn.dataset.remove);
      quoteMap.delete(btn.dataset.remove);
      saveSymbols(); renderSettings(); renderWatchlist(); fetchQuotes();
    });
  });
}

async function fetchQuotes() {
  if (!symbols.length) return;
  try {
    const response = await fetch(`/api/quotes?symbols=${encodeURIComponent(symbols.join(','))}`, { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Quote request failed');
    for (const q of data.quotes || []) quoteMap.set(q.symbol, q);
    els.feedDot.className = 'status-dot live';
    const unavailable = (data.quotes || []).filter(q => !Number.isFinite(q.price)).length;
    els.feedStatus.textContent = unavailable ? `Multi-asset feed · ${unavailable} unavailable` : `Multi-asset feed · ${symbols.length} symbols`;
    els.lastRefresh.textContent = `Updated ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date())}`;
    if (!dragState) renderWatchlist();
    syncChartQuote();
  } catch (err) {
    els.feedDot.className = 'status-dot error';
    els.feedStatus.textContent = err.message;
    console.error(err);
  }
}

function syncChartQuote() {
  if (!activeSymbol) return;
  const q = quoteMap.get(activeSymbol);
  if (!q) return;
  els.chartSymbol.textContent = q.displaySymbol || activeSymbol;
  els.chartFeed.textContent = `${q.name} · ${q.source || 'Market data'}`;
  els.chartPrice.textContent = formatValue(q.price, q);
  const parts = changeParts(q);
  els.chartChange.textContent = q.assetType === 'rate' ? `${parts.primary} · ${parts.detail}` : `${parts.primary} · ${parts.detail.replace(' today', '')}`;
  els.chartChange.className = `chart-change ${q.change > 0 ? 'positive' : q.change < 0 ? 'negative' : ''}`;
}

function openChart(symbol) {
  activeSymbol = symbol; activeRange = '1D'; pointerIndex = null; activeChartMeta = quoteMap.get(symbol) || null;
  els.watchScreen.classList.remove('active'); els.chartScreen.classList.add('active');
  document.querySelectorAll('.range').forEach(btn => btn.classList.toggle('active', btn.dataset.range === activeRange));
  syncChartQuote(); loadChart();
  clearInterval(chartTimer);
  chartTimer = setInterval(() => { if (['1D', '5D'].includes(activeRange)) loadChart(true); }, CHART_REFRESH_MS);
}

function closeChart() {
  activeSymbol = null; activeChartMeta = null; chartBars = []; pointerIndex = null; chartAbort?.abort(); clearInterval(chartTimer); chartTimer = null;
  els.chartScreen.classList.remove('active'); els.watchScreen.classList.add('active'); els.chartTooltip.classList.add('hidden');
}

async function loadChart(silent = false) {
  if (!activeSymbol) return;
  chartAbort?.abort(); chartAbort = new AbortController();
  if (!silent) els.chartLoader.classList.remove('hidden');
  try {
    const response = await fetch(`/api/bars/${encodeURIComponent(activeSymbol)}?range=${encodeURIComponent(activeRange)}`, { cache: 'no-store', signal: chartAbort.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Chart request failed');
    chartBars = (data.bars || []).filter(b => Number.isFinite(b.c));
    activeChartMeta = { ...(quoteMap.get(activeSymbol) || {}), ...data };
    if (data.source) els.chartFeed.textContent = `${activeChartMeta.name || activeSymbol} · ${data.source}`;
    drawChart(); els.chartLoader.classList.add('hidden');
    if (!chartBars.length) { els.chartLoader.textContent = 'No chart data returned for this range.'; els.chartLoader.classList.remove('hidden'); }
    else els.chartLoader.textContent = 'Loading chart…';
  } catch (err) {
    if (err.name === 'AbortError') return;
    els.chartLoader.textContent = err.message; els.chartLoader.classList.remove('hidden'); console.error(err);
  }
}

function resizeCanvas() {
  const rect = els.chartCanvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr)); const height = Math.max(1, Math.round(rect.height * dpr));
  if (els.chartCanvas.width !== width || els.chartCanvas.height !== height) { els.chartCanvas.width = width; els.chartCanvas.height = height; }
  return { width, height, dpr };
}

function axisValue(value) {
  if (activeChartMeta?.assetType === 'rate') return `${value.toFixed(2)}%`;
  if (activeChartMeta?.assetType === 'fx') return value >= 100 ? value.toFixed(2) : value.toFixed(4);
  return value >= 1000 ? value.toFixed(0) : value >= 100 ? value.toFixed(1) : value.toFixed(2);
}

function drawChart() {
  const { width, height, dpr } = resizeCanvas();
  const ctx = els.chartCanvas.getContext('2d'); ctx.clearRect(0, 0, width, height);
  if (!chartBars.length) return;
  const pad = { l: 20 * dpr, r: 82 * dpr, t: 26 * dpr, b: 32 * dpr };
  const plotW = width - pad.l - pad.r, plotH = height - pad.t - pad.b;
  const values = chartBars.map(b => b.c); let min = Math.min(...values), max = Math.max(...values);
  if (max === min) { max += activeChartMeta?.assetType === 'rate' ? .05 : 1; min -= activeChartMeta?.assetType === 'rate' ? .05 : 1; }
  const buffer = (max - min) * .08; min -= buffer; max += buffer;
  const xFor = i => pad.l + (chartBars.length === 1 ? plotW / 2 : i / (chartBars.length - 1) * plotW);
  const yFor = v => pad.t + (max - v) / (max - min) * plotH;
  const first = values[0], last = values[values.length - 1], up = last >= first;
  const line = up ? '#34d399' : '#fb7185';

  ctx.lineWidth = 1 * dpr; ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.fillStyle = 'rgba(140,150,168,.9)';
  ctx.font = `${11 * dpr}px system-ui, sans-serif`; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  for (let i = 0; i < 5; i++) {
    const y = pad.t + i / 4 * plotH; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(width - pad.r, y); ctx.stroke();
    ctx.fillText(axisValue(max - i / 4 * (max - min)), width - pad.r + 9 * dpr, y);
  }

  const gradient = ctx.createLinearGradient(0, pad.t, 0, height - pad.b);
  gradient.addColorStop(0, up ? 'rgba(52,211,153,.20)' : 'rgba(251,113,133,.20)'); gradient.addColorStop(1, 'rgba(17,21,28,0)');
  ctx.beginPath(); chartBars.forEach((bar, i) => { const x = xFor(i), y = yFor(bar.c); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.lineTo(xFor(chartBars.length - 1), height - pad.b); ctx.lineTo(xFor(0), height - pad.b); ctx.closePath(); ctx.fillStyle = gradient; ctx.fill();
  ctx.beginPath(); chartBars.forEach((bar, i) => { const x = xFor(i), y = yFor(bar.c); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.strokeStyle = line; ctx.lineWidth = 2.2 * dpr; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();

  ctx.fillStyle = 'rgba(140,150,168,.85)'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  for (const ratio of [0, .25, .5, .75, 1]) {
    const idx = Math.min(chartBars.length - 1, Math.round((chartBars.length - 1) * ratio));
    ctx.fillText(formatAxisTime(new Date(chartBars[idx].t), activeRange), xFor(idx), height - pad.b + 10 * dpr);
  }
  if (pointerIndex != null && chartBars[pointerIndex]) {
    const bar = chartBars[pointerIndex], x = xFor(pointerIndex), y = yFor(bar.c);
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1 * dpr; ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, height - pad.b); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(width - pad.r, y); ctx.stroke(); ctx.fillStyle = line; ctx.beginPath(); ctx.arc(x, y, 4.5 * dpr, 0, Math.PI * 2); ctx.fill();
  }
}

function formatAxisTime(date, range) {
  if (range === '1D' && chartBars.length > 3) return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric' }).format(date);
  if (range === '5D') return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(date);
  if (['1D','1M', '3M', '6M', 'YTD', '1Y'].includes(range)) return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }).format(date);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', year: '2-digit' }).format(date);
}

function handleChartPointer(event) {
  if (!chartBars.length) return;
  const rect = els.chartCanvas.getBoundingClientRect(), x = event.clientX - rect.left, left = 20, right = 82;
  const plotW = Math.max(1, rect.width - left - right), ratio = Math.max(0, Math.min(1, (x - left) / plotW));
  pointerIndex = Math.round(ratio * (chartBars.length - 1)); const bar = chartBars[pointerIndex]; if (!bar) return; drawChart();
  const canvasX = left + (chartBars.length === 1 ? plotW / 2 : pointerIndex / (chartBars.length - 1) * plotW);
  els.chartTooltip.style.left = `${Math.max(80, Math.min(rect.width - 80, canvasX))}px`; els.chartTooltip.style.top = `${Math.max(95, event.clientY - rect.top)}px`;
  els.chartTooltip.innerHTML = `<strong>${formatValue(bar.c, activeChartMeta || {})}</strong>${new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: ['1D','5D','1M'].includes(activeRange) && chartBars.length > 3 ? 'numeric' : undefined,
    minute: activeRange === '1D' && chartBars.length > 3 ? '2-digit' : undefined
  }).format(new Date(bar.t))}`;
  els.chartTooltip.classList.remove('hidden');
}

function clearChartPointer() { pointerIndex = null; els.chartTooltip.classList.add('hidden'); drawChart(); }

async function toggleWakeLock() {
  if (!('wakeLock' in navigator)) { els.wakeBtn.textContent = 'Screen wake lock not supported'; return; }
  try {
    if (wakeLock) { await wakeLock.release(); wakeLock = null; els.wakeBtn.textContent = 'Keep screen awake'; }
    else {
      wakeLock = await navigator.wakeLock.request('screen'); els.wakeBtn.textContent = 'Allow screen to sleep';
      wakeLock.addEventListener('release', () => { wakeLock = null; els.wakeBtn.textContent = 'Keep screen awake'; });
    }
  } catch { els.wakeBtn.textContent = 'Wake lock unavailable'; }
}

function openSettings() { renderSettings(); els.settingsPanel.classList.remove('hidden'); setTimeout(() => els.tickerInput.focus(), 80); }
function closeSettings() { els.settingsPanel.classList.add('hidden'); }

els.settingsBtn.addEventListener('click', openSettings); els.emptyAddBtn.addEventListener('click', openSettings); els.closeSettings.addEventListener('click', closeSettings);
els.settingsPanel.addEventListener('click', e => { if (e.target === els.settingsPanel) closeSettings(); }); els.backBtn.addEventListener('click', closeChart); els.wakeBtn.addEventListener('click', toggleWakeLock);

els.addForm.addEventListener('submit', e => {
  e.preventDefault(); const ticker = cleanTicker(els.tickerInput.value); if (!ticker) return;
  if (!symbols.includes(ticker) && symbols.length < 30) symbols.push(ticker);
  els.tickerInput.value = ''; saveSymbols(); renderSettings(); renderWatchlist(); fetchQuotes();
});

els.rangeBar.addEventListener('click', e => {
  const btn = e.target.closest('[data-range]'); if (!btn || btn.dataset.range === activeRange) return;
  activeRange = btn.dataset.range; pointerIndex = null; document.querySelectorAll('.range').forEach(b => b.classList.toggle('active', b === btn)); loadChart();
});

els.chartCanvas.addEventListener('pointermove', handleChartPointer); els.chartCanvas.addEventListener('pointerdown', handleChartPointer);
els.chartCanvas.addEventListener('pointerleave', clearChartPointer); els.chartCanvas.addEventListener('pointerup', () => setTimeout(clearChartPointer, 800));
window.addEventListener('resize', () => requestAnimationFrame(drawChart));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { fetchQuotes(); if (activeSymbol) loadChart(true); } });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(console.error);

renderWatchlist(); updateClock(); setInterval(updateClock, 1000); fetchQuotes(); quoteTimer = setInterval(fetchQuotes, QUOTE_REFRESH_MS);
