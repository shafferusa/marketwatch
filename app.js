const DEFAULT_WATCHLIST = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'TSLA'];
const STORAGE_KEY = 'tablet-market-watcher-symbols-v1';
const QUOTE_REFRESH_MS = 2500;
const CHART_REFRESH_MS = 15000;

const $ = (id) => document.getElementById(id);
const els = {
  watchScreen: $('watchScreen'),
  chartScreen: $('chartScreen'),
  watchlist: $('watchlist'),
  emptyState: $('emptyState'),
  feedStatus: $('feedStatus'),
  feedDot: $('feedDot'),
  lastRefresh: $('lastRefresh'),
  settingsBtn: $('settingsBtn'),
  settingsPanel: $('settingsPanel'),
  closeSettings: $('closeSettings'),
  addForm: $('addForm'),
  tickerInput: $('tickerInput'),
  settingsList: $('settingsList'),
  emptyAddBtn: $('emptyAddBtn'),
  wakeBtn: $('wakeBtn'),
  backBtn: $('backBtn'),
  chartSymbol: $('chartSymbol'),
  chartFeed: $('chartFeed'),
  chartPrice: $('chartPrice'),
  chartChange: $('chartChange'),
  rangeBar: $('rangeBar'),
  chartCanvas: $('chartCanvas'),
  chartTooltip: $('chartTooltip'),
  chartLoader: $('chartLoader'),
  clock: $('clock'),
  date: $('date')
};

let symbols = loadSymbols();
let quoteMap = new Map();
let quoteTimer = null;
let activeSymbol = null;
let activeRange = '1D';
let chartBars = [];
let chartTimer = null;
let chartAbort = null;
let wakeLock = null;
let pointerIndex = null;

function loadSymbols() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) return saved.map(cleanTicker).filter(Boolean).slice(0, 30);
  } catch {}
  return [...DEFAULT_WATCHLIST];
}

function saveSymbols() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(symbols));
}

function cleanTicker(value) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, '').slice(0, 12);
}

function money(value) {
  if (!Number.isFinite(value)) return '—';
  const digits = Math.abs(value) >= 1000 ? 2 : Math.abs(value) >= 1 ? 2 : 4;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: digits }).format(value);
}

function signed(value, digits = 2) {
  if (!Number.isFinite(value)) return '—';
  return `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;
}

function updateClock() {
  const now = new Date();
  els.clock.textContent = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', second: '2-digit'
  }).format(now);
  els.date.textContent = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric'
  }).format(now) + ' · ET';
}

function renderWatchlist() {
  els.emptyState.classList.toggle('hidden', symbols.length > 0);
  els.watchlist.classList.toggle('hidden', symbols.length === 0);

  els.watchlist.innerHTML = symbols.map((symbol) => {
    const q = quoteMap.get(symbol);
    const direction = q?.change > 0 ? 'positive' : q?.change < 0 ? 'negative' : '';
    const changeText = q && Number.isFinite(q.changePct) ? `${signed(q.changePct)}%` : '—';
    const dollarText = q && Number.isFinite(q.change) ? `${signed(q.change)}` : '—';
    return `
      <button class="watch-row ${q ? '' : 'skeleton'}" data-symbol="${symbol}">
        <div>
          <div class="symbol">${symbol}</div>
          <div class="subtext">IEX · TAP FOR CHART</div>
        </div>
        <div class="price">${q ? money(q.price) : 'Loading…'}</div>
        <div class="change ${direction}">${changeText}<span class="change-detail">${dollarText} today</span></div>
      </button>`;
  }).join('');

  els.watchlist.querySelectorAll('.watch-row').forEach((row) => {
    row.addEventListener('click', () => openChart(row.dataset.symbol));
  });
}

function renderSettings() {
  els.settingsList.innerHTML = symbols.length ? symbols.map(symbol => `
    <div class="settings-item">
      <strong>${symbol}</strong>
      <button class="remove-button" data-remove="${symbol}">Remove</button>
    </div>`).join('') : '<div class="settings-item muted">No tickers yet.</div>';

  els.settingsList.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      symbols = symbols.filter(s => s !== btn.dataset.remove);
      quoteMap.delete(btn.dataset.remove);
      saveSymbols();
      renderSettings();
      renderWatchlist();
      fetchQuotes();
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
    els.feedStatus.textContent = `Live IEX · ${symbols.length} symbol${symbols.length === 1 ? '' : 's'}`;
    els.lastRefresh.textContent = `Updated ${new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date())}`;
    renderWatchlist();
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
  els.chartPrice.textContent = money(q.price);
  els.chartChange.textContent = Number.isFinite(q.changePct) ? `${signed(q.changePct)}%  ·  ${signed(q.change)}` : '—';
  els.chartChange.className = `chart-change ${q.change > 0 ? 'positive' : q.change < 0 ? 'negative' : ''}`;
}

function openChart(symbol) {
  activeSymbol = symbol;
  activeRange = '1D';
  pointerIndex = null;
  els.chartSymbol.textContent = symbol;
  els.chartFeed.textContent = 'ALPACA · IEX';
  els.watchScreen.classList.remove('active');
  els.chartScreen.classList.add('active');
  document.querySelectorAll('.range').forEach(btn => btn.classList.toggle('active', btn.dataset.range === activeRange));
  syncChartQuote();
  loadChart();
  clearInterval(chartTimer);
  chartTimer = setInterval(() => {
    if (['1D', '5D'].includes(activeRange)) loadChart(true);
  }, CHART_REFRESH_MS);
}

function closeChart() {
  activeSymbol = null;
  chartBars = [];
  pointerIndex = null;
  chartAbort?.abort();
  clearInterval(chartTimer);
  chartTimer = null;
  els.chartScreen.classList.remove('active');
  els.watchScreen.classList.add('active');
  els.chartTooltip.classList.add('hidden');
}

async function loadChart(silent = false) {
  if (!activeSymbol) return;
  chartAbort?.abort();
  chartAbort = new AbortController();
  if (!silent) els.chartLoader.classList.remove('hidden');

  try {
    const response = await fetch(`/api/bars/${encodeURIComponent(activeSymbol)}?range=${encodeURIComponent(activeRange)}`, {
      cache: 'no-store', signal: chartAbort.signal
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Chart request failed');
    chartBars = (data.bars || []).filter(b => Number.isFinite(b.c));
    drawChart();
    els.chartLoader.classList.add('hidden');
    if (!chartBars.length) {
      els.chartLoader.textContent = 'No chart data returned for this range.';
      els.chartLoader.classList.remove('hidden');
    } else {
      els.chartLoader.textContent = 'Loading chart…';
    }
  } catch (err) {
    if (err.name === 'AbortError') return;
    els.chartLoader.textContent = err.message;
    els.chartLoader.classList.remove('hidden');
    console.error(err);
  }
}

function resizeCanvas() {
  const rect = els.chartCanvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (els.chartCanvas.width !== width || els.chartCanvas.height !== height) {
    els.chartCanvas.width = width;
    els.chartCanvas.height = height;
  }
  return { width, height, dpr };
}

function drawChart() {
  const { width, height, dpr } = resizeCanvas();
  const ctx = els.chartCanvas.getContext('2d');
  ctx.clearRect(0, 0, width, height);
  if (!chartBars.length) return;

  const pad = { l: 20 * dpr, r: 72 * dpr, t: 26 * dpr, b: 32 * dpr };
  const plotW = width - pad.l - pad.r;
  const plotH = height - pad.t - pad.b;
  const values = chartBars.map(b => b.c);
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (max === min) { max += 1; min -= 1; }
  const buffer = (max - min) * .08;
  min -= buffer; max += buffer;

  const xFor = (i) => pad.l + (chartBars.length === 1 ? plotW / 2 : i / (chartBars.length - 1) * plotW);
  const yFor = (v) => pad.t + (max - v) / (max - min) * plotH;
  const first = values[0], last = values[values.length - 1];
  const up = last >= first;
  const line = up ? '#34d399' : '#fb7185';

  ctx.lineWidth = 1 * dpr;
  ctx.strokeStyle = 'rgba(255,255,255,.07)';
  ctx.fillStyle = 'rgba(140,150,168,.9)';
  ctx.font = `${11 * dpr}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < 5; i++) {
    const y = pad.t + i / 4 * plotH;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(width - pad.r, y); ctx.stroke();
    const labelVal = max - i / 4 * (max - min);
    ctx.fillText(labelVal.toFixed(labelVal >= 100 ? 1 : 2), width - pad.r + 9 * dpr, y);
  }

  const gradient = ctx.createLinearGradient(0, pad.t, 0, height - pad.b);
  gradient.addColorStop(0, up ? 'rgba(52,211,153,.20)' : 'rgba(251,113,133,.20)');
  gradient.addColorStop(1, 'rgba(17,21,28,0)');

  ctx.beginPath();
  chartBars.forEach((bar, i) => {
    const x = xFor(i), y = yFor(bar.c);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.lineTo(xFor(chartBars.length - 1), height - pad.b);
  ctx.lineTo(xFor(0), height - pad.b);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  chartBars.forEach((bar, i) => {
    const x = xFor(i), y = yFor(bar.c);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = line;
  ctx.lineWidth = 2.2 * dpr;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();

  ctx.fillStyle = 'rgba(140,150,168,.85)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const marks = [0, .25, .5, .75, 1];
  for (const ratio of marks) {
    const idx = Math.min(chartBars.length - 1, Math.round((chartBars.length - 1) * ratio));
    const dt = new Date(chartBars[idx].t);
    const label = formatAxisTime(dt, activeRange);
    ctx.fillText(label, xFor(idx), height - pad.b + 10 * dpr);
  }

  if (pointerIndex != null && chartBars[pointerIndex]) {
    const bar = chartBars[pointerIndex];
    const x = xFor(pointerIndex), y = yFor(bar.c);
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, height - pad.b); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(width - pad.r, y); ctx.stroke();
    ctx.fillStyle = line;
    ctx.beginPath(); ctx.arc(x, y, 4.5 * dpr, 0, Math.PI * 2); ctx.fill();
  }
}

function formatAxisTime(date, range) {
  if (range === '1D') return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric' }).format(date);
  if (range === '5D') return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short' }).format(date);
  if (['1M', '3M', '6M', 'YTD', '1Y'].includes(range)) return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }).format(date);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', month: 'short', year: '2-digit' }).format(date);
}

function handleChartPointer(event) {
  if (!chartBars.length) return;
  const rect = els.chartCanvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const left = 20;
  const right = 72;
  const plotW = Math.max(1, rect.width - left - right);
  const ratio = Math.max(0, Math.min(1, (x - left) / plotW));
  pointerIndex = Math.round(ratio * (chartBars.length - 1));
  const bar = chartBars[pointerIndex];
  if (!bar) return;
  drawChart();

  const canvasX = left + (chartBars.length === 1 ? plotW / 2 : pointerIndex / (chartBars.length - 1) * plotW);
  const tooltipX = Math.max(80, Math.min(rect.width - 80, canvasX));
  els.chartTooltip.style.left = `${tooltipX}px`;
  els.chartTooltip.style.top = `${Math.max(95, event.clientY - rect.top)}px`;
  els.chartTooltip.innerHTML = `<strong>${money(bar.c)}</strong>${new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: ['1D','5D','1M'].includes(activeRange) ? 'numeric' : undefined, minute: activeRange === '1D' ? '2-digit' : undefined
  }).format(new Date(bar.t))}`;
  els.chartTooltip.classList.remove('hidden');
}

function clearChartPointer() {
  pointerIndex = null;
  els.chartTooltip.classList.add('hidden');
  drawChart();
}

async function toggleWakeLock() {
  if (!('wakeLock' in navigator)) {
    els.wakeBtn.textContent = 'Screen wake lock not supported';
    return;
  }
  try {
    if (wakeLock) {
      await wakeLock.release();
      wakeLock = null;
      els.wakeBtn.textContent = 'Keep screen awake';
    } else {
      wakeLock = await navigator.wakeLock.request('screen');
      els.wakeBtn.textContent = 'Allow screen to sleep';
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
        els.wakeBtn.textContent = 'Keep screen awake';
      });
    }
  } catch (err) {
    console.error(err);
    els.wakeBtn.textContent = 'Wake lock unavailable';
  }
}

function openSettings() {
  renderSettings();
  els.settingsPanel.classList.remove('hidden');
  setTimeout(() => els.tickerInput.focus(), 80);
}
function closeSettings() { els.settingsPanel.classList.add('hidden'); }

els.settingsBtn.addEventListener('click', openSettings);
els.emptyAddBtn.addEventListener('click', openSettings);
els.closeSettings.addEventListener('click', closeSettings);
els.settingsPanel.addEventListener('click', (e) => { if (e.target === els.settingsPanel) closeSettings(); });
els.backBtn.addEventListener('click', closeChart);
els.wakeBtn.addEventListener('click', toggleWakeLock);

els.addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const ticker = cleanTicker(els.tickerInput.value);
  if (!ticker) return;
  if (!symbols.includes(ticker) && symbols.length < 30) symbols.push(ticker);
  els.tickerInput.value = '';
  saveSymbols();
  renderSettings();
  renderWatchlist();
  fetchQuotes();
});

els.rangeBar.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-range]');
  if (!btn || btn.dataset.range === activeRange) return;
  activeRange = btn.dataset.range;
  pointerIndex = null;
  document.querySelectorAll('.range').forEach(b => b.classList.toggle('active', b === btn));
  loadChart();
});

els.chartCanvas.addEventListener('pointermove', handleChartPointer);
els.chartCanvas.addEventListener('pointerdown', handleChartPointer);
els.chartCanvas.addEventListener('pointerleave', clearChartPointer);
els.chartCanvas.addEventListener('pointerup', () => setTimeout(clearChartPointer, 800));
window.addEventListener('resize', () => requestAnimationFrame(drawChart));

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    fetchQuotes();
    if (activeSymbol) loadChart(true);
  }
});

if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(console.error);

renderWatchlist();
updateClock();
setInterval(updateClock, 1000);
fetchQuotes();
quoteTimer = setInterval(fetchQuotes, QUOTE_REFRESH_MS);
