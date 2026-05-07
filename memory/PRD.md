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

## v3 Update (Feb 2026 — Live Upstox Trading)
- Upstox OAuth (PKCE-style) wired with token-encryption-at-rest (Fernet, key=hash(api_secret))
- Holdings, positions, orders, funds dashboards
- **Apply Strategy** tab: live dip scanner over Nifty50/100/200/500 + Auto-Execute (manual or batched)
- Auto-attached **Target (+3%)** & **Stop-Loss (-4%)** SELL orders on every BUY
- **Manage Positions** sweeper: force-sells anything held ≥ N (4) days (`/api/upstox/strategy/manage`)
- **P&L dashboard** card: Total Unrealized + Holdings + Today's Δ + Invested
- Manual single-stock buy + single-stock dialog confirm
- Sector + min market cap + market-price filters wired through scan + auto endpoints

## v3.1 Update (Feb 2026 — Capital efficiency, exit safety, IP diagnostic)
- **Max Price filter** on scanner (default ≤ ₹1000) — keeps capital from being trapped in MRF/PageInd
  - Slider 0–₹10K + presets (Any/₹500/₹1K/₹2K/₹5K) in StrategyTab
  - Backend `scan_daily_dips()` applies the cap before Top-N truncation so cheap dippers aren't crowded out
- **Fees Paid (today)** card on PnLDashboard via `/api/upstox/dashboard/fees`
  - Approximates brokerage (₹20/leg) + STT (0.1% sell) + exchange (0.00345%) + stamp (0.015% buy) + 18% GST
  - Shows fees, % of traded value, and net-after-fees
- **Re-Arm Today's Exits** button + `/api/upstox/strategy/rearm_exits` endpoint
  - Reads open swing_positions, fetches current orderbook, reconciles target_hit/stop_hit, re-fires fresh DAY-validity SELL LIMIT (target) and SELL SL-M (stop) for any leg that's missing/cancelled/rejected/expired. Essential for multi-day swings (Upstox DAY orders auto-cancel at 15:30 IST)
- **`/api/upstox/diagnostic`** endpoint exposes pod's egress IP (via api.ipify.org) + token-presence flag + redirect URI — paste IP into Upstox Allowed-IPs whitelist to unblock UDAPI1154 errors
- Backend pytest: 6/6 V4 feature tests pass; frontend manual + automated UI tests verified all selectors render correctly

## Backlog
### P0 (next)
- Per-stock performance breakdown card
- Save & re-load full simulation results (currently only KPIs persisted)
- Sub-row auto-rearm scheduler (cron @ 09:16 IST every weekday)

### P1
- Compare strategies side-by-side (A/B backtest)
- Export trades to CSV
- Drawdown chart and Sharpe / max-drawdown metrics
- TTL cache on yfinance fetches (reduce repeat-run latency)
- Custom universe upload (Nifty Next 50, custom watchlist)
- Sectoral allocation pie chart
- Diagnostic UI panel (egress IP, token expiry, instrument count) accessible from header

### P2
- User accounts & saved strategies
- Alerts when live market hits dip threshold
- Mobile-first responsive polish
- Walk-forward optimization
- DigitalOcean droplet migration scripts (Docker Compose + Nginx) for permanent static IP
