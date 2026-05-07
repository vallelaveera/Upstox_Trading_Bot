"""Backend API tests for NSE Swing Trading Simulator v2 features.
Covers: universes endpoint, daily_drop/weekly_drop/consecutive_down strategies, compare endpoint.
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --- Universes endpoint ---
class TestUniverses:
    def test_list_universes(self, session):
        r = session.get(f"{API}/universes", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert "universes" in d
        assert "sectors" in d
        assert isinstance(d["sectors"], list) and len(d["sectors"]) > 5
        keys = {u["key"]: u["size"] for u in d["universes"]}
        assert keys.get("nifty50") == 50
        assert keys.get("nifty100") == 100
        assert keys.get("nifty200") == 216
        # labels present
        for u in d["universes"]:
            assert "label" in u and u["label"]

    def test_universe_nifty200(self, session):
        r = session.get(f"{API}/universe/nifty200", timeout=30)
        assert r.status_code == 200
        d = r.json()
        assert d["key"] == "nifty200"
        assert d["count"] == 216
        assert len(d["stocks"]) == 216
        assert isinstance(d["sectors"], list) and len(d["sectors"]) > 5
        # stocks shape
        s0 = d["stocks"][0]
        assert {"symbol", "name", "sector"} <= set(s0.keys())

    def test_universe_nifty100(self, session):
        r = session.get(f"{API}/universe/nifty100", timeout=30)
        assert r.status_code == 200
        assert r.json()["count"] == 100

    def test_universe_invalid(self, session):
        r = session.get(f"{API}/universe/invalid", timeout=30)
        assert r.status_code == 404

    def test_nifty50_backward_compat(self, session):
        r = session.get(f"{API}/nifty50", timeout=30)
        assert r.status_code == 200
        assert r.json()["count"] == 50


# --- Simulate v2 strategies ---
class TestSimulateV2:
    def test_daily_drop_default_payload(self, session):
        payload = {
            "capital": 500000,
            "weeks": 4,
            "universe": "nifty200",
            "strategy_type": "daily_drop",
            "daily_drop_min": 2,
            "daily_drop_max": 4,
            "recovery_target": 3.5,
            "stop_loss": 7,
            "max_holding_days": 4,
            "max_positions": 20,
        }
        t0 = time.time()
        r = session.post(f"{API}/simulate", json=payload, timeout=180)
        elapsed = time.time() - t0
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        assert elapsed < 120, f"took {elapsed:.1f}s"
        d = r.json()
        # new kpi fields
        kpis = d["kpis"]
        for k in ("avg_holding_days", "max_drawdown_pct", "exits_target", "exits_stoploss", "exits_time"):
            assert k in kpis, f"missing kpi {k}: {list(kpis.keys())}"
        # core kpis still there
        for k in ("starting_capital", "final_portfolio", "net_pnl", "return_pct", "total_trades", "win_rate"):
            assert k in kpis
        assert kpis["starting_capital"] == 500000.0
        assert d["params"]["strategy_type"] == "daily_drop"
        assert d["params"]["universe"] == "nifty200"
        assert "_id" not in d
        assert "'_id':" not in str(d)

    def test_peak_dip_legacy(self, session):
        payload = {
            "capital": 500000,
            "weeks": 2,
            "strategy_type": "peak_dip",
            "dip_min": 5,
            "dip_max": 15,
            "recovery_target": 8,
            "stop_loss": 7,
        }
        r = session.post(f"{API}/simulate", json=payload, timeout=180)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["params"]["strategy_type"] == "peak_dip"

    def test_weekly_drop(self, session):
        payload = {
            "capital": 500000,
            "weeks": 4,
            "universe": "nifty100",
            "strategy_type": "weekly_drop",
            "weekly_drop_min": 5,
            "weekly_drop_max": 12,
            "recovery_target": 5,
            "stop_loss": 7,
        }
        r = session.post(f"{API}/simulate", json=payload, timeout=180)
        assert r.status_code == 200, r.text[:300]
        d = r.json()
        assert d["params"]["strategy_type"] == "weekly_drop"

    def test_consecutive_down(self, session):
        payload = {
            "capital": 500000,
            "weeks": 4,
            "universe": "nifty100",
            "strategy_type": "consecutive_down",
            "consecutive_down_min": 3,
            "recovery_target": 5,
            "stop_loss": 7,
        }
        r = session.post(f"{API}/simulate", json=payload, timeout=180)
        assert r.status_code == 200, r.text[:300]
        assert r.json()["params"]["strategy_type"] == "consecutive_down"

    def test_invalid_strategy_type(self, session):
        r = session.post(f"{API}/simulate", json={"strategy_type": "bogus"}, timeout=30)
        assert r.status_code == 400

    def test_invalid_universe(self, session):
        r = session.post(f"{API}/simulate", json={"universe": "bogus"}, timeout=30)
        assert r.status_code == 400

    def test_daily_drop_min_ge_max(self, session):
        r = session.post(
            f"{API}/simulate",
            json={"strategy_type": "daily_drop", "daily_drop_min": 5, "daily_drop_max": 3},
            timeout=30,
        )
        assert r.status_code == 400
        assert "daily_drop" in r.text.lower()

    def test_sectors_filter_nifty200(self, session):
        payload = {
            "capital": 300000,
            "weeks": 2,
            "universe": "nifty200",
            "strategy_type": "daily_drop",
            "sectors": ["IT"],
        }
        r = session.post(f"{API}/simulate", json=payload, timeout=180)
        assert r.status_code == 200
        d = r.json()
        # IT sector in nifty200 ~ 8-15 stocks
        assert d["params"]["universe_size"] <= 20
        assert d["params"]["sectors"] == ["IT"]


# --- Compare endpoint ---
class TestCompare:
    def test_compare_three_strategies(self, session):
        payload = {
            "capital": 500000,
            "weeks": 3,
            "universe": "nifty100",
            "strategies": [
                {"label": "Daily 2-4%", "strategy_type": "daily_drop",
                 "daily_drop_min": 2, "daily_drop_max": 4,
                 "recovery_target": 3.5, "stop_loss": 7, "max_holding_days": 4},
                {"label": "Peak Dip 5-15", "strategy_type": "peak_dip",
                 "dip_min": 5, "dip_max": 15,
                 "recovery_target": 8, "stop_loss": 7},
                {"label": "Weekly 5-12", "strategy_type": "weekly_drop",
                 "weekly_drop_min": 5, "weekly_drop_max": 12,
                 "recovery_target": 5, "stop_loss": 7},
            ],
        }
        t0 = time.time()
        r = session.post(f"{API}/compare", json=payload, timeout=240)
        elapsed = time.time() - t0
        assert r.status_code == 200, r.text[:400]
        assert elapsed < 180
        d = r.json()
        assert "results" in d and len(d["results"]) == 3
        # shared sim window
        assert "sim_start" in d and "sim_end" in d
        for res in d["results"]:
            assert "label" in res
            assert "kpis" in res
            assert "equity_curve" in res
            assert isinstance(res["equity_curve"], list)
            for k in ("total_trades", "return_pct", "win_rate"):
                assert k in res["kpis"]

    def test_compare_five_strategies(self, session):
        strats = []
        for i in range(5):
            strats.append({
                "label": f"S{i}",
                "strategy_type": "daily_drop",
                "daily_drop_min": 2,
                "daily_drop_max": 3 + (i * 0.5),
                "recovery_target": 3 + i,
                "stop_loss": 7,
                "max_holding_days": 4,
            })
        payload = {"capital": 500000, "weeks": 2, "universe": "nifty100", "strategies": strats}
        r = session.post(f"{API}/compare", json=payload, timeout=240)
        assert r.status_code == 200, r.text[:400]
        assert len(r.json()["results"]) == 5

    def test_compare_six_strategies_rejected(self, session):
        strats = [{"label": f"S{i}", "strategy_type": "daily_drop"} for i in range(6)]
        r = session.post(
            f"{API}/compare",
            json={"capital": 500000, "weeks": 2, "universe": "nifty50", "strategies": strats},
            timeout=30,
        )
        assert r.status_code == 422

    def test_compare_empty_rejected(self, session):
        r = session.post(
            f"{API}/compare",
            json={"capital": 500000, "weeks": 2, "universe": "nifty50", "strategies": []},
            timeout=30,
        )
        assert r.status_code == 422
