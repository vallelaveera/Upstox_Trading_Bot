"""Upstox API v2 client + token management."""
from __future__ import annotations

import base64
import gzip
import hashlib
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet

logger = logging.getLogger(__name__)

UPSTOX_AUTH_DIALOG = "https://api.upstox.com/v2/login/authorization/dialog"
UPSTOX_TOKEN_URL = "https://api.upstox.com/v2/login/authorization/token"
UPSTOX_API_BASE = "https://api.upstox.com/v2"
UPSTOX_HFT_BASE = "https://api-hft.upstox.com/v2"
UPSTOX_INSTRUMENTS_URL = (
    "https://assets.upstox.com/market-quote/instruments/exchange/NSE.csv.gz"
)


# --------- Cipher for token encryption (derived from API secret) ---------
def _cipher() -> Fernet:
    secret = os.environ.get("UPSTOX_API_SECRET", "default-secret-change-me")
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest())
    return Fernet(key)


def encrypt_token(token: str) -> str:
    return _cipher().encrypt(token.encode()).decode()


def decrypt_token(enc: str) -> str:
    return _cipher().decrypt(enc.encode()).decode()


# --------- OAuth flow ---------
_state_store: Dict[str, datetime] = {}


def make_state() -> str:
    state = secrets.token_urlsafe(24)
    _state_store[state] = datetime.now(timezone.utc) + timedelta(minutes=15)
    # cleanup expired
    now = datetime.now(timezone.utc)
    for s in list(_state_store.keys()):
        if _state_store[s] < now:
            del _state_store[s]
    return state


def consume_state(state: str) -> bool:
    exp = _state_store.pop(state, None)
    if not exp:
        return False
    return exp > datetime.now(timezone.utc)


def build_auth_url() -> Dict[str, str]:
    client_id = os.environ["UPSTOX_API_KEY"]
    redirect_uri = os.environ["UPSTOX_REDIRECT_URI"]
    state = make_state()
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "state": state,
    }
    return {
        "authorization_url": f"{UPSTOX_AUTH_DIALOG}?{urlencode(params)}",
        "state": state,
    }


async def exchange_code(code: str) -> Dict:
    """Exchange authorization code for access token."""
    payload = {
        "code": code,
        "client_id": os.environ["UPSTOX_API_KEY"],
        "client_secret": os.environ["UPSTOX_API_SECRET"],
        "redirect_uri": os.environ["UPSTOX_REDIRECT_URI"],
        "grant_type": "authorization_code",
    }
    headers = {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "application/json",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(UPSTOX_TOKEN_URL, data=payload, headers=headers)
    if r.status_code != 200:
        raise RuntimeError(
            f"Upstox token exchange failed [{r.status_code}]: {r.text}"
        )
    return r.json()


# --------- Authed API calls ---------
async def _get(token: str, path: str, params: Optional[Dict] = None, base: str = UPSTOX_API_BASE) -> Dict:
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(f"{base}{path}", headers=headers, params=params)
    if r.status_code != 200:
        raise RuntimeError(f"Upstox GET {path} failed [{r.status_code}]: {r.text}")
    return r.json()


async def _post(token: str, path: str, json_body: Dict, base: str = UPSTOX_HFT_BASE) -> Dict:
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.post(f"{base}{path}", headers=headers, json=json_body)
    if r.status_code not in (200, 201):
        raise RuntimeError(f"Upstox POST {path} failed [{r.status_code}]: {r.text}")
    return r.json()


async def _delete(token: str, path: str, params: Optional[Dict] = None, base: str = UPSTOX_HFT_BASE) -> Dict:
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.delete(f"{base}{path}", headers=headers, params=params)
    if r.status_code != 200:
        raise RuntimeError(f"Upstox DELETE {path} failed [{r.status_code}]: {r.text}")
    return r.json()


async def get_profile(token: str) -> Dict:
    return await _get(token, "/user/profile")


async def get_funds(token: str) -> Dict:
    return await _get(token, "/user/get-funds-and-margin")


async def get_holdings(token: str) -> Dict:
    return await _get(token, "/portfolio/long-term-holdings")


async def get_positions(token: str) -> Dict:
    return await _get(token, "/portfolio/short-term-positions")


async def get_orders(token: str) -> Dict:
    return await _get(token, "/order/retrieve-all")


async def get_ltp(token: str, instrument_keys: List[str]) -> Dict:
    if not instrument_keys:
        return {"data": {}}
    params = {"instrument_key": ",".join(instrument_keys[:500])}
    return await _get(token, "/market-quote/ltp", params=params)


async def place_order(
    token: str,
    instrument_key: str,
    quantity: int,
    transaction_type: str,  # "BUY" | "SELL"
    order_type: str = "MARKET",  # "MARKET" | "LIMIT"
    product: str = "D",  # D=CNC, I=MIS
    price: float = 0.0,
    validity: str = "DAY",
    disclosed_quantity: int = 0,
    trigger_price: float = 0.0,
    is_amo: bool = False,
    tag: str = "swing-sim",
) -> Dict:
    body = {
        "quantity": int(quantity),
        "product": product,
        "validity": validity,
        "price": float(price) if order_type == "LIMIT" else 0.0,
        "tag": tag,
        "instrument_token": instrument_key,
        "order_type": order_type,
        "transaction_type": transaction_type,
        "disclosed_quantity": int(disclosed_quantity),
        "trigger_price": float(trigger_price),
        "is_amo": bool(is_amo),
    }
    return await _post(token, "/order/place", body)


async def cancel_order(token: str, order_id: str) -> Dict:
    return await _delete(token, "/order/cancel", params={"order_id": order_id})


# --------- Instrument map fetching ---------
_instrument_map: Dict[str, Dict] = {}  # symbol -> {instrument_key, name, isin, ...}


async def fetch_instrument_map() -> Dict[str, Dict]:
    """Download Upstox NSE instruments csv.gz, parse, and cache symbol→instrument_key."""
    global _instrument_map
    import csv
    import io

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            r = await client.get(UPSTOX_INSTRUMENTS_URL)
        if r.status_code != 200:
            logger.warning(f"Instruments fetch failed: {r.status_code}")
            return _instrument_map
        decompressed = gzip.decompress(r.content).decode("utf-8")
        reader = csv.DictReader(io.StringIO(decompressed))
        new_map: Dict[str, Dict] = {}
        for row in reader:
            ik = (row.get("instrument_key") or "").strip()
            sym = (row.get("tradingsymbol") or row.get("trading_symbol") or "").strip()
            inst_type = (row.get("instrument_type") or "").strip().upper()
            exch = (row.get("exchange") or "").strip().upper()
            if not ik or not sym:
                continue
            # Keep NSE equity only
            if exch and exch not in ("NSE", "NSE_EQ"):
                continue
            if inst_type and inst_type not in ("EQ", "EQUITY", ""):
                continue
            # NSE_EQ instrument keys typically begin with NSE_EQ|
            if not ik.startswith("NSE_EQ|"):
                continue
            new_map[sym.upper()] = {
                "instrument_key": ik,
                "tradingsymbol": sym,
                "name": (row.get("name") or sym).strip(),
                "lot_size": row.get("lot_size", ""),
            }
        if new_map:
            _instrument_map = new_map
            logger.info(f"Loaded {len(_instrument_map)} Upstox NSE equity instruments")
        return _instrument_map
    except Exception as e:
        logger.exception(f"Instrument fetch error: {e}")
        return _instrument_map


def lookup_instrument(symbol: str) -> Optional[Dict]:
    return _instrument_map.get(symbol.upper())


def instrument_count() -> int:
    return len(_instrument_map)
