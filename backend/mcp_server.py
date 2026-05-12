"""MCP server exposing SignalForge trading tools to Claude."""
from __future__ import annotations

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("SignalForge")


# ------------ RAG: market history ------------

@mcp.tool()
def query_market_history(question: str, symbol: str = None) -> str:
    """
    Search 5 years of historical market data using natural language.
    Examples: 'when did RELIANCE crash in 2022?', 'best months for TCS'
    symbol: optional filter, e.g. 'RELIANCE' or 'TCS'
    """
    from rag_store import query
    results = query(question, symbol=symbol, top_k=6)
    if not results:
        return "No relevant data found in the historical store."
    lines = [f"[{r['date']} | {r['symbol']} | {r['type']}] {r['text']}" for r in results]
    return "\n\n".join(lines)


@mcp.tool()
def ingest_stock(symbol: str) -> str:
    """
    Fetch and store 5 years of daily history for a stock into the RAG store.
    symbol: NSE symbol like RELIANCE or TCS
    """
    from rag_store import ingest
    from nifty50 import yf_ticker
    ticker_ns = yf_ticker(symbol) if not symbol.upper().endswith(".NS") else symbol.upper()
    count = ingest(symbol.upper(), ticker_ns)
    return f"Ingested {count} chunks for {symbol.upper()} into RAG store."


# ------------ Simulator ------------

@mcp.tool()
def run_backtest(
    strategy: str,
    universe: str = "nifty50",
    weeks: int = 12,
    capital: float = 100000,
) -> str:
    """
    Run a backtest simulation and return key metrics.
    strategy: peak_dip | daily_drop | weekly_drop | consecutive_down
    universe: nifty50 | nifty500 | custom
    weeks: number of weeks to simulate
    capital: starting capital in INR
    """
    from simulator import run_simulation
    result = run_simulation(strategy_type=strategy, universe=universe, weeks=weeks, capital=capital)
    if "error" in result:
        return f"Simulation error: {result['error']}"
    k = result.get("kpis", {})
    return (
        f"Backtest: {strategy} | {universe} | {weeks}w | ₹{capital:,.0f}\n"
        f"Total Return : {k.get('total_return_pct', 0):.2f}%\n"
        f"Final Value  : ₹{k.get('final_portfolio', capital):,.0f}\n"
        f"Win Rate     : {k.get('win_rate', 0):.1f}%\n"
        f"Total Trades : {k.get('total_trades', 0)}\n"
        f"Max Drawdown : {k.get('max_drawdown_pct', 0):.1f}%\n"
        f"Avg Holding  : {k.get('avg_holding_days', 0):.1f} days"
    )


# ------------ Live price ------------

@mcp.tool()
def get_price(symbol: str) -> str:
    """
    Get the latest closing price for an NSE stock.
    symbol: NSE symbol like RELIANCE or TCS
    """
    from datetime import datetime, timezone, timedelta
    from curl_cffi import requests as cffi_requests
    from nifty50 import yf_ticker

    ticker_ns = yf_ticker(symbol) if not symbol.upper().endswith(".NS") else symbol.upper()
    session = cffi_requests.Session(impersonate="chrome")
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=7)
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{ticker_ns}"
        f"?interval=1d&period1={int(start.timestamp())}&period2={int(end.timestamp())}"
    )
    try:
        r = session.get(url, timeout=10)
        result = r.json()["chart"]["result"][0]
        closes = [c for c in result["indicators"]["quote"][0]["close"] if c]
        dates = result["timestamp"]
        latest_close = closes[-1]
        prev_close = closes[-2] if len(closes) > 1 else closes[-1]
        chg = (latest_close - prev_close) / prev_close * 100
        direction = "▲" if chg >= 0 else "▼"
        return f"{symbol.upper()}: ₹{latest_close:.2f}  {direction}{abs(chg):.2f}%"
    except Exception as e:
        return f"Could not fetch price for {symbol}: {e}"


# ------------ Dip scanner ------------

@mcp.tool()
def scan_dips(universe: str = "nifty50") -> str:
    """
    Scan universe for stocks showing dip signals right now.
    universe: nifty50 | nifty500
    """
    from strategy_live import scan_daily_dips
    from universe import get_universe
    stocks = get_universe(universe)
    picks = scan_daily_dips(stocks)
    if not picks:
        return f"No dip signals found in {universe} right now."
    lines = [f"{p['symbol']} ({p['name']}): {p.get('reason', '')}" for p in picks[:10]]
    return f"Dip signals in {universe}:\n" + "\n".join(lines)


if __name__ == "__main__":
    mcp.run()
