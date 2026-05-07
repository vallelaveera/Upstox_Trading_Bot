from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
from pathlib import Path
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from pydantic import BaseModel, Field, ConfigDict

from universe import UNIVERSES, get_universe
from simulator import run_simulation, run_compare, VALID_STRATEGIES
import upstox_client as ux
from strategy_live import scan_daily_dips, execute_picks


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


class ExecuteRequest(BaseModel):
    candidates: List[dict] = Field(..., min_length=1, max_length=50)
    capital: float = Field(..., gt=0, le=10000000)
    slots: int = Field(..., ge=1, le=20)
    product: str = Field(default="D", pattern="^(D|I)$")
    skip_held: bool = Field(default=True)


class AutoStrategyRequest(BaseModel):
    capital: float = Field(default=50000.0, gt=0, le=10000000)
    slots: int = Field(default=5, ge=1, le=20)
    universe: str = Field(default="nifty200")
    drop_min: float = Field(default=2.0, ge=0, le=20)
    drop_max: float = Field(default=4.0, ge=0, le=30)
    product: str = Field(default="D", pattern="^(D|I)$")
    sectors: Optional[List[str]] = None
    skip_held: bool = Field(default=True)


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
    """Execute orders against a list of pre-scanned candidates."""
    tok = await _require_token()
    try:
        result = await execute_picks(
            tok,
            candidates=req.candidates,
            capital=req.capital,
            slots=req.slots,
            product=req.product,
            skip_held=req.skip_held,
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
                "total_invested_estimate": result.get("total_invested_estimate"),
            },
        }
    )
    return result


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
