"""V4 feature tests:
- /api/upstox/scan max_price filter
- /api/upstox/dashboard/fees schema + sanity totals
- /api/upstox/strategy/rearm_exits schema
- /api/upstox/diagnostic
- /api/upstox/strategy/auto max_price body validation (no 422)
"""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dip-recovery-lab.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def upstox_connected(session):
    r = session.get(f"{API}/upstox/status", timeout=20)
    assert r.status_code == 200, f"status endpoint failed: {r.status_code}"
    data = r.json()
    return bool(data.get("connected"))


# ---------------- /api/upstox/scan max_price ----------------
class TestScanMaxPrice:
    def test_scan_max_price_500(self, session, upstox_connected):
        if not upstox_connected:
            pytest.skip("Upstox not connected — skipping auth-gated scan test")
        body = {
            "universe": "nifty50",
            "drop_min": 0.5,
            "drop_max": 15,
            "max_price": 500,
            "top_n": 20,
        }
        r = session.post(f"{API}/upstox/scan", json=body, timeout=120)
        assert r.status_code == 200, f"unexpected {r.status_code}: {r.text[:300]}"
        data = r.json()
        assert "candidates" in data
        cands = data["candidates"] or []
        # Every candidate must have ltp <= 500
        for c in cands:
            ltp = c.get("ltp")
            assert ltp is not None, f"candidate missing ltp: {c}"
            assert ltp <= 500, f"{c.get('symbol')} ltp={ltp} exceeds max_price=500"

    def test_scan_max_price_zero_no_filter(self, session, upstox_connected):
        if not upstox_connected:
            pytest.skip("Upstox not connected")
        body = {
            "universe": "nifty50",
            "drop_min": 0.5,
            "drop_max": 15,
            "max_price": 0,
            "top_n": 20,
        }
        r = session.post(f"{API}/upstox/scan", json=body, timeout=120)
        assert r.status_code == 200
        data = r.json()
        # With max_price=0, filter is disabled; we just verify request was accepted and may include >500 prices
        assert "candidates" in data
        # Note: count >= count from filtered scan (cannot strictly compare due to live market motion)


# ---------------- /api/upstox/dashboard/fees ----------------
class TestFeesDashboard:
    def test_fees_schema_and_totals(self, session, upstox_connected):
        if not upstox_connected:
            pytest.skip("Upstox not connected")
        r = session.get(f"{API}/upstox/dashboard/fees", timeout=30)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
        data = r.json()
        # Required schema
        required = [
            "completed_orders", "buy_count", "sell_count", "traded_value",
            "brokerage", "stt", "exchange_charges", "stamp_duty", "gst",
            "total_fees", "fees_pct_of_volume", "note",
        ]
        for k in required:
            assert k in data, f"missing key: {k}"
        # Sanity: gst == (brokerage + exchange_charges) * 0.18 within ₹1
        expected_gst = (data["brokerage"] + data["exchange_charges"]) * 0.18
        assert abs(data["gst"] - expected_gst) <= 1.0, (
            f"gst {data['gst']} != (brokerage+exchange)*0.18 = {expected_gst}"
        )
        # Sanity: brokerage == completed_orders * 20 (with rounding)
        assert abs(data["brokerage"] - data["completed_orders"] * 20.0) <= 1.0, (
            f"brokerage {data['brokerage']} != completed_orders*20"
        )
        # Counts consistency
        assert data["buy_count"] + data["sell_count"] == data["completed_orders"]


# ---------------- /api/upstox/strategy/rearm_exits ----------------
class TestRearmExits:
    def test_rearm_exits_schema(self, session, upstox_connected):
        if not upstox_connected:
            pytest.skip("Upstox not connected")
        r = session.post(f"{API}/upstox/strategy/rearm_exits", json={}, timeout=60)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
        data = r.json()
        for k in ["checked_at", "open_count", "rearmed_targets", "rearmed_stops", "actions"]:
            assert k in data, f"missing: {k}"
        assert isinstance(data["actions"], list)
        for action in data["actions"]:
            assert "symbol" in action, f"action missing symbol: {action}"
            assert "qty" in action, f"action missing qty: {action}"


# ---------------- /api/upstox/diagnostic ----------------
class TestDiagnostic:
    def test_diagnostic(self, session):
        # Diagnostic should NOT require token
        r = session.get(f"{API}/upstox/diagnostic", timeout=20)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"
        data = r.json()
        for k in ["egress_ip", "instruments_loaded", "upstox_token_present", "redirect_uri", "checked_at", "note"]:
            assert k in data, f"missing: {k}"
        assert data["egress_ip"], f"egress_ip empty: {data}"
        assert isinstance(data["instruments_loaded"], int) and data["instruments_loaded"] > 0
        assert isinstance(data["upstox_token_present"], bool)
        assert data["redirect_uri"], "redirect_uri empty"


# ---------------- /api/upstox/strategy/auto body validation ----------------
class TestAutoStrategyBodyValidation:
    def test_auto_accepts_max_price_no_422(self, session):
        """Validates pydantic schema accepts max_price; 401/connected gating is fine, 422 is not."""
        body = {
            "capital": 50000,
            "slots": 5,
            "universe": "nifty50",
            "drop_min": 0.5,
            "drop_max": 15,
            "max_price": 500,
        }
        r = session.post(f"{API}/upstox/strategy/auto", json=body, timeout=180)
        assert r.status_code != 422, f"422 validation rejection: {r.text[:300]}"
        # 200, 401, 502 are all acceptable — we only care body validation passed
        assert r.status_code in (200, 401, 502, 400), f"unexpected status: {r.status_code} {r.text[:200]}"
