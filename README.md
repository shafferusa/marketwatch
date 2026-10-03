# Shaffer Market Watch v2

Tablet-first installable market dashboard (PWA) for a Windows tablet/laptop, iPad, or Android tablet.

## What changed in v2

- Security/fund/index name now appears under every symbol instead of the old “IEX · tap for chart” text.
- Drag-and-drop reordering from the main watchlist using the ⠿ handle. Works with mouse and touch; order persists locally.
- Mixed asset watchlist (up to 30 symbols):
  - U.S. equities/ETFs via Alpaca IEX.
  - Actual Treasury yields: `US2Y`, `US10Y`, `US30Y` (current quote via CNBC/Tradeweb; historical daily series via FRED).
  - Spot FX such as `USDJPY=X` (you can also type `USD/JPY`).
  - Commodity futures including `CL=F` (WTI crude) and `GC=F` (gold), plus `SI=F`, `HG=F`, and `NG=F`.
  - Major indices such as `SPX`, `DJI`, `NASDAQ`, `NDX`, `RUT`, and `VIX`.
- Asset-aware formatting: Treasury yields show %, rate changes show basis points, FX is not shown with a dollar sign, indices are plain index points.
- Charts continue to support 1D, 5D, 1M, 3M, 6M, YTD, 1Y, and 5Y.

## Useful symbols

### Rates
- `US2Y` — U.S. Treasury 2-Year Yield
- `US10Y` — U.S. Treasury 10-Year Yield
- `US30Y` — U.S. Treasury 30-Year Yield

### FX
- `USDJPY=X` or `USD/JPY`
- `EURUSD=X` or `EUR/USD`
- `GBPUSD=X` or `GBP/USD`
- `USDCHF=X`
- `USDCAD=X`
- `AUDUSD=X`

### Futures
- `CL=F` — WTI Crude Oil Futures (front month)
- `GC=F` — Gold Futures (front month)
- `SI=F` — Silver Futures
- `HG=F` — Copper Futures
- `NG=F` — Natural Gas Futures

### Indices
- `SPX` — S&P 500
- `DJI` — Dow Jones Industrial Average
- `NASDAQ` — Nasdaq Composite
- `NDX` — Nasdaq-100
- `RUT` — Russell 2000
- `VIX` — CBOE Volatility Index

## Render configuration

Keep the same Render Web Service you already created.

Build command:

```bash
npm install
```

Start command:

```bash
npm start
```

Environment variables:

```text
ALPACA_API_KEY_ID=your_key
ALPACA_API_SECRET_KEY=your_secret
```

Do not commit the actual key or secret to GitHub.

## Updating the existing deployment

Replace the existing repository files with this v2 package and commit to the same GitHub branch. Render should automatically redeploy. If your installed PWA appears stale after the deploy, close/reopen it once; v2 uses a new service-worker cache version.

## Data notes

Alpaca IEX provides the live U.S. equity/ETF feed used by the original app. Treasury current yields are read from CNBC/Tradeweb and historical Treasury charts use Federal Reserve (FRED) daily constant-maturity series. FX, index, and most futures chart data use Yahoo Finance’s public chart feed; those feeds can be delayed and are not a substitute for a licensed professional exchange feed. `CL=F` and `GC=F` represent rolling front-month futures, so the underlying contract changes as the market rolls forward.
