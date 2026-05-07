"""Tests for Upstox v2 integration + transaction cost model in /api/simulate."""
import os
import urllib.parse
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dip-recovery-lab.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

UPSTOX_API_KEY = "71839ef0-48c7-4983-a6b8-b911c98e4d42"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ============== Cost model in /api/simulate ==============
class TestCostModel:
    def _payload(self, brokerage=20.0, cost_pct=0.15):
        return {
            "capital": 500000,
            "weeks": 4,
            "universe": "nifty50",
            "strategy_type": "peak_dip",
            "dip_min": 5.0,
            "dip_max": 15.0,
            "lookback_days": 20,
            "brokerage_per_leg": brokerage,
            "cost_pct_per_leg": cost_pct,
        }

    def test_simulate_returns_cost_kpis(self, session):
        r = session.post(f"{API}/simulate", json=self._payload(), timeout=180)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "kpis" in data
        kpis = data["kpis"]
        for k in ("gross_pnl", "total_costs", "total_brokerage", "total_taxes_slippage", "cost_drag_pct"):
            assert k in kpis, f"Missing kpi field: {k}"
        # Net P&L (net_pnl or pnl) should be lower than gross when costs > 0
        net = kpis.get("net_pnl", kpis.get("pnl"))
        gross = kpis["gross_pnl"]
        assert net is not None
        # If any trades happened, costs > 0 and net < gross. Otherwise allow equality.
        if kpis.get("total_costs", 0) > 0:
            assert net < gross
            assert kpis["total_costs"] > 0
            assert kpis["total_brokerage"] > 0

    def test_simulate_zero_costs(self, session):
        r = session.post(f"{API}/simulate", json=self._payload(brokerage=0, cost_pct=0), timeout=180)
        assert r.status_code == 200, r.text
        kpis = r.json()["kpis"]
        net = kpis.get("net_pnl", kpis.get("pnl"))
        assert kpis["total_costs"] == 0 or abs(kpis["total_costs"]) < 1e-6
        assert abs(net - kpis["gross_pnl"]) < 1e-3

    def test_simulate_high_costs_lower_net(self, session):
        low = session.post(f"{API}/simulate", json=self._payload(brokerage=0, cost_pct=0), timeout=180).json()["kpis"]
        high = session.post(f"{API}/simulate", json=self._payload(brokerage=50, cost_pct=0.5), timeout=180).json()["kpis"]
        # Higher cost run should have higher total_costs
        assert high["total_costs"] >= low["total_costs"]
        # If trades occurred, net pnl should be lower for high cost
        if high["total_costs"] > 0:
            low_net = low.get("net_pnl", low.get("pnl"))
            high_net = high.get("net_pnl", high.get("pnl"))
            assert high_net < low_net


# ============== Upstox endpoints (no auth available) ==============
class TestUpstoxStatusAndAuth:
    def test_status_when_disconnected(self, session):
        r = session.get(f"{API}/upstox/status", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["connected"] is False
        assert "instruments_loaded" in d
        assert isinstance(d["instruments_loaded"], int)

    def test_auth_url_generation(self, session):
        r = session.get(f"{API}/upstox/auth/url", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "authorization_url" in d
        assert "state" in d
        url = d["authorization_url"]
        assert UPSTOX_API_KEY in url
        assert f"client_id={UPSTOX_API_KEY}" in url
        # Check that redirect_uri is URL-encoded
        assert "redirect_uri=" in url
        # A properly URL-encoded https:// should be https%3A%2F%2F
        # Extract the redirect_uri param
        parsed = urllib.parse.urlparse(url)
        qs = urllib.parse.parse_qs(parsed.query)
        assert "redirect_uri" in qs
        ru = qs["redirect_uri"][0]
        assert ru.startswith("https://")
        assert "/api/upstox/callback" in ru
        assert qs.get("response_type") == ["code"]


class TestUpstoxInstruments:
    def test_instrument_lookup_reliance(self, session):
        r = session.get(f"{API}/upstox/instruments/RELIANCE", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "instrument_key" in d
        assert d["instrument_key"].startswith("NSE_EQ|")
        assert d.get("tradingsymbol") == "RELIANCE"
        assert "name" in d
        assert "lot_size" in d

    def test_instrument_lookup_invalid(self, session):
        r = session.get(f"{API}/upstox/instruments/INVALIDSTOCKDOESNOTEXIST", timeout=30)
        assert r.status_code == 404

    def test_instrument_refresh(self, session):
        r = session.post(f"{API}/upstox/instruments/refresh", timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "count" in d
        assert d["count"] > 5000


class TestUpstoxProtected401:
    @pytest.mark.parametrize("path", [
        "/upstox/funds",
        "/upstox/holdings",
        "/upstox/positions",
        "/upstox/orders",
    ])
    def test_get_endpoints_401(self, session, path):
        r = session.get(f"{API}{path}", timeout=30)
        assert r.status_code == 401, f"{path} expected 401, got {r.status_code}"

    def test_place_order_401(self, session):
        body = {"symbol": "RELIANCE", "quantity": 1, "transaction_type": "BUY"}
        r = session.post(f"{API}/upstox/orders/place", json=body, timeout=30)
        assert r.status_code == 401

    def test_quote_401(self, session):
        r = session.post(f"{API}/upstox/quote", json={"symbols": ["RELIANCE"]}, timeout=30)
        assert r.status_code == 401


class TestUpstoxOrderValidation:
    """When body fails Pydantic validation it should be 422 BEFORE auth check."""

    def test_invalid_transaction_type(self, session):
        r = session.post(f"{API}/upstox/orders/place", json={
            "symbol": "RELIANCE", "quantity": 1, "transaction_type": "HOLD"
        }, timeout=30)
        assert r.status_code == 422

    def test_invalid_product(self, session):
        r = session.post(f"{API}/upstox/orders/place", json={
            "symbol": "RELIANCE", "quantity": 1, "transaction_type": "BUY", "product": "X"
        }, timeout=30)
        assert r.status_code == 422

    def test_zero_quantity(self, session):
        r = session.post(f"{API}/upstox/orders/place", json={
            "symbol": "RELIANCE", "quantity": 0, "transaction_type": "BUY"
        }, timeout=30)
        assert r.status_code == 422


class TestUpstoxCallback:
    def test_callback_with_error(self, session):
        r = session.get(f"{API}/upstox/callback", params={"error": "access_denied"}, allow_redirects=False, timeout=30)
        assert r.status_code in (302, 307)
        loc = r.headers.get("location", "")
        assert "/live" in loc
        assert "upstox=error" in loc

    def test_callback_without_code(self, session):
        r = session.get(f"{API}/upstox/callback", allow_redirects=False, timeout=30)
        assert r.status_code in (302, 307)
        loc = r.headers.get("location", "")
        assert "/live" in loc
        assert "upstox=error" in loc
        assert "missing_code" in loc


class TestUpstoxDisconnect:
    def test_disconnect_idempotent(self, session):
        r1 = session.post(f"{API}/upstox/disconnect", timeout=30)
        assert r1.status_code == 200
        assert r1.json().get("ok") is True
        # call again
        r2 = session.post(f"{API}/upstox/disconnect", timeout=30)
        assert r2.status_code == 200
        assert r2.json().get("ok") is True
