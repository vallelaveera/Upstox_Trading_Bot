"""Backend API tests for NSE Swing Trading Simulator."""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://dip-recovery-lab.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- Health ---
class TestHealth:
    def test_root(self, session):
        r = session.get(f"{API}/", timeout=30)
        assert r.status_code == 200
        data = r.json()
        assert data.get("status") == "ok"
        assert "service" in data


# --- Nifty 50 list ---
class TestNifty50:
    def test_list_nifty50(self, session):
        r = session.get(f"{API}/nifty50", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d.get("count") == 50
        assert isinstance(d["stocks"], list) and len(d["stocks"]) == 50
        assert isinstance(d["sectors"], list) and len(d["sectors"]) > 0
        # validate shape
        s0 = d["stocks"][0]
        for k in ("symbol", "name", "sector"):
            assert k in s0


# --- Simulate endpoint ---
class TestSimulate:
    @pytest.fixture(scope="class")
    def default_result(self, session):
        payload = {
            "capital": 500000,
            "weeks": 4,
            "dip_min": 5,
            "dip_max": 15,
            "recovery_target": 8,
            "stop_loss": 7,
            "lookback_days": 20,
            "max_positions": 20,
        }
        t0 = time.time()
        r = session.post(f"{API}/simulate", json=payload, timeout=120)
        elapsed = time.time() - t0
        assert r.status_code == 200, f"{r.status_code} {r.text}"
        assert elapsed < 90, f"Simulation took {elapsed:.1f}s (>90s limit)"
        return r.json(), elapsed

    def test_default_simulate_shape(self, default_result):
        data, _ = default_result
        for k in (
            "kpis", "equity_curve", "trades", "open_positions",
            "params", "sim_start", "sim_end", "run_id",
        ):
            assert k in data, f"missing key {k}"

        kpis = data["kpis"]
        for k in (
            "starting_capital", "final_portfolio", "net_pnl", "return_pct",
            "total_trades", "closed_trades", "open_positions", "win_rate",
        ):
            assert k in kpis, f"missing kpi {k}"
        assert kpis["starting_capital"] == 500000.0

        # equity curve shape
        assert isinstance(data["equity_curve"], list)
        if data["equity_curve"]:
            row = data["equity_curve"][0]
            for k in ("date", "equity", "cash", "invested"):
                assert k in row

        # trades shape
        if data["trades"]:
            t = data["trades"][0]
            for k in ("symbol", "buy_price", "buy_date", "qty", "pnl", "pnl_pct", "status"):
                assert k in t

        # No mongo _id leak anywhere
        assert "'_id':" not in str(data)
        assert "_id" not in data

    def test_run_id_is_uuid(self, default_result):
        data, _ = default_result
        assert isinstance(data["run_id"], str) and len(data["run_id"]) >= 32

    def test_custom_params(self, session):
        payload = {
            "capital": 300000,
            "weeks": 2,
            "dip_min": 4,
            "dip_max": 12,
            "recovery_target": 5,
            "stop_loss": 10,
            "lookback_days": 15,
            "max_positions": 10,
        }
        r = session.post(f"{API}/simulate", json=payload, timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["kpis"]["starting_capital"] == 300000.0
        assert d["params"]["weeks"] == 2
        assert d["params"]["recovery_target"] == 5
        assert d["params"]["stop_loss"] == 10

    def test_sectors_filter(self, session):
        payload = {
            "capital": 500000,
            "weeks": 2,
            "sectors": ["IT", "Financial"],
        }
        r = session.post(f"{API}/simulate", json=payload, timeout=120)
        assert r.status_code == 200, r.text
        d = r.json()
        # universe size should be limited (IT + Financial in nifty50 ~ 11-12)
        assert d["params"]["universe_size"] <= 15
        assert d["params"]["sectors"] == ["IT", "Financial"]

    def test_dip_validation(self, session):
        # dip_min >= dip_max should return 400
        payload = {"dip_min": 15, "dip_max": 10}
        r = session.post(f"{API}/simulate", json=payload, timeout=30)
        assert r.status_code == 400
        assert "dip_min" in r.text.lower() or "dip" in r.text.lower()

    def test_capital_below_min(self, session):
        # capital < 10000 should fail pydantic validation -> 422
        payload = {"capital": 5000}
        r = session.post(f"{API}/simulate", json=payload, timeout=30)
        assert r.status_code == 422


# --- Simulations history ---
class TestSimulationsList:
    def test_list_simulations(self, session):
        r = session.get(f"{API}/simulations", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "simulations" in d
        assert isinstance(d["simulations"], list)
        # must not leak mongo _id
        assert "'_id':" not in str(d)
        if d["simulations"]:
            row = d["simulations"][0]
            assert "id" in row
            assert "created_at" in row
            assert "params" in row
            assert "kpis" in row
