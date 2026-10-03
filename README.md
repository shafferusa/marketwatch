# Shaffer Market Watch — Tablet PWA

A simple, tablet-first market monitor designed to sit open during the workday.

## What it does

- Live watchlist prices using Alpaca's IEX market-data feed.
- Price change in dollars and percent vs prior close.
- Tap any ticker for a large touch-friendly chart.
- Chart ranges: 1D, 5D, 1M, 3M, 6M, YTD, 1Y, 5Y.
- Add/remove up to 30 tickers from the tablet. The list persists in that browser.
- Installable to the tablet home screen as a PWA.
- Optional Screen Wake Lock button to keep the display on when the browser supports it.
- API credentials remain server-side and are never sent to the browser.

Default watchlist: SPY, QQQ, AAPL, MSFT, NVDA, AMZN, META, TSLA.

## Data note

The default feed is Alpaca IEX. It is live, but it is not the same as the full consolidated SIP tape, so a quote can differ from what a brokerage terminal shows. Alpaca's paid data tier can provide full SIP coverage if you later want it.

## Run locally

Requirements: Node.js 20+ and a free Alpaca account/API key.

```bash
npm install
export ALPACA_API_KEY_ID="..."
export ALPACA_API_SECRET_KEY="..."
npm start
```

Then open `http://localhost:3000`.

On Windows PowerShell:

```powershell
$env:ALPACA_API_KEY_ID="..."
$env:ALPACA_API_SECRET_KEY="..."
npm start
```

## Put it on the tablet

The intended setup is to deploy this small Node app to a private HTTPS host (Render, Railway, Fly.io, your own VPS, etc.). Configure these two environment variables on the host:

- `ALPACA_API_KEY_ID`
- `ALPACA_API_SECRET_KEY`

The host should run:

```bash
npm install
npm start
```

After it is online:

### iPad
1. Open the HTTPS URL in Safari.
2. Tap Share.
3. Tap **Add to Home Screen**.
4. Launch **Market Watch** from the new icon.

### Android tablet
1. Open the HTTPS URL in Chrome.
2. Open the Chrome menu.
3. Tap **Install app** or **Add to Home screen**.
4. Launch **Market Watch** from the new icon.

## Customize defaults before deployment

Edit this line near the top of `public/app.js`:

```js
const DEFAULT_WATCHLIST = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'META', 'TSLA'];
```

You do not have to edit the code later. Tickers can be added and removed directly from the tablet settings sheet.

## Architecture

- `server.js` — Express server and secure Alpaca proxy.
- `public/index.html` — tablet UI.
- `public/app.js` — watchlist polling, chart logic, settings, PWA behavior.
- `public/styles.css` — responsive dark terminal styling.
- `public/manifest.webmanifest` + `public/sw.js` — installable PWA shell.

Quotes refresh every 2.5 seconds in one batched request. Intraday charts refresh every 15 seconds while open.
