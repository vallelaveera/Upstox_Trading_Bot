"""Swing trading backtest simulator using yfinance historical data."""
from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional

import pandas as pd
import yfinance as yf

from nifty50 import NIFTY_50, yf_ticker


@dataclass
class Position:
    symbol: str
    name: str
    sector: str
    qty: int
    buy_price: float
    buy_date: str
    invested: float


@dataclass
class Trade:
    symbol: str
    name: str
    sector: str
    qty: int
    buy_price: float
    buy_date: str
    sell_price: Optional[float] = None
    sell_date: Optional[str] = None
    pnl: float = 0.0
    pnl_pct: float = 0.0
    status: str = "open"  # open | closed
    reason: str = ""  # target | stoploss | open


def _fetch_history(weeks: int) -> pd.DataFrame:
    """Fetch ~weeks + lookback of daily history for full Nifty50 universe."""
    tickers = [yf_ticker(s["symbol"]) for s in NIFTY_50]
    end = datetime.now(timezone.utc)
    # add ~6 weeks lookback for peak detection
    start = end - timedelta(days=weeks * 7 + 60)
    data = yf.download(
        tickers=tickers,
        start=start.strftime("%Y-%m-%d"),
        end=(end + timedelta(days=1)).strftime("%Y-%m-%d"),
        interval="1d",
        group_by="ticker",
        auto_adjust=True,
        progress=False,
        threads=True,
    )
    return data


def _close_series(data: pd.DataFrame, ticker: str) -> Optional[pd.Series]:
    try:
        if isinstance(data.columns, pd.MultiIndex):
            if ticker not in data.columns.get_level_values(0):
                return None
            s = data[ticker]["Close"].dropna()
        else:
            s = data["Close"].dropna()
        if s.empty:
            return None
        return s
    except Exception:
        return None


def run_simulation(
    capital: float = 500000.0,
    weeks: int = 4,
    dip_min: float = 5.0,
    dip_max: float = 15.0,
    recovery_target: float = 8.0,
    stop_loss: float = 7.0,
    lookback_days: int = 20,
    max_positions: int = 20,
    sectors: Optional[List[str]] = None,
) -> Dict:
    """
    Run swing trading backtest.
    - For each trading day in the simulation window:
       1) For each open position, check sell signals (target or stop-loss).
       2) Find candidates with dip in [dip_min, dip_max] from lookback peak.
       3) Open new positions, sorted by largest dip first, until max_positions or capital exhausted.
    """
    data = _fetch_history(weeks)
    if data is None or data.empty:
        return {
            "kpis": {},
            "equity_curve": [],
            "trades": [],
            "open_positions": [],
            "params": {},
            "error": "No market data returned",
        }

    # Build per-stock close series
    series_map: Dict[str, pd.Series] = {}
    meta_map: Dict[str, Dict] = {}
    for s in NIFTY_50:
        if sectors and s["sector"] not in sectors:
            continue
        ser = _close_series(data, yf_ticker(s["symbol"]))
        if ser is None or len(ser) < lookback_days + 2:
            continue
        series_map[s["symbol"]] = ser
        meta_map[s["symbol"]] = s

    if not series_map:
        return {
            "kpis": {},
            "equity_curve": [],
            "trades": [],
            "open_positions": [],
            "params": {},
            "error": "No usable price data after filtering",
        }

    # Determine the simulation date range = last `weeks*5` trading days approx
    all_dates = sorted(
        set().union(*[s.index.tolist() for s in series_map.values()])
    )
    sim_days = weeks * 5
    sim_dates = all_dates[-sim_days:] if len(all_dates) > sim_days else all_dates

    cash = float(capital)
    per_slot = capital / max_positions
    positions: Dict[str, Position] = {}
    closed_trades: List[Trade] = []
    open_trades: Dict[str, Trade] = {}
    equity_curve: List[Dict] = []

    for d in sim_dates:
        d_iso = pd.Timestamp(d).strftime("%Y-%m-%d")

        # 1) SELL signals
        for sym in list(positions.keys()):
            pos = positions[sym]
            ser = series_map[sym]
            if d not in ser.index:
                continue
            price = float(ser.loc[d])
            gain_pct = (price - pos.buy_price) / pos.buy_price * 100.0
            sell = False
            reason = ""
            if gain_pct >= recovery_target:
                sell = True
                reason = "target"
            elif gain_pct <= -stop_loss:
                sell = True
                reason = "stoploss"
            if sell:
                proceeds = pos.qty * price
                pnl = proceeds - pos.invested
                cash += proceeds
                t = open_trades.pop(sym)
                t.sell_price = price
                t.sell_date = d_iso
                t.pnl = pnl
                t.pnl_pct = (pnl / pos.invested) * 100.0
                t.status = "closed"
                t.reason = reason
                closed_trades.append(t)
                del positions[sym]

        # 2) BUY scan: find candidates with dip in band
        if len(positions) < max_positions and cash >= 1000:
            candidates = []
            for sym, ser in series_map.items():
                if sym in positions:
                    continue
                if d not in ser.index:
                    continue
                # window up to (and including) today
                window = ser.loc[:d].tail(lookback_days + 1)
                if len(window) < 5:
                    continue
                peak = float(window.max())
                price = float(ser.loc[d])
                if peak <= 0:
                    continue
                dip_pct = (peak - price) / peak * 100.0
                if dip_min <= dip_pct <= dip_max:
                    candidates.append((dip_pct, sym, price))
            # Largest dip first (best discount)
            candidates.sort(reverse=True)
            for dip_pct, sym, price in candidates:
                if len(positions) >= max_positions:
                    break
                if cash < price:
                    continue
                alloc = min(per_slot, cash)
                qty = int(math.floor(alloc / price))
                if qty <= 0:
                    continue
                invested = qty * price
                cash -= invested
                meta = meta_map[sym]
                positions[sym] = Position(
                    symbol=sym,
                    name=meta["name"],
                    sector=meta["sector"],
                    qty=qty,
                    buy_price=price,
                    buy_date=d_iso,
                    invested=invested,
                )
                open_trades[sym] = Trade(
                    symbol=sym,
                    name=meta["name"],
                    sector=meta["sector"],
                    qty=qty,
                    buy_price=price,
                    buy_date=d_iso,
                    status="open",
                )

        # 3) Mark-to-market equity
        positions_value = 0.0
        for sym, pos in positions.items():
            ser = series_map[sym]
            # use latest available <= d
            sub = ser.loc[:d]
            if sub.empty:
                continue
            positions_value += pos.qty * float(sub.iloc[-1])
        equity_curve.append(
            {
                "date": d_iso,
                "equity": round(cash + positions_value, 2),
                "cash": round(cash, 2),
                "invested": round(positions_value, 2),
                "open_positions": len(positions),
            }
        )

    # finalize open positions at last close
    last_date = sim_dates[-1] if sim_dates else None
    open_positions_out = []
    for sym, pos in positions.items():
        ser = series_map[sym]
        sub = ser.loc[:last_date] if last_date is not None else ser
        last_price = float(sub.iloc[-1])
        unreal = (last_price - pos.buy_price) * pos.qty
        unreal_pct = (last_price - pos.buy_price) / pos.buy_price * 100.0
        open_positions_out.append(
            {
                "symbol": pos.symbol,
                "name": pos.name,
                "sector": pos.sector,
                "qty": pos.qty,
                "buy_price": round(pos.buy_price, 2),
                "buy_date": pos.buy_date,
                "current_price": round(last_price, 2),
                "invested": round(pos.invested, 2),
                "current_value": round(last_price * pos.qty, 2),
                "unrealized_pnl": round(unreal, 2),
                "unrealized_pnl_pct": round(unreal_pct, 2),
            }
        )
        # also add to trades list as open
        t = open_trades.get(sym)
        if t:
            t.sell_price = last_price
            t.pnl = unreal
            t.pnl_pct = unreal_pct
            t.status = "open"
            t.reason = "open"

    # KPIs
    closed_count = len(closed_trades)
    open_count = len(open_positions_out)
    realized_pnl = sum(t.pnl for t in closed_trades)
    unrealized_pnl = sum(p["unrealized_pnl"] for p in open_positions_out)
    final_equity = (
        equity_curve[-1]["equity"] if equity_curve else float(capital)
    )
    wins = [t for t in closed_trades if t.pnl > 0]
    win_rate = (len(wins) / closed_count * 100.0) if closed_count else 0.0
    net_pnl = final_equity - float(capital)
    return_pct = (net_pnl / float(capital)) * 100.0

    trades_out = []
    for t in closed_trades + list(open_trades.values()):
        trades_out.append(
            {
                "symbol": t.symbol,
                "name": t.name,
                "sector": t.sector,
                "qty": t.qty,
                "buy_price": round(t.buy_price, 2),
                "buy_date": t.buy_date,
                "sell_price": round(t.sell_price, 2) if t.sell_price else None,
                "sell_date": t.sell_date,
                "pnl": round(t.pnl, 2),
                "pnl_pct": round(t.pnl_pct, 2),
                "status": t.status,
                "reason": t.reason,
            }
        )
    # newest first
    trades_out.sort(key=lambda x: (x["buy_date"] or ""), reverse=True)

    return {
        "kpis": {
            "starting_capital": round(float(capital), 2),
            "final_portfolio": round(final_equity, 2),
            "net_pnl": round(net_pnl, 2),
            "return_pct": round(return_pct, 2),
            "realized_pnl": round(realized_pnl, 2),
            "unrealized_pnl": round(unrealized_pnl, 2),
            "total_trades": closed_count + open_count,
            "closed_trades": closed_count,
            "open_positions": open_count,
            "win_rate": round(win_rate, 2),
            "wins": len(wins),
            "losses": closed_count - len(wins),
        },
        "equity_curve": equity_curve,
        "trades": trades_out,
        "open_positions": open_positions_out,
        "params": {
            "capital": float(capital),
            "weeks": weeks,
            "dip_min": dip_min,
            "dip_max": dip_max,
            "recovery_target": recovery_target,
            "stop_loss": stop_loss,
            "lookback_days": lookback_days,
            "max_positions": max_positions,
            "sectors": sectors or [],
            "universe_size": len(series_map),
        },
        "sim_start": sim_dates[0].strftime("%Y-%m-%d") if sim_dates else None,
        "sim_end": sim_dates[-1].strftime("%Y-%m-%d") if sim_dates else None,
    }
