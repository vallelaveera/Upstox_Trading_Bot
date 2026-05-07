from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import uuid
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional

from pydantic import BaseModel, Field, ConfigDict

from universe import UNIVERSES, get_universe
from simulator import run_simulation, run_compare, VALID_STRATEGIES


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
