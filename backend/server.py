from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
import httpx
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from pydantic import BaseModel, Field, ConfigDict

from universe import UNIVERSES, get_universe
from simulator import run_simulation, run_compare, VALID_STRATEGIES
import upstox_client as ux
from strategy_live import scan_daily_dips, execute_picks, manage_swing_positions, rearm_swing_exits


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="NSE Swing Trading Simulator")
api_router = APIRouter(prefix="/api")


# --------- Models ---------
class SimulationRequest(BaseModel):
    capital: float = Field(default=500000.0, ge=10000, le=100000000)
    weeks: int = Field(default=4, ge=1, le=26)
    universe: str = Field(default="nifty50")
    strategy_type: str = Field(default="peak_dip")
    # peak_dip
    dip_min: float = Field(default=5.0, ge=0, le=50)
    dip_max: float = Field(default=15.0, ge=0, le=80)
    lookback_days: int = Field(default=20, ge=5, le=120)
    # daily_drop
    daily_drop_min: float = Field(default=2.0, ge=0, le=30)
    daily_drop_max: float = Field(default=5.0, ge=0, le=40)
    # weekly_drop
    weekly_drop_min: float = Field(default=5.0, ge=0, le=40)
    weekly_drop_max: float = Field(default=12.0, ge=0, le=50)
    # consecutive_down
    consecutive_down_min: int = Field(default=3, ge=2, le=10)
    # exits
    recovery_target: float = Field(default=8.0, ge=0.5, le=50)
    stop_loss: float = Field(default=7.0, ge=0.5, le=50)
    max_holding_days: int = Field(default=0, ge=0, le=60)
    # sizing
    max_positions: int = Field(default=20, ge=1, le=50)
    max_picks_per_day: int = Field(default=0, ge=0, le=50)
    sectors: Optional[List[str]] = None
    # transaction costs
    brokerage_per_leg: float = Field(default=20.0, ge=0, le=1000)
    cost_pct_per_leg: float = Field(default=0.15, ge=0, le=2)


class StrategySpec(BaseModel):
    label: str
    strategy_type: str = "peak_dip"
    dip_min: float = 5.0
    dip_max: float = 15.0
    lookback_days: int = 20
    daily_drop_min: float = 2.0
    daily_drop_max: float = 5.0
    weekly_drop_min: float = 5.0
    weekly_drop_max: float = 12.0
    consecutive_down_min: int = 3
    recovery_target: float = 8.0
    stop_loss: float = 7.0
    max_holding_days: int = 0
    max_positions: int = 20
    max_picks_per_day: int = 0
    sectors: Optional[List[str]] = None
    brokerage_per_leg: float = 20.0
    cost_pct_per_leg: float = 0.15


class CompareRequest(BaseModel):
    capital: float = Field(default=500000.0, ge=10000, le=100000000)
    weeks: int = Field(default=4, ge=1, le=26)
    universe: str = Field(default="nifty50")
    strategies: List[StrategySpec] = Field(..., min_length=1, max_length=5)


class SimulationRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    params: dict
    kpis: dict


# --------- Helpers ---------
def _validate_request(req: SimulationRequest):
    if req.strategy_type not in VALID_STRATEGIES:
        raise HTTPException(
            status_code=400,
            detail=f"strategy_type must be one of {sorted(VALID_STRATEGIES)}",
        )
    if req.universe not in UNIVERSES:
        raise HTTPException(
            status_code=400,
            detail=f"universe must be one of {sorted(UNIVERSES.keys())}",
        )
    if req.strategy_type == "peak_dip" and req.dip_min >= req.dip_max:
        raise HTTPException(status_code=400, detail="dip_min must be less than dip_max")
    if req.strategy_type == "daily_drop" and req.daily_drop_min >= req.daily_drop_max:
        raise HTTPException(
            status_code=400, detail="daily_drop_min must be less than daily_drop_max"
        )
    if req.strategy_type == "weekly_drop" and req.weekly_drop_min >= req.weekly_drop_max:
        raise HTTPException(
            status_code=400, detail="weekly_drop_min must be less than weekly_drop_max"
        )


# --------- Routes ---------
@api_router.get("/")
async def root():
    return {"service": "NSE Swing Trading Simulator", "status": "ok"}


@api_router.get("/universes")
async def list_universes():
    out = []
    sectors = set()
    for key, (label, stocks) in UNIVERSES.items():
        for s in stocks:
            sectors.add(s["sector"])
        out.append({"key": key, "label": label, "size": len(stocks)})
    return {"universes": out, "sectors": sorted(sectors)}


@api_router.get("/nifty50")
async def list_nifty50():
    """Backward-compatible: returns Nifty 50 list."""
    stocks = get_universe("nifty50")
    sectors = sorted({s["sector"] for s in stocks})
    return {"stocks": stocks, "sectors": sectors, "count": len(stocks)}


@api_router.get("/universe/{key}")
async def get_universe_route(key: str):
    if key not in UNIVERSES:
        raise HTTPException(status_code=404, detail="Universe not found")
    label, stocks = UNIVERSES[key]
    sectors = sorted({s["sector"] for s in stocks})
    return {"key": key, "label": label, "stocks": stocks, "sectors": sectors, "count": len(stocks)}


@api_router.post("/simulate")
async def simulate(req: SimulationRequest):
    _validate_request(req)
    try:
        result = await run_in_threadpool(
            run_simulation,
            capital=req.capital,
            weeks=req.weeks,
            universe=req.universe,
            strategy_type=req.strategy_type,
            dip_min=req.dip_min,
            dip_max=req.dip_max,
            lookback_days=req.lookback_days,
            daily_drop_min=req.daily_drop_min,
            daily_drop_max=req.daily_drop_max,
            weekly_drop_min=req.weekly_drop_min,
            weekly_drop_max=req.weekly_drop_max,
            consecutive_down_min=req.consecutive_down_min,
            recovery_target=req.recovery_target,
            stop_loss=req.stop_loss,
            max_holding_days=req.max_holding_days,
            max_positions=req.max_positions,
            max_picks_per_day=req.max_picks_per_day,
            sectors=req.sectors,
            brokerage_per_leg=req.brokerage_per_leg,
            cost_pct_per_leg=req.cost_pct_per_leg,
        )
    except Exception as e:
        logger.exception("simulation failed")
        raise HTTPException(status_code=500, detail=f"Simulation failed: {e}")

    if result.get("error"):
        raise HTTPException(status_code=502, detail=result["error"])

    record = SimulationRecord(params=result.get("params", {}), kpis=result.get("kpis", {}))
    doc = record.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.simulations.insert_one(doc)
    result["run_id"] = record.id
    return result


@api_router.post("/compare")
async def compare(req: CompareRequest):
    if req.universe not in UNIVERSES:
        raise HTTPException(status_code=400, detail="Invalid universe")
    for s in req.strategies:
        if s.strategy_type not in VALID_STRATEGIES:
            raise HTTPException(
                status_code=400, detail=f"Invalid strategy_type: {s.strategy_type}"
            )
    try:
        result = await run_in_threadpool(
            run_compare,
            capital=req.capital,
            weeks=req.weeks,
            universe=req.universe,
            strategies=[s.model_dump() for s in req.strategies],
        )
    except Exception as e:
        logger.exception("compare failed")
        raise HTTPException(status_code=500, detail=f"Compare failed: {e}")
    if result.get("error"):
        raise HTTPException(status_code=502, detail=result["error"])
    return result


@api_router.get("/simulations")
async def list_simulations():
    docs = (
        await db.simulations.find({}, {"_id": 0})
        .sort("created_at", -1)
        .to_list(50)
    )
    return {"simulations": docs}


# ============== UPSTOX LIVE TRADING ==============
USER_ID = "default"  # single-user MVP


class PlaceOrderBody(BaseModel):
    symbol: str = Field(..., description="NSE symbol e.g. RELIANCE")
    quantity: int = Field(..., gt=0)
    transaction_type: str = Field(..., pattern="^(BUY|SELL)$")
    order_type: str = Field(default="MARKET", pattern="^(MARKET|LIMIT)$")
    product: str = Field(default="D", pattern="^(D|I)$")  # D=CNC, I=MIS
    price: float = Field(default=0.0, ge=0)
    validity: str = Field(default="DAY", pattern="^(DAY|IOC)$")


class QuoteRequest(BaseModel):
    symbols: List[str] = Field(..., min_length=1, max_length=500)


async def _get_active_token() -> Optional[str]:
    doc = await db.upstox_tokens.find_one(
        {"user_id": USER_ID, "is_active": True}, {"_id": 0}
    )
    if not doc:
        return None
    expires_at = doc.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at and expires_at < datetime.now(timezone.utc):
        await db.upstox_tokens.update_one(
            {"user_id": USER_ID}, {"$set": {"is_active": False}}
        )
        return None
    try:
        return ux.decrypt_token(doc["encrypted_token"])
    except Exception as e:
        logger.exception(f"Token decrypt failed: {e}")
        return None


async def _require_token() -> str:
    tok = await _get_active_token()
    if not tok:
        raise HTTPException(
            status_code=401,
            detail="Upstox not connected. Click 'Connect Upstox' to authorize.",
        )
    return tok


@api_router.get("/upstox/status")
async def upstox_status():
    tok = await _get_active_token()
    if not tok:
        return {
            "connected": False,
            "instruments_loaded": ux.instrument_count(),
        }
    profile = None
    try:
        p = await ux.get_profile(tok)
        profile = p.get("data", {})
    except Exception as e:
        logger.warning(f"profile fetch err: {e}")
    return {
        "connected": True,
        "profile": {
            "user_name": (profile or {}).get("user_name"),
            "email": (profile or {}).get("email"),
            "user_id": (profile or {}).get("user_id"),
            "broker": (profile or {}).get("broker", "UPSTOX"),
        }
        if profile
        else None,
        "instruments_loaded": ux.instrument_count(),
    }


@api_router.get("/upstox/auth/url")
async def upstox_auth_url():
    if not os.environ.get("UPSTOX_API_KEY"):
        raise HTTPException(status_code=500, detail="UPSTOX_API_KEY not configured")
    return ux.build_auth_url()


@api_router.get("/upstox/callback")
async def upstox_callback(code: str = "", state: str = "", error: str = ""):
    """OAuth redirect URI. Exchanges code for token, then redirects to /live."""
    base = os.environ.get("APP_BASE_URL", "/")
    if error:
        return RedirectResponse(url=f"{base}/live?upstox=error&detail={error}")
    if not code:
        return RedirectResponse(url=f"{base}/live?upstox=error&detail=missing_code")
    if state and not ux.consume_state(state):
        logger.warning("State mismatch but proceeding (single-user MVP)")
    try:
        token_resp = await ux.exchange_code(code)
    except Exception:
        logger.exception("token exchange")
        return RedirectResponse(url=f"{base}/live?upstox=error&detail=exchange_failed")

    access_token = token_resp.get("access_token")
    if not access_token:
        return RedirectResponse(url=f"{base}/live?upstox=error&detail=no_token")

    enc = ux.encrypt_token(access_token)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=24)
    await db.upstox_tokens.replace_one(
        {"user_id": USER_ID},
        {
            "user_id": USER_ID,
            "encrypted_token": enc,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "expires_at": expires_at.isoformat(),
            "is_active": True,
            "broker_user_name": token_resp.get("user_name"),
            "broker_user_id": token_resp.get("user_id"),
        },
        upsert=True,
    )
    return RedirectResponse(url=f"{base}/live?upstox=ok")


@api_router.post("/upstox/disconnect")
async def upstox_disconnect():
    await db.upstox_tokens.update_one(
        {"user_id": USER_ID}, {"$set": {"is_active": False}}
    )
    return {"ok": True}


@api_router.get("/upstox/funds")
async def upstox_funds():
    tok = await _require_token()
    try:
        return await ux.get_funds(tok)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@api_router.get("/upstox/holdings")
async def upstox_holdings():
    tok = await _require_token()
    try:
        return await ux.get_holdings(tok)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@api_router.get("/upstox/positions")
async def upstox_positions():
    tok = await _require_token()
    try:
        return await ux.get_positions(tok)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@api_router.get("/upstox/orders")
async def upstox_orders():
    tok = await _require_token()
    try:
        return await ux.get_orders(tok)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@api_router.delete("/upstox/orders/{order_id}")
async def upstox_cancel_order(order_id: str):
    tok = await _require_token()
    try:
        return await ux.cancel_order(tok, order_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@api_router.post("/upstox/orders/place")
async def upstox_place_order(body: PlaceOrderBody):
    tok = await _require_token()
    inst = ux.lookup_instrument(body.symbol)
    if not inst:
        raise HTTPException(
            status_code=404,
            detail=f"Instrument key not found for symbol '{body.symbol}'. Try refreshing instruments.",
        )
    try:
        result = await ux.place_order(
            tok,
            instrument_key=inst["instrument_key"],
            quantity=body.quantity,
            transaction_type=body.transaction_type,
            order_type=body.order_type,
            product=body.product,
            price=body.price,
            validity=body.validity,
        )
        # log audit
        await db.upstox_orders_log.insert_one(
            {
                "user_id": USER_ID,
                "ts": datetime.now(timezone.utc).isoformat(),
                "request": body.model_dump(),
                "instrument_key": inst["instrument_key"],
                "response": result,
            }
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@api_router.post("/upstox/quote")
async def upstox_quote(req: QuoteRequest):
    tok = await _require_token()
    keys: List[str] = []
    missing: List[str] = []
    for s in req.symbols:
        inst = ux.lookup_instrument(s)
        if inst:
            keys.append(inst["instrument_key"])
        else:
            missing.append(s)
    if not keys:
        return {"data": {}, "missing": missing}
    try:
        quotes = await ux.get_ltp(tok, keys)
        return {"data": quotes.get("data", {}), "missing": missing}
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))


@api_router.get("/upstox/instruments/{symbol}")
async def upstox_instrument_lookup(symbol: str):
    inst = ux.lookup_instrument(symbol)
    if not inst:
        raise HTTPException(status_code=404, detail="Symbol not found")
    return inst


@api_router.post("/upstox/instruments/refresh")
async def upstox_instruments_refresh():
    m = await ux.fetch_instrument_map()
    return {"count": len(m)}


# --------- Live strategy scan + execute ---------
class ScanRequest(BaseModel):
    universe: str = Field(default="nifty200")
    drop_min: float = Field(default=2.0, ge=0, le=20)
    drop_max: float = Field(default=4.0, ge=0, le=30)
    top_n: int = Field(default=20, ge=1, le=50)
    sectors: Optional[List[str]] = None
    min_mcap_cr: float = Field(default=0.0, ge=0, le=10000000)
    max_price: float = Field(default=0.0, ge=0, le=1000000)


class ExecuteRequest(BaseModel):
    candidates: List[dict] = Field(..., min_length=1, max_length=50)
    capital: float = Field(..., gt=0, le=10000000)
    slots: int = Field(..., ge=1, le=20)
    product: str = Field(default="D", pattern="^(D|I)$")
    skip_held: bool = Field(default=True)
    target_pct: float = Field(default=3.0, ge=0.5, le=30)
    stop_pct: float = Field(default=4.0, ge=0.5, le=30)
    max_holding_days: int = Field(default=4, ge=1, le=30)
    place_exits: bool = Field(default=True)


class AutoStrategyRequest(BaseModel):
    capital: float = Field(default=50000.0, gt=0, le=10000000)
    slots: int = Field(default=5, ge=1, le=20)
    universe: str = Field(default="nifty200")
    drop_min: float = Field(default=2.0, ge=0, le=20)
    drop_max: float = Field(default=4.0, ge=0, le=30)
    product: str = Field(default="D", pattern="^(D|I)$")
    sectors: Optional[List[str]] = None
    skip_held: bool = Field(default=True)
    min_mcap_cr: float = Field(default=0.0, ge=0, le=10000000)
    max_price: float = Field(default=0.0, ge=0, le=1000000)
    target_pct: float = Field(default=3.0, ge=0.5, le=30)
    stop_pct: float = Field(default=4.0, ge=0.5, le=30)
    max_holding_days: int = Field(default=4, ge=1, le=30)
    place_exits: bool = Field(default=True)


@api_router.post("/upstox/scan")
async def upstox_scan(req: ScanRequest):
    tok = await _require_token()
    if req.drop_min >= req.drop_max:
        raise HTTPException(status_code=400, detail="drop_min must be < drop_max")
    try:
        result = await scan_daily_dips(
            tok,
            universe=req.universe,
            drop_min=req.drop_min,
            drop_max=req.drop_max,
            top_n=req.top_n,
            sectors=req.sectors,
            min_mcap_cr=req.min_mcap_cr,
            max_price=req.max_price,
        )
    except Exception as e:
        logger.exception("scan failed")
        raise HTTPException(status_code=502, detail=str(e))
    if result.get("error"):
        raise HTTPException(status_code=502, detail=result["error"])
    # log scan
    await db.upstox_scans_log.insert_one(
        {"ts": datetime.now(timezone.utc).isoformat(), "request": req.model_dump(), "count": result.get("count", 0)}
    )
    return result


@api_router.post("/upstox/strategy/execute")
async def upstox_execute(req: ExecuteRequest):
    """Execute orders against a list of pre-scanned candidates.
    Also auto-places target (SELL LIMIT) + stop-loss (SELL SL-M) orders if place_exits=True."""
    tok = await _require_token()
    try:
        result = await execute_picks(
            tok,
            candidates=req.candidates,
            capital=req.capital,
            slots=req.slots,
            product=req.product,
            skip_held=req.skip_held,
            target_pct=req.target_pct,
            stop_pct=req.stop_pct,
            place_exits=req.place_exits,
            max_holding_days=req.max_holding_days,
            db=db,
        )
    except Exception as e:
        logger.exception("execute failed")
        raise HTTPException(status_code=502, detail=str(e))
    await db.upstox_strategy_runs.insert_one(
        {
            "ts": datetime.now(timezone.utc).isoformat(),
            "request": req.model_dump(exclude={"candidates"}),
            "candidates_count": len(req.candidates),
            "result_summary": {
                "placed": result.get("placed"),
                "skipped": result.get("skipped"),
                "failed": result.get("failed"),
                "targets_set": result.get("targets_set"),
                "stops_set": result.get("stops_set"),
                "total_invested_estimate": result.get("total_invested_estimate"),
            },
        }
    )
    return result


@api_router.post("/upstox/strategy/manage")
async def upstox_manage_positions(max_holding_days: int = 4):
    """Sweep all open swing positions. Force-sell anything held >= max_holding_days."""
    tok = await _require_token()
    try:
        result = await manage_swing_positions(tok, db, max_holding_days=max_holding_days)
    except Exception as e:
        logger.exception("manage failed")
        raise HTTPException(status_code=502, detail=str(e))
    return result


@api_router.post("/upstox/strategy/rearm_exits")
async def upstox_rearm_exits():
    """Re-arm DAY-validity target/stop orders for open swing positions.
    Target/stop orders auto-cancel at 15:30 IST — call this each market open
    to keep multi-day swings protected. Also reconciles closed-by-target/stop
    positions and marks them as exited in the DB."""
    tok = await _require_token()
    try:
        result = await rearm_swing_exits(tok, db)
    except Exception as e:
        logger.exception("rearm failed")
        raise HTTPException(status_code=502, detail=str(e))
    await db.upstox_strategy_runs.insert_one(
        {
            "ts": datetime.now(timezone.utc).isoformat(),
            "mode": "rearm_exits",
            "result_summary": {
                "open_count": result.get("open_count"),
                "rearmed_targets": result.get("rearmed_targets"),
                "rearmed_stops": result.get("rearmed_stops"),
            },
        }
    )
    return result


@api_router.get("/upstox/strategy/swing-positions")
async def upstox_swing_positions():
    docs = await db.swing_positions.find({}, {"_id": 0}).sort("buy_date", -1).to_list(200)
    open_count = sum(1 for d in docs if d.get("status") == "open")
    return {"positions": docs, "open_count": open_count, "total_count": len(docs)}


@api_router.get("/upstox/dashboard/fees")
async def upstox_dashboard_fees():
    """Estimate today's NSE delivery fees from completed orders.
    Uses standard regulatory rates: brokerage ₹20/leg, STT 0.1% sell, exchange 0.00345%,
    GST 18%, stamp 0.015% buy. Approximate ±5%."""
    tok = await _require_token()
    BROKER_PER_LEG = 20.0
    STT_SELL = 0.001
    EXCHANGE = 0.0000345
    GST_RATE = 0.18
    STAMP_BUY = 0.00015

    try:
        resp = await ux.get_orders(tok)
        orders = resp.get("data") or []
    except Exception as e:
        raise HTTPException(status_code=502, detail=str(e))

    brokerage = stt = exchange = stamp = traded_value = 0.0
    completed = 0
    by_side = {"BUY": 0, "SELL": 0}
    for o in orders:
        status = (o.get("status") or "").upper()
        if status not in ("COMPLETE", "PARTIALLY FILLED"):
            continue
        side = (o.get("transaction_type") or "").upper()
        qty = o.get("filled_quantity") or o.get("quantity") or 0
        price = o.get("average_price") or o.get("price") or 0
        if not qty or not price:
            continue
        value = qty * price
        traded_value += value
        completed += 1
        by_side[side] = by_side.get(side, 0) + 1
        brokerage += BROKER_PER_LEG
        exchange += value * EXCHANGE
        if side == "BUY":
            stamp += value * STAMP_BUY
        elif side == "SELL":
            stt += value * STT_SELL
    gst = (brokerage + exchange) * GST_RATE
    total = brokerage + stt + exchange + stamp + gst
    return {
        "completed_orders": completed,
        "buy_count": by_side.get("BUY", 0),
        "sell_count": by_side.get("SELL", 0),
        "traded_value": round(traded_value, 2),
        "brokerage": round(brokerage, 2),
        "stt": round(stt, 2),
        "exchange_charges": round(exchange, 2),
        "stamp_duty": round(stamp, 2),
        "gst": round(gst, 2),
        "total_fees": round(total, 2),
        "fees_pct_of_volume": round((total / traded_value * 100) if traded_value > 0 else 0, 3),
        "note": "Approximate. Actual charges shown by Upstox in contract notes (±5%).",
    }


@api_router.get("/upstox/dashboard/pnl")
async def upstox_dashboard_pnl():
    """Aggregate P&L across holdings + positions + closed swings."""
    tok = await _require_token()
    holdings_invested = 0.0
    holdings_value = 0.0
    holdings_pnl = 0.0
    holdings_day_pnl = 0.0
    holdings_count = 0
    try:
        h = await ux.get_holdings(tok)
        for it in (h.get("data") or []):
            qty = it.get("quantity") or 0
            avg = it.get("average_price") or 0
            ltp = it.get("last_price") or 0
            day = it.get("day_change") or 0
            holdings_invested += avg * qty
            holdings_value += ltp * qty
            holdings_pnl += (ltp - avg) * qty
            holdings_day_pnl += day * qty
            if qty > 0:
                holdings_count += 1
    except Exception as e:
        logger.warning(f"holdings pnl error: {e}")

    positions_pnl = 0.0
    positions_count = 0
    try:
        p = await ux.get_positions(tok)
        for it in (p.get("data") or []):
            qty = it.get("quantity") or 0
            if qty != 0:
                positions_count += 1
                positions_pnl += it.get("pnl") or 0
    except Exception as e:
        logger.warning(f"positions pnl error: {e}")

    return {
        "holdings": {
            "count": holdings_count,
            "invested": round(holdings_invested, 2),
            "current_value": round(holdings_value, 2),
            "unrealized_pnl": round(holdings_pnl, 2),
            "unrealized_pnl_pct": round((holdings_pnl / holdings_invested * 100) if holdings_invested > 0 else 0, 2),
            "day_pnl": round(holdings_day_pnl, 2),
        },
        "positions": {
            "count": positions_count,
            "pnl": round(positions_pnl, 2),
        },
        "total_unrealized_pnl": round(holdings_pnl + positions_pnl, 2),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }


@api_router.post("/upstox/strategy/auto")
async def upstox_auto_strategy(req: AutoStrategyRequest):
    """One-shot scan+execute. Used for the 'Auto-Execute Top N' button."""
    tok = await _require_token()
    if req.drop_min >= req.drop_max:
        raise HTTPException(status_code=400, detail="drop_min must be < drop_max")
    try:
        scan = await scan_daily_dips(
            tok,
            universe=req.universe,
            drop_min=req.drop_min,
            drop_max=req.drop_max,
            top_n=req.slots,
            sectors=req.sectors,
            min_mcap_cr=req.min_mcap_cr,
            max_price=req.max_price,
        )
        if scan.get("error"):
            raise HTTPException(status_code=502, detail=scan["error"])
        if not scan.get("candidates"):
            return {
                "scan": scan,
                "execution": {"placed": 0, "skipped": 0, "failed": 0, "results": [], "message": "No candidates matched criteria"},
            }
        execution = await execute_picks(
            tok,
            candidates=scan["candidates"],
            capital=req.capital,
            slots=req.slots,
            product=req.product,
            skip_held=req.skip_held,
            target_pct=req.target_pct,
            stop_pct=req.stop_pct,
            place_exits=req.place_exits,
            max_holding_days=req.max_holding_days,
            db=db,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("auto strategy failed")
        raise HTTPException(status_code=502, detail=str(e))
    await db.upstox_strategy_runs.insert_one(
        {
            "ts": datetime.now(timezone.utc).isoformat(),
            "mode": "auto",
            "request": req.model_dump(),
            "scan_count": scan.get("count"),
            "result_summary": {
                "placed": execution.get("placed"),
                "skipped": execution.get("skipped"),
                "failed": execution.get("failed"),
            },
        }
    )
    return {"scan": scan, "execution": execution}


@api_router.get("/upstox/strategy/runs")
async def upstox_strategy_runs():
    docs = await db.upstox_strategy_runs.find({}, {"_id": 0}).sort("ts", -1).to_list(20)
    return {"runs": docs}


@api_router.get("/upstox/diagnostic")
async def upstox_diagnostic():
    """Show this pod's current public egress IP — paste it into Upstox app
    'Allowed IPs' (Apps → Edit → Static IP) to unblock UDAPI1154 errors.
    Also shows token presence + instrument map status for quick health checks."""
    egress_ip = None
    egress_err = None
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            r = await client.get("https://api.ipify.org?format=json")
        if r.status_code == 200:
            egress_ip = (r.json() or {}).get("ip")
        else:
            egress_err = f"ipify returned {r.status_code}"
    except Exception as e:
        egress_err = str(e)[:160]

    has_token = False
    profile_user = None
    try:
        doc = await db.upstox_tokens.find_one(
            {"user_id": USER_ID, "is_active": True}, {"_id": 0}
        )
        if doc:
            has_token = True
            prof = doc.get("profile") or {}
            profile_user = prof.get("user_name") or prof.get("user_id") or prof.get("email")
    except Exception:
        pass

    return {
        "egress_ip": egress_ip,
        "egress_err": egress_err,
        "instruments_loaded": ux.instrument_count(),
        "upstox_token_present": has_token,
        "upstox_user": profile_user,
        "redirect_uri": os.environ.get("UPSTOX_REDIRECT_URI"),
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "note": "If Upstox UDAPI1154 (IP blocked) errors fire, paste egress_ip into the Upstox app's Allowed IPs whitelist.",
    }


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()


@app.on_event("startup")
async def load_upstox_instruments():
    """Fetch Upstox instrument map at startup (non-blocking)."""
    try:
        await ux.fetch_instrument_map()
    except Exception as e:
        logger.warning(f"Instrument prefetch failed: {e}")
