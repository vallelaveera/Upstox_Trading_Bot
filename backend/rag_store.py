"""RAG store: ingest 5-year OHLCV history as text chunks into Qdrant."""
from __future__ import annotations

import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional

import pandas as pd
from curl_cffi import requests as cffi_requests
from qdrant_client import QdrantClient
from qdrant_client.models import (
    Distance, VectorParams, PointStruct,
    Filter, FieldCondition, MatchValue, FilterSelector,
)
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

COLLECTION = "market_history"
VECTOR_SIZE = 384  # all-MiniLM-L6-v2


# ------------ singletons ------------

_client: Optional[QdrantClient] = None
_model: Optional[SentenceTransformer] = None


def _get_client() -> QdrantClient:
    global _client
    if _client is None:
        _client = QdrantClient(path="./qdrant_data")
    return _client


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        logger.info("Loading embedding model…")
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def _ensure_collection() -> None:
    c = _get_client()
    if not c.collection_exists(COLLECTION):
        c.create_collection(
            collection_name=COLLECTION,
            vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
        )


# ------------ data fetch ------------

def fetch_5yr(ticker_ns: str) -> pd.DataFrame:
    """Return daily OHLCV DataFrame for the last 5 years."""
    session = cffi_requests.Session(impersonate="chrome")
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=365 * 5 + 30)
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker_ns}"
        f"?interval=1d&period1={int(start.timestamp())}&period2={int(end.timestamp())}"
    )
    r = session.get(url, timeout=20)
    r.raise_for_status()
    result = r.json()["chart"]["result"][0]
    q = result["indicators"]["quote"][0]
    df = pd.DataFrame({
        "date": pd.to_datetime(result["timestamp"], unit="s", utc=True).normalize().strftime("%Y-%m-%d"),
        "open": q["open"],
        "high": q["high"],
        "low": q["low"],
        "close": q["close"],
        "volume": q["volume"],
    }).dropna()
    return df.reset_index(drop=True)


# ------------ text chunk builders ------------

def _daily_text(symbol: str, row: pd.Series, prev_close: float) -> str:
    chg = (row["close"] - prev_close) / prev_close * 100 if prev_close else 0
    direction = "up" if chg >= 0 else "down"
    vol_cr = (row["volume"] or 0) / 1e7
    return (
        f"{symbol} on {row['date']}: "
        f"Open ₹{row['open']:.1f}, High ₹{row['high']:.1f}, "
        f"Low ₹{row['low']:.1f}, Close ₹{row['close']:.1f}. "
        f"Moved {direction} {abs(chg):.2f}% from previous close. "
        f"Volume {vol_cr:.2f} Cr."
    )


def _weekly_text(symbol: str, wdf: pd.DataFrame) -> str:
    chg = (wdf.iloc[-1]["close"] - wdf.iloc[0]["close"]) / wdf.iloc[0]["close"] * 100
    direction = "gained" if chg >= 0 else "lost"
    return (
        f"{symbol} week of {wdf.iloc[0]['date']}: "
        f"{direction} {abs(chg):.2f}%. "
        f"High ₹{wdf['high'].max():.1f}, Low ₹{wdf['low'].min():.1f}. "
        f"Closed at ₹{wdf.iloc[-1]['close']:.1f}."
    )


def _monthly_text(symbol: str, mdf: pd.DataFrame) -> str:
    chg = (mdf.iloc[-1]["close"] - mdf.iloc[0]["close"]) / mdf.iloc[0]["close"] * 100
    direction = "gained" if chg >= 0 else "lost"
    month_label = mdf.iloc[0]["date"][:7]
    return (
        f"{symbol} in {month_label}: "
        f"{direction} {abs(chg):.2f}% over the month. "
        f"Monthly high ₹{mdf['high'].max():.1f}, low ₹{mdf['low'].min():.1f}. "
        f"Opened at ₹{mdf.iloc[0]['open']:.1f}, closed at ₹{mdf.iloc[-1]['close']:.1f}."
    )


# ------------ ingest ------------

def ingest(symbol: str, ticker_ns: str) -> int:
    """Fetch 5yr data and embed daily + weekly + monthly chunks into Qdrant."""
    _ensure_collection()
    client = _get_client()
    model = _get_model()

    logger.info("Fetching 5yr data for %s (%s)…", symbol, ticker_ns)
    df = fetch_5yr(ticker_ns)
    logger.info("Got %d trading days", len(df))

    # remove stale data for this symbol
    client.delete(
        collection_name=COLLECTION,
        points_selector=FilterSelector(
            filter=Filter(must=[FieldCondition(key="symbol", match=MatchValue(value=symbol))])
        ),
    )

    points: list[PointStruct] = []

    # daily
    for i, row in df.iterrows():
        prev_close = df.iloc[i - 1]["close"] if i > 0 else row["close"]
        text = _daily_text(symbol, row, prev_close)
        points.append(PointStruct(
            id=str(uuid.uuid4()),
            vector=model.encode(text).tolist(),
            payload={"symbol": symbol, "date": row["date"], "type": "daily", "text": text,
                     "close": row["close"]},
        ))

    # weekly
    df["date_dt"] = pd.to_datetime(df["date"])
    for _, wdf in df.groupby(df["date_dt"].dt.to_period("W")):
        text = _weekly_text(symbol, wdf)
        points.append(PointStruct(
            id=str(uuid.uuid4()),
            vector=model.encode(text).tolist(),
            payload={"symbol": symbol, "date": wdf.iloc[0]["date"], "type": "weekly", "text": text},
        ))

    # monthly
    for _, mdf in df.groupby(df["date_dt"].dt.to_period("M")):
        text = _monthly_text(symbol, mdf)
        points.append(PointStruct(
            id=str(uuid.uuid4()),
            vector=model.encode(text).tolist(),
            payload={"symbol": symbol, "date": mdf.iloc[0]["date"], "type": "monthly", "text": text},
        ))

    # batch upsert
    batch = 200
    for i in range(0, len(points), batch):
        client.upsert(collection_name=COLLECTION, points=points[i : i + batch])

    logger.info("Ingested %d chunks for %s", len(points), symbol)
    return len(points)


# ------------ query ------------

def query(question: str, symbol: str = None, top_k: int = 5) -> list[dict]:
    """Semantic search over stored market history."""
    _ensure_collection()
    client = _get_client()
    model = _get_model()

    vec = model.encode(question).tolist()
    filt = (
        Filter(must=[FieldCondition(key="symbol", match=MatchValue(value=symbol))])
        if symbol else None
    )
    result = client.query_points(
        collection_name=COLLECTION,
        query=vec,
        limit=top_k,
        query_filter=filt,
        with_payload=True,
    )
    return [{"score": round(h.score, 3), **h.payload} for h in result.points]
