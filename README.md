# Shaffer Terminal v8.1

Installable multi-asset market dashboard for a Windows tablet/laptop.

## Macro

The Macro tab sits between Multi-View and Newspaper and uses the existing Markets controls and layout. Its catalog contains 25 economic indicators and nine Treasury series: 1-month, 3-month, 6-month and 1-year bills; 2-, 5-, 10- and 30-year yields; and the 10-year minus 2-year spread. Each row has a unique `MAC.*` or `UST.*` ticker, description, observation date, side graph and expanded chart. Individual and overall horizons are saved separately from Markets and Multi-View.

- `GET /api/macro/catalog` returns the catalog and supported horizons.
- `GET /api/macro/series/MAC.CPI?horizon=1Y` returns observations, units, source, publication period and horizon change. Supported horizons: `CQ`, `1D`, `1W`, `1M`, `3M`, `6M`, `YTD`, `1Y`, `3Y`, `5Y`, `10Y`, `MAX`.
- Public FRED feeds supply economic and Treasury data. Optional `FRED_API_KEY` uses the official observations API instead. Year-over-year inflation and wage growth, monthly spending and retail growth, and monthly payroll changes are calculated from calendar-matched observations.
- Set `TRADING_ECONOMICS_API_KEY` in the server environment to enable licensed ISM manufacturing and services PMI history. Without a credential those rows explicitly show that a feed connection is required. Credentials never reach the browser.
- The economic calendar uses official BLS and BEA schedule feeds. Its graph counts scheduled releases on dates retained by those feeds; it is not an economic value series or a complete market-wide calendar. Upcoming reports are shown below the expanded chart.
- Server data refreshes after a 15-minute cache; the visible Macro page checks every five minutes and on window focus. Dates are observation periods, not the time of the release. Monthly and quarterly data retain their actual observation dates, and short horizons clearly show when no new report exists. Consumer sentiment has FRED's one-month publication delay. Provider failures preserve cached observations with a visible cached-data notice when available.

Run `npm test` for data transformation, calendar parsing, catalog and endpoint validation checks.

## v5 highlights

- Default 41-instrument preset with room for up to 50 symbols.
- MAGS is directly below DJI in the default list.
- Rates: US2Y, US5Y, US10Y, US30Y, SOFR and 10-year breakeven inflation.
- Credit: ICE BofA investment-grade and high-yield option-adjusted spreads via FRED.
- MOVE is explicitly the ICE BofA MOVE Index and uses the Yahoo `^MOVE` series for historical charts.
- DXY, BTC-USD and USD/CNH are explicit special instruments.
- Equity-index futures: ES=F, NQ=F, YM=F and NKD=F.
- Reordering uses compact up/down chevrons instead of drag handles or large arrow buttons.
- PWA branding is now Shaffer Terminal, with the page labeled Markets.

## Default preset

`SPX, NDX, DJI, MAGS, VIX, US2Y, US5Y, US10Y, US30Y, MOVE, CL=F, GC=F, SOFR, BE10Y, DXY, BTC-USD, USD/JPY, GBP/USD, EUR/USD, USD/CNH, SMH, XLF, XLE, XAR, XLI, XLV, XLY, XLP, XLC, XLU, XLRE, CIBR, VTI, EEM, ACWI, IG OAS, HY OAS, ES=F, NQ=F, YM=F, NKD=F`

## Render

Build command: `npm install`

Start command: `npm start`

Environment variables:

- `ALPACA_API_KEY_ID`
- `ALPACA_API_SECRET_KEY`

Never commit API credentials to GitHub.
