# NSE Swing Trading Simulator — PRD

## Original Problem Statement
Build a trading bot for the Indian market: invest ₹5L, pick top 20 Nifty 50 stocks that
have fallen recently, and sell them when they recover (swing strategy). Build a simulator
first to validate the strategy on real historical data over the last 4 weeks, with
adjustable filters. Phase 2: live trading via Upstox API.

## User Choices (Phase 1)
- Data source: **Yahoo Finance (yfinance)**
- Universe: **Nifty 50**
- Strategy params: capital ₹5L, dip 5–15%, recovery target 8% (5–12%), stop-loss 7%
- Filters: **adjustable in UI**
- Auth: **none / open access**
- Phase 2 (Upstox live trading): deferred

## Architecture
- **Backend**: FastAPI (`/app/backend/server.py`) + simulator engine
  (`/app/backend/simulator.py`) + Nifty 50 universe (`/app/backend/nifty50.py`)
- **Data**: yfinance batch download of ~3 months daily candles for 50 tickers
- **Storage**: MongoDB `simulations` collection (lightweight: params + kpis only)
- **Frontend**: React + Tailwind + shadcn/ui + Recharts + Phosphor icons
  Single page (`/app/frontend/src/pages/Simulator.jsx`)
- **Design**: dark terminal aesthetic, Cabinet Grotesk + Satoshi + JetBrains Mono,
  electric yellow `#E2FF00` accent

## API Endpoints
- `GET /api/` — health
- `GET /api/nifty50` — universe + sector list
- `POST /api/simulate` — run backtest (returns kpis, equity_curve, trades, open_positions)
- `GET /api/simulations` — recent runs (kpis only)

## Implemented (Feb 2026 — initial release)
- Daily-step swing backtest on real Nifty 50 data
- 8 adjustable filters: capital, weeks (2–24), dip min/max, recovery target,
  stop-loss, peak lookback, max concurrent positions, sector filter
- KPI cards (5): starting capital, final portfolio, net P&L, win rate, total trades
- Equity curve chart with reference line, custom tooltip
- Trade log table with search + status filter (all/closed/open)
- Open positions card with live unrealized P&L
- Empty state, loading shimmer, toast notifications
- All elements have `data-testid` attributes
- 9/9 backend pytest tests passing, frontend smoke tested

## v2 Update (Feb 2026 — multi-strategy)
- **4 trigger types**: `daily_drop` (default), `peak_dip`, `weekly_drop`, `consecutive_down`
- **3 universes**: Nifty 50 / Nifty 100 / Nifty 200 (216 stocks)
- **Time-based exit**: `max_holding_days` (default 4) — force-sells stocks that don't recover in N days
- **True capital rotation**: per-slot allocation = available_cash / free_slots, recomputed daily
- **5 allocation presets**: Concentrated, Balanced (default), Diversified, Spray, Sniper
- **Compare 5 strategies side-by-side** via new `POST /api/compare` (single shared data fetch)
  - Multi-line equity chart, head-to-head matrix with winner trophy
  - 5 quick-add presets (Daily 20×₹25K, Daily 40×₹12.5K, PeakDip 20, Sniper 5×₹1L, Weekly Drop)
- **Extra KPIs**: avg_holding_days, max_drawdown_pct, exits target/stoploss/time breakdown
- **Sizing controls**: max_picks_per_day cap, max_positions slider
- 17/17 backend pytest tests passing, full frontend coverage verified

## Backlog
### P0 (next)
- Upstox API integration scaffold (Phase 2 live trading)
- Per-stock performance breakdown card
- Save & re-load full simulation results (currently only KPIs persisted)

### P1
- Compare strategies side-by-side (A/B backtest)
- Export trades to CSV
- Drawdown chart and Sharpe / max-drawdown metrics
- TTL cache on yfinance fetches (reduce repeat-run latency)
- Custom universe upload (Nifty Next 50, custom watchlist)
- Sectoral allocation pie chart

### P2
- User accounts & saved strategies
- Alerts when live market hits dip threshold
- Mobile-first responsive polish
- Walk-forward optimization
