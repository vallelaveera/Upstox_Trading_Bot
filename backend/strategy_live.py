"""Live strategy scanning + execution using Upstox API."""
from __future__ import annotations

import concurrent.futures
import logging
import math
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

import pandas as pd
import yfinance as yf

from nifty50 import yf_ticker
from universe import get_universe
import upstox_client as ux

logger = logging.getLogger(__name__)


def _fetch_recent_closes(universe_stocks: List[Dict]) -> Dict[str, Dict]:
    """Get prior trading-day close + 5-trading-days-ago close for each stock.
    Strictly excludes today's date so that drop% = (prev_close - LTP) / prev_close.
    Returns {symbol: {prev_close, prev_date, week_ago_close, week_ago_date}}.
    """
    tickers = [yf_ticker(s["symbol"]) for s in universe_stocks]
    try:
        data = yf.download(
            tickers=tickers,
            period="14d",
            interval="1d",
            group_by="ticker",
            auto_adjust=True,
            progress=False,
            threads=True,
        )
    except Exception as e:
        logger.exception(f"yfinance fetch failed: {e}")
        return {}

    out: Dict[str, Dict] = {}
    if data is None or data.empty:
        return out

    today_str = pd.Timestamp.now(tz="Asia/Kolkata").strftime("%Y-%m-%d")

    for s in universe_stocks:
        sym = s["symbol"]
        tk = yf_ticker(sym)
        try:
            if isinstance(data.columns, pd.MultiIndex):
                if tk not in data.columns.get_level_values(0):
                    continue
                ser = data[tk]["Close"].dropna()
            else:
                ser = data["Close"].dropna()
            if len(ser) < 1:
                continue
            ser_before_today = ser[ser.index.strftime("%Y-%m-%d") < today_str]
            use = ser_before_today if len(ser_before_today) >= 1 else ser
            prev_close = float(use.iloc[-1])
            prev_date = pd.Timestamp(use.index[-1]).strftime("%Y-%m-%d")
            # 5 trading days ago — index -6 (or earliest available)
            wk_idx = -6 if len(use) >= 6 else 0
            week_ago_close = float(use.iloc[wk_idx])
            week_ago_date = pd.Timestamp(use.index[wk_idx]).strftime("%Y-%m-%d")
            out[sym] = {
                "prev_close": prev_close,
                "prev_date": prev_date,
                "week_ago_close": week_ago_close,
                "week_ago_date": week_ago_date,
            }
        except Exception:
            continue
    return out


def _fetch_market_caps(symbols: List[str]) -> Dict[str, Optional[float]]:
    """Fetch market cap (in INR) for given NSE symbols in parallel via yfinance."""
    def _one(sym: str) -> Tuple[str, Optional[float]]:
        try:
            t = yf.Ticker(yf_ticker(sym))
            mc = None
            try:
                mc = t.fast_info.get("market_cap")
            except Exception:
                pass
            if not mc:
                try:
                    mc = t.info.get("marketCap")
                except Exception:
                    pass
            return sym, float(mc) if mc else None
        except Exception:
            return sym, None

    out: Dict[str, Optional[float]] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as ex:
        for sym, mc in ex.map(_one, symbols):
            out[sym] = mc
    return out


async def scan_daily_dips(
    token: str,
    universe: str = "nifty200",
    drop_min: float = 2.0,
    drop_max: float = 4.0,
    top_n: int = 20,
    sectors: Optional[List[str]] = None,
    min_mcap_cr: float = 0.0,  # filter out stocks below this market cap (in ₹ crores)
) -> Dict:
    """Scan for stocks dropping `drop_min`–`drop_max`% today.
    Combines yfinance (yesterday's close) + Upstox LTP (live price)."""
    universe_stocks = get_universe(universe)
    if sectors:
        universe_stocks = [s for s in universe_stocks if s["sector"] in sectors]

    # 1) prior closes from yfinance (incl. 5-day-ago close)
    closes = _fetch_recent_closes(universe_stocks)
    if not closes:
        return {"error": "No yfinance data", "candidates": []}

    # 2) build instrument keys for upstox LTP
    inst_meta: Dict[str, Dict] = {}  # instrument_key -> stock meta+upstox
    keys: List[str] = []
    for s in universe_stocks:
        if s["symbol"] not in closes:
            continue
        ux_inst = ux.lookup_instrument(s["symbol"])
        if not ux_inst:
            continue
        inst_meta[ux_inst["instrument_key"]] = {
            **s,
            **ux_inst,
            **closes[s["symbol"]],
        }
        keys.append(ux_inst["instrument_key"])

    if not keys:
        return {"error": "No Upstox instruments mapped", "candidates": []}

    # 3) fetch LTPs in batches of 500
    quotes_data: Dict = {}
    for i in range(0, len(keys), 500):
        batch = keys[i : i + 500]
        try:
            r = await ux.get_ltp(token, batch)
            quotes_data.update(r.get("data", {}) or {})
        except Exception as e:
            logger.warning(f"LTP batch failed: {e}")

    by_token: Dict[str, Dict] = {}
    for _k, v in quotes_data.items():
        tok_id = v.get("instrument_token") or v.get("instrument_key")
        if tok_id:
            by_token[tok_id] = v

    candidates: List[Dict] = []
    for inst_key, meta in inst_meta.items():
        q = by_token.get(inst_key)
        if not q:
            continue
        ltp = float(q.get("last_price") or 0)
        if ltp <= 0:
            continue
        prev = meta["prev_close"]
        if prev <= 0:
            continue
        drop_pct = (prev - ltp) / prev * 100.0
        if not (drop_min <= drop_pct <= drop_max):
            continue
        wk = meta.get("week_ago_close") or 0
        weekly_drop_pct = ((wk - ltp) / wk * 100.0) if wk > 0 else 0.0
        candidates.append(
            {
                "symbol": meta["symbol"],
                "name": meta["name"],
                "sector": meta["sector"],
                "instrument_key": inst_key,
                "prev_close": round(prev, 2),
                "prev_date": meta["prev_date"],
                "ltp": round(ltp, 2),
                "drop_pct": round(drop_pct, 2),
                "drop_inr": round(prev - ltp, 2),
                "weekly_drop_pct": round(weekly_drop_pct, 2),
                "week_ago_close": round(wk, 2),
                "week_ago_date": meta.get("week_ago_date"),
            }
        )

    candidates.sort(key=lambda c: c["drop_pct"], reverse=True)
    candidates = candidates[: max(1, top_n)]

    # 4) fetch market caps for the (now-small) candidate list in parallel
    if candidates:
        try:
            mcaps = _fetch_market_caps([c["symbol"] for c in candidates])
        except Exception as e:
            logger.warning(f"market cap fetch failed: {e}")
            mcaps = {}
        for c in candidates:
            mc = mcaps.get(c["symbol"])
            c["market_cap"] = mc
            c["market_cap_cr"] = round(mc / 1e7, 2) if mc else None  # ₹ in crores
        # 5) optional market-cap filter
        if min_mcap_cr > 0:
            before = len(candidates)
            candidates = [
                c for c in candidates
                if (c.get("market_cap_cr") or 0) >= min_mcap_cr
            ]
            logger.info(f"mcap filter ≥ {min_mcap_cr} Cr: {before} → {len(candidates)}")

    return {
        "scanned_at": datetime.now(timezone.utc).isoformat(),
        "universe": universe,
        "universe_size": len(universe_stocks),
        "drop_min": drop_min,
        "drop_max": drop_max,
        "candidates": candidates,
        "count": len(candidates),
    }


async def execute_picks(
    token: str,
    candidates: List[Dict],
    capital: float,
    slots: int,
    product: str = "D",  # CNC delivery default
    skip_held: bool = True,
) -> Dict:
    """Place MARKET BUY orders for top N candidates with capital/slots allocation."""
    picks = candidates[: max(1, slots)]
    per_slot = capital / max(1, slots)

    # Optionally fetch existing holdings/positions to skip already-held
    held_symbols = set()
    if skip_held:
        try:
            holdings_resp = await ux.get_holdings(token)
            for h in (holdings_resp.get("data") or []):
                sym = h.get("tradingsymbol") or h.get("trading_symbol")
                if sym:
                    held_symbols.add(sym.upper())
        except Exception as e:
            logger.warning(f"Could not fetch holdings for de-dup: {e}")
        try:
            pos_resp = await ux.get_positions(token)
            for p in (pos_resp.get("data") or []):
                sym = p.get("tradingsymbol") or p.get("trading_symbol")
                qty = p.get("quantity") or 0
                if sym and qty != 0:
                    held_symbols.add(sym.upper())
        except Exception:
            pass

    results: List[Dict] = []
    total_invested = 0.0
    for c in picks:
        sym = c["symbol"]
        if sym.upper() in held_symbols:
            results.append(
                {
                    "symbol": sym,
                    "status": "skipped",
                    "reason": "already_held",
                    "ltp": c["ltp"],
                }
            )
            continue
        ltp = float(c["ltp"])
        if ltp <= 0:
            results.append({"symbol": sym, "status": "failed", "reason": "no_ltp"})
            continue
        qty = int(math.floor(per_slot / ltp))
        if qty <= 0:
            results.append(
                {
                    "symbol": sym,
                    "status": "failed",
                    "reason": "qty_zero",
                    "ltp": ltp,
                    "per_slot": per_slot,
                }
            )
            continue
        try:
            order_resp = await ux.place_order(
                token,
                instrument_key=c["instrument_key"],
                quantity=qty,
                transaction_type="BUY",
                order_type="MARKET",
                product=product,
                tag=f"swing-auto-{datetime.utcnow().strftime('%Y%m%d')}",
            )
            order_id = (order_resp.get("data") or {}).get("order_id")
            invested = qty * ltp
            total_invested += invested
            results.append(
                {
                    "symbol": sym,
                    "status": "placed",
                    "qty": qty,
                    "ltp": ltp,
                    "estimated_cost": round(invested, 2),
                    "order_id": order_id,
                    "drop_pct": c["drop_pct"],
                }
            )
        except Exception as e:
            results.append(
                {
                    "symbol": sym,
                    "status": "failed",
                    "reason": str(e)[:200],
                    "qty": qty,
                    "ltp": ltp,
                }
            )

    placed = sum(1 for r in results if r["status"] == "placed")
    skipped = sum(1 for r in results if r["status"] == "skipped")
    failed = sum(1 for r in results if r["status"] == "failed")
    return {
        "executed_at": datetime.now(timezone.utc).isoformat(),
        "capital": capital,
        "slots": slots,
        "per_slot": round(per_slot, 2),
        "total_invested_estimate": round(total_invested, 2),
        "placed": placed,
        "skipped": skipped,
        "failed": failed,
        "results": results,
    }
