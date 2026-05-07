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

from nifty50 import NIFTY_50
from simulator import run_simulation


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

app = FastAPI(title="NSE Swing Trading Simulator")
api_router = APIRouter(prefix="/api")


# --------- Models ---------
class SimulationRequest(BaseModel):
    capital: float = Field(default=500000.0, ge=10000, le=100000000)
    weeks: int = Field(default=4, ge=1, le=26)
    dip_min: float = Field(default=5.0, ge=0, le=50)
    dip_max: float = Field(default=15.0, ge=0, le=80)
    recovery_target: float = Field(default=8.0, ge=1, le=50)
    stop_loss: float = Field(default=7.0, ge=1, le=50)
    lookback_days: int = Field(default=20, ge=5, le=120)
    max_positions: int = Field(default=20, ge=1, le=50)
    sectors: Optional[List[str]] = None


class SimulationRecord(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    params: dict
    kpis: dict


# --------- Routes ---------
@api_router.get("/")
async def root():
    return {"service": "NSE Swing Trading Simulator", "status": "ok"}


@api_router.get("/nifty50")
async def list_nifty50():
    sectors = sorted({s["sector"] for s in NIFTY_50})
    return {"stocks": NIFTY_50, "sectors": sectors, "count": len(NIFTY_50)}


@api_router.post("/simulate")
async def simulate(req: SimulationRequest):
    if req.dip_min >= req.dip_max:
        raise HTTPException(status_code=400, detail="dip_min must be less than dip_max")
    try:
        result = await run_in_threadpool(
            run_simulation,
            capital=req.capital,
            weeks=req.weeks,
            dip_min=req.dip_min,
            dip_max=req.dip_max,
            recovery_target=req.recovery_target,
            stop_loss=req.stop_loss,
            lookback_days=req.lookback_days,
            max_positions=req.max_positions,
            sectors=req.sectors,
        )
    except Exception as e:
        logger.exception("simulation failed")
        raise HTTPException(status_code=500, detail=f"Simulation failed: {e}")

    if result.get("error"):
        raise HTTPException(status_code=502, detail=result["error"])

    # persist a lightweight record
    record = SimulationRecord(params=result.get("params", {}), kpis=result.get("kpis", {}))
    doc = record.model_dump()
    doc["created_at"] = doc["created_at"].isoformat()
    await db.simulations.insert_one(doc)
    result["run_id"] = record.id
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

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
