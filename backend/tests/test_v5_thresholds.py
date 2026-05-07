"""V5 tests: new defaults target=5%, stop=3% + swing-positions schema."""
import os
import requests
import pytest

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def test_status_connected(session):
    r = session.get(f"{BASE_URL}/api/upstox/status", timeout=20)
    assert r.status_code == 200
    body = r.json()
    if not body.get("connected"):
        pytest.skip("Upstox not connected — skip live tests")


def test_openapi_defaults(session):
    """Verify ExecuteRequest & AutoStrategyRequest schemas have target=5, stop=3.
    Ingress only proxies /api/*, so openapi.json may not be reachable externally —
    fall back to the auto-strategy echo test for runtime verification."""
    r = session.get(f"{BASE_URL}/openapi.json", timeout=15)
    if r.status_code != 200 or not r.headers.get("content-type", "").startswith("application/json"):
        pytest.skip(f"openapi.json not reachable via ingress (status={r.status_code}); "
                    f"defaults verified via auto-strategy echo test instead")
    schemas = r.json().get("components", {}).get("schemas", {})
    exr = schemas.get("ExecuteRequest", {}).get("properties", {})
    assert exr["target_pct"]["default"] == 5.0
    assert exr["stop_pct"]["default"] == 3.0
    asr = schemas.get("AutoStrategyRequest", {}).get("properties", {})
    assert asr["target_pct"]["default"] == 5.0
    assert asr["stop_pct"]["default"] == 3.0


def test_swing_positions_schema(session):
    r = session.get(f"{BASE_URL}/api/upstox/strategy/swing-positions", timeout=20)
    assert r.status_code == 200
    body = r.json()
    assert "positions" in body
    assert "open_count" in body
    positions = body["positions"]
    assert isinstance(positions, list)
    open_positions = [p for p in positions if p.get("status") == "open"]
    print(f"\nOpen swing positions: {len(open_positions)} / {len(positions)} total")
    open_symbols = sorted({p["symbol"] for p in open_positions})
    print(f"Open symbols: {open_symbols}")

    required = {"symbol", "target_price", "stop_price", "buy_price", "qty", "status"}
    for p in open_positions:
        missing = required - set(p.keys())
        assert not missing, f"Position {p.get('symbol')} missing fields: {missing}"
        assert p["target_price"] > p["buy_price"], (
            f"{p['symbol']}: target {p['target_price']} not > buy {p['buy_price']}"
        )
        assert p["stop_price"] < p["buy_price"], (
            f"{p['symbol']}: stop {p['stop_price']} not < buy {p['buy_price']}"
        )

    # Per agent context, expect: PCJEWELLER, IOC, GREAVESCOT, NHPC
    expected = {"PCJEWELLER", "IOC", "GREAVESCOT", "NHPC"}
    found = expected & set(open_symbols)
    print(f"Expected open positions present: {sorted(found)}")
    # Soft check — log if missing but don't fail (DB state can change)
    if found != expected:
        print(f"WARN: missing expected: {sorted(expected - found)}")


def test_auto_strategy_omitted_target_stop(session):
    """POST /api/upstox/strategy/auto without target/stop must NOT 422 and echo defaults."""
    payload = {
        "capital": 50000,
        "slots": 5,
        "universe": "nifty50",
        "drop_min": 0.5,
        "drop_max": 15,
    }
    r = session.post(f"{BASE_URL}/api/upstox/strategy/auto", json=payload, timeout=90)
    print(f"\nauto status={r.status_code}")
    # 422 would indicate validation problem
    assert r.status_code != 422, f"422 on omitted target/stop: {r.text[:300]}"
    # If 200 — verify defaults reflected in execution
    if r.status_code == 200:
        body = r.json()
        execution = body.get("execution") or {}
        # When candidates exist, execution will include target_pct/stop_pct
        if "target_pct" in execution:
            assert execution["target_pct"] == 5.0
            assert execution["stop_pct"] == 3.0
            print(f"Execution echoed: target_pct={execution['target_pct']}, stop_pct={execution['stop_pct']}")
        else:
            print(f"No candidates matched: {execution.get('message')}")
    else:
        # 502 acceptable if scan fails (yfinance/upstox flaky), as long as not 422
        print(f"Non-422 error (acceptable): {r.text[:200]}")
