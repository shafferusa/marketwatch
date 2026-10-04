# Shaffer Terminal v5

Installable multi-asset market dashboard for a Windows tablet/laptop.

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
