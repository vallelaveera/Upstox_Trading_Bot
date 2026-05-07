"""Swing trading backtest simulator with multiple strategies."""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple

import pandas as pd
import yfinance as yf

from universe import get_universe
from nifty50 import yf_ticker


# ------------ Strategy types ------------
STRATEGY_PEAK_DIP = "peak_dip"
STRATEGY_DAILY_DROP = "daily_drop"
STRATEGY_WEEKLY_DROP = "weekly_drop"
STRATEGY_CONSECUTIVE_DOWN = "consecutive_down"

VALID_STRATEGIES = {
    STRATEGY_PEAK_DIP,
    STRATEGY_DAILY_DROP,
    STRATEGY_WEEKLY_DROP,
    STRATEGY_CONSECUTIVE_DOWN,
}


@dataclass
class Position:
    symbol: str
    name: str
    sector: str
    qty: int
    buy_price: float
    buy_date: str
    buy_idx: int
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
    status: str = "open"
    reason: str = ""
    holding_days: int = 0


# ------------ Data fetch ------------
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


def _fetch_history(universe_stocks: List[Dict], weeks: int) -> pd.DataFrame:
    tickers = [yf_ticker(s["symbol"]) for s in universe_stocks]
    end = datetime.now(timezone.utc)
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


def _build_series_map(
    data: pd.DataFrame,
    universe_stocks: List[Dict],
    sectors: Optional[List[str]],
    min_history: int,
) -> Tuple[Dict[str, pd.Series], Dict[str, Dict]]:
    series_map: Dict[str, pd.Series] = {}
    meta_map: Dict[str, Dict] = {}
    for s in universe_stocks:
        if sectors and s["sector"] not in sectors:
            continue
        ser = _close_series(data, yf_ticker(s["symbol"]))
        if ser is None or len(ser) < min_history:
            continue
        series_map[s["symbol"]] = ser
        meta_map[s["symbol"]] = s
    return series_map, meta_map


# ------------ Signal generators ------------
def _dip_signals(
    strategy_type: str,
    series_map: Dict[str, pd.Series],
    positions: Dict[str, Position],
    d,
    *,
    dip_min: float,
    dip_max: float,
    daily_drop_min: float,
    daily_drop_max: float,
    weekly_drop_min: float,
    weekly_drop_max: float,
    consecutive_down_min: int,
    lookback_days: int,
) -> List[Tuple[float, str, float]]:
    """Return list of (signal_strength, symbol, price) sorted by strongest first."""
    candidates: List[Tuple[float, str, float]] = []
    for sym, ser in series_map.items():
        if sym in positions:
            continue
        if d not in ser.index:
            continue
        sub = ser.loc[:d]
        if len(sub) < 2:
            continue
        price = float(sub.iloc[-1])

        if strategy_type == STRATEGY_PEAK_DIP:
            window = sub.tail(lookback_days + 1)
            if len(window) < 5:
                continue
            peak = float(window.max())
            if peak <= 0:
                continue
            dip_pct = (peak - price) / peak * 100.0
            if dip_min <= dip_pct <= dip_max:
                candidates.append((dip_pct, sym, price))

        elif strategy_type == STRATEGY_DAILY_DROP:
            prev = float(sub.iloc[-2])
            if prev <= 0:
                continue
            drop_pct = (prev - price) / prev * 100.0  # positive => fell
            if daily_drop_min <= drop_pct <= daily_drop_max:
                candidates.append((drop_pct, sym, price))

        elif strategy_type == STRATEGY_WEEKLY_DROP:
            if len(sub) < 6:
                continue
            wk_ago = float(sub.iloc[-6])  # 5 trading days back
            if wk_ago <= 0:
                continue
            drop_pct = (wk_ago - price) / wk_ago * 100.0
            if weekly_drop_min <= drop_pct <= weekly_drop_max:
                candidates.append((drop_pct, sym, price))

        elif strategy_type == STRATEGY_CONSECUTIVE_DOWN:
            # count consecutive red days ending today
            tail = sub.tail(consecutive_down_min + 1)
            if len(tail) < consecutive_down_min + 1:
                continue
            diffs = tail.diff().dropna()
            if (diffs < 0).all() and len(diffs) >= consecutive_down_min:
                total_drop = (float(tail.iloc[0]) - price) / float(tail.iloc[0]) * 100.0
                candidates.append((total_drop, sym, price))

    candidates.sort(reverse=True)  # strongest signal first
    return candidates


# ------------ Main backtest ------------
def run_simulation(
    capital: float = 500000.0,
    weeks: int = 4,
    universe: str = "nifty50",
    strategy_type: str = STRATEGY_PEAK_DIP,
    # peak_dip params
    dip_min: float = 5.0,
    dip_max: float = 15.0,
    lookback_days: int = 20,
    # daily_drop params
    daily_drop_min: float = 2.0,
    daily_drop_max: float = 5.0,
    # weekly_drop params
    weekly_drop_min: float = 5.0,
    weekly_drop_max: float = 12.0,
    # consecutive_down params
    consecutive_down_min: int = 3,
    # exits
    recovery_target: float = 8.0,
    stop_loss: float = 7.0,
    max_holding_days: int = 0,  # 0 = no time exit
    # sizing
    max_positions: int = 20,
    max_picks_per_day: int = 0,  # 0 = unlimited
    # filters
    sectors: Optional[List[str]] = None,
    # internal: optional shared data fetch (for /compare)
    _shared_data: Optional[pd.DataFrame] = None,
) -> Dict:
    if strategy_type not in VALID_STRATEGIES:
        strategy_type = STRATEGY_PEAK_DIP

    universe_stocks = get_universe(universe)

    data = _shared_data if _shared_data is not None else _fetch_history(universe_stocks, weeks)
    if data is None or data.empty:
        return _empty_result(capital, "No market data returned")

    min_hist = max(lookback_days + 2, 8)
    series_map, meta_map = _build_series_map(data, universe_stocks, sectors, min_hist)
    if not series_map:
        return _empty_result(capital, "No usable price data after filtering")

    all_dates = sorted(set().union(*[s.index.tolist() for s in series_map.values()]))
    sim_days = weeks * 5
    sim_dates = all_dates[-sim_days:] if len(all_dates) > sim_days else all_dates

    cash = float(capital)
    positions: Dict[str, Position] = {}
    closed_trades: List[Trade] = []
    open_trades: Dict[str, Trade] = {}
    equity_curve: List[Dict] = []

    if max_picks_per_day <= 0:
        max_picks_per_day = max_positions

    for day_idx, d in enumerate(sim_dates):
        d_iso = pd.Timestamp(d).strftime("%Y-%m-%d")

        # 1) SELL signals (priority: time_exit > target > stop_loss)
        for sym in list(positions.keys()):
            pos = positions[sym]
            ser = series_map[sym]
            if d not in ser.index:
                continue
            price = float(ser.loc[d])
            gain_pct = (price - pos.buy_price) / pos.buy_price * 100.0
            held = day_idx - pos.buy_idx

            sell = False
            reason = ""
            if max_holding_days > 0 and held >= max_holding_days:
                sell = True
                reason = "time"
            elif gain_pct >= recovery_target:
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
                t.holding_days = held
                closed_trades.append(t)
                del positions[sym]

        # 2) BUY signals — capital rotation: split available cash among free slots
        free_slots = max_positions - len(positions)
        if free_slots > 0 and cash >= 100:
            candidates = _dip_signals(
                strategy_type,
                series_map,
                positions,
                d,
                dip_min=dip_min,
                dip_max=dip_max,
                daily_drop_min=daily_drop_min,
                daily_drop_max=daily_drop_max,
                weekly_drop_min=weekly_drop_min,
                weekly_drop_max=weekly_drop_max,
                consecutive_down_min=consecutive_down_min,
                lookback_days=lookback_days,
            )
            picks_today = min(free_slots, max_picks_per_day, len(candidates))
            if picks_today > 0:
                # rotate available cash equally across today's picks (and remaining future free slots)
                # divisor = total free slots (so capital is conserved across days too)
                per_slot = cash / max(1, free_slots)
                bought = 0
                for _, sym, price in candidates:
                    if bought >= picks_today:
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
                        buy_idx=day_idx,
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
                    bought += 1

        # 3) mark-to-market
        positions_value = 0.0
        for sym, pos in positions.items():
            ser = series_map[sym]
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

    # finalize open positions
    last_idx = len(sim_dates) - 1
    last_date = sim_dates[-1] if sim_dates else None
    open_positions_out = []
    for sym, pos in positions.items():
        ser = series_map[sym]
        sub = ser.loc[:last_date] if last_date is not None else ser
        last_price = float(sub.iloc[-1])
        unreal = (last_price - pos.buy_price) * pos.qty
        unreal_pct = (last_price - pos.buy_price) / pos.buy_price * 100.0
        held = last_idx - pos.buy_idx
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
                "holding_days": held,
            }
        )
        t = open_trades.get(sym)
        if t:
            t.sell_price = last_price
            t.pnl = unreal
            t.pnl_pct = unreal_pct
            t.status = "open"
            t.reason = "open"
            t.holding_days = held

    # KPIs
    closed_count = len(closed_trades)
    open_count = len(open_positions_out)
    realized_pnl = sum(t.pnl for t in closed_trades)
    unrealized_pnl = sum(p["unrealized_pnl"] for p in open_positions_out)
    final_equity = equity_curve[-1]["equity"] if equity_curve else float(capital)
    wins = [t for t in closed_trades if t.pnl > 0]
    win_rate = (len(wins) / closed_count * 100.0) if closed_count else 0.0
    net_pnl = final_equity - float(capital)
    return_pct = (net_pnl / float(capital)) * 100.0
    avg_holding = (
        sum(t.holding_days for t in closed_trades) / closed_count if closed_count else 0.0
    )
    # max drawdown on equity curve
    peak = -float("inf")
    max_dd = 0.0
    for pt in equity_curve:
        peak = max(peak, pt["equity"])
        dd = (peak - pt["equity"]) / peak * 100.0 if peak > 0 else 0.0
        max_dd = max(max_dd, dd)

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
                "holding_days": t.holding_days,
            }
        )
    trades_out.sort(key=lambda x: (x["buy_date"] or ""), reverse=True)

    # close-reason breakdown
    reason_counts = {"target": 0, "stoploss": 0, "time": 0}
    for t in closed_trades:
        reason_counts[t.reason] = reason_counts.get(t.reason, 0) + 1

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
            "avg_holding_days": round(avg_holding, 2),
            "max_drawdown_pct": round(max_dd, 2),
            "exits_target": reason_counts.get("target", 0),
            "exits_stoploss": reason_counts.get("stoploss", 0),
            "exits_time": reason_counts.get("time", 0),
        },
        "equity_curve": equity_curve,
        "trades": trades_out,
        "open_positions": open_positions_out,
        "params": {
            "capital": float(capital),
            "weeks": weeks,
            "universe": universe,
            "strategy_type": strategy_type,
            "dip_min": dip_min,
            "dip_max": dip_max,
            "daily_drop_min": daily_drop_min,
            "daily_drop_max": daily_drop_max,
            "weekly_drop_min": weekly_drop_min,
            "weekly_drop_max": weekly_drop_max,
            "consecutive_down_min": consecutive_down_min,
            "recovery_target": recovery_target,
            "stop_loss": stop_loss,
            "max_holding_days": max_holding_days,
            "lookback_days": lookback_days,
            "max_positions": max_positions,
            "max_picks_per_day": max_picks_per_day,
            "sectors": sectors or [],
            "universe_size": len(series_map),
        },
        "sim_start": sim_dates[0].strftime("%Y-%m-%d") if sim_dates else None,
        "sim_end": sim_dates[-1].strftime("%Y-%m-%d") if sim_dates else None,
    }


def _empty_result(capital: float, error: str) -> Dict:
    return {
        "kpis": {},
        "equity_curve": [],
        "trades": [],
        "open_positions": [],
        "params": {},
        "error": error,
    }


def run_compare(
    capital: float,
    weeks: int,
    universe: str,
    strategies: List[Dict],
) -> Dict:
    """Run multiple strategies on a single shared data fetch.
    Each strategy dict contains overrides passed to run_simulation."""
    universe_stocks = get_universe(universe)
    data = _fetch_history(universe_stocks, weeks)
    if data is None or data.empty:
        return {"error": "No market data returned", "results": []}

    results = []
    for s in strategies:
        params = dict(s)
        label = params.pop("label", params.get("strategy_type", "strategy"))
        # force shared base params
        params["capital"] = capital
        params["weeks"] = weeks
        params["universe"] = universe
        params["_shared_data"] = data
        try:
            r = run_simulation(**params)
        except Exception as e:
            r = _empty_result(capital, f"Strategy '{label}' failed: {e}")
        # strip large arrays for comparison summary, keep equity_curve for chart
        results.append(
            {
                "label": label,
                "kpis": r.get("kpis", {}),
                "equity_curve": r.get("equity_curve", []),
                "params": r.get("params", {}),
                "open_positions": len(r.get("open_positions", [])),
                "trades_count": len(r.get("trades", [])),
                "error": r.get("error"),
            }
        )
    return {
        "results": results,
        "universe": universe,
        "weeks": weeks,
        "capital": capital,
        "sim_start": _shared_sim_start(results),
        "sim_end": _shared_sim_end(results),
    }


def _shared_sim_start(results):
    for r in results:
        ec = r.get("equity_curve") or []
        if ec:
            return ec[0].get("date")
    return None


def _shared_sim_end(results):
    for r in results:
        ec = r.get("equity_curve") or []
        if ec:
            return ec[-1].get("date")
    return None
