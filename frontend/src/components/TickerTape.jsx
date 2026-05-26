import { useEffect, useState } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const REFRESH_INTERVAL = 60 * 1000;

const FALLBACK_INDICES = [
  { symbol: "NIFTY 50", price: 22450.0, change_pct: 0.31 },
  { symbol: "SENSEX", price: 73850.0, change_pct: 0.28 },
  { symbol: "BANK NIFTY", price: 48200.0, change_pct: 0.54 },
  { symbol: "NIFTY IT", price: 33100.0, change_pct: -0.42 },
  { symbol: "NIFTY MID", price: 10850.0, change_pct: 0.67 },
  { symbol: "NIFTY AUTO", price: 21300.0, change_pct: 1.02 },
];

const FALLBACK_STOCKS = [
  { symbol: "RELIANCE", price: 2850.4, change_pct: 0.42 },
  { symbol: "TCS", price: 3920.1, change_pct: -0.31 },
  { symbol: "INFY", price: 1580.7, change_pct: 1.12 },
  { symbol: "HDFCBANK", price: 1720.5, change_pct: -0.18 },
  { symbol: "ICICIBANK", price: 1240.3, change_pct: 0.87 },
  { symbol: "BAJFINANCE", price: 7120.8, change_pct: 1.54 },
  { symbol: "SBIN", price: 820.6, change_pct: -0.62 },
  { symbol: "WIPRO", price: 480.2, change_pct: 0.23 },
  { symbol: "LT", price: 3540.9, change_pct: 0.95 },
  { symbol: "AXISBANK", price: 1180.4, change_pct: -0.44 },
  { symbol: "MARUTI", price: 12400.0, change_pct: 0.71 },
  { symbol: "TITAN", price: 3620.5, change_pct: 1.23 },
];

function Band({ items, speed = "40s", label, live, lastUpdated }) {
  const doubled = [...items, ...items];
  const timeStr = lastUpdated
    ? lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  return (
    <div className="overflow-hidden relative flex items-center">
      {/* Label */}
      <div className="absolute left-0 top-0 bottom-0 z-20 flex items-center">
        <div className="bg-[#FBBF24] text-black text-[9px] font-black uppercase tracking-widest px-2 py-0.5 h-full flex items-center">
          {label}
        </div>
      </div>

      {/* Fade edges */}
      <div className="absolute left-16 top-0 bottom-0 w-8 z-10 bg-gradient-to-r from-black to-transparent pointer-events-none" />
      <div className="absolute right-24 top-0 bottom-0 w-8 z-10 bg-gradient-to-l from-black to-transparent pointer-events-none" />

      {/* Scrolling items */}
      <div className="pl-16 flex gap-0 ticker-scroll" style={{ animationDuration: speed }}>
        {doubled.map((t, i) => (
          <div key={i} className="flex items-center gap-2 px-4 py-1.5 border-r border-white/5 shrink-0">
            <span className="text-[11px] font-mono font-bold text-white tracking-wider">{t.symbol}</span>
            <span className="text-[11px] font-mono text-neutral-400">
              {t.price >= 10000
                ? t.price.toLocaleString("en-IN", { maximumFractionDigits: 0 })
                : t.price.toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
            </span>
            <span className={`text-[10px] font-mono font-bold ${t.change_pct >= 0 ? "text-[#FBBF24]" : "text-red-400"}`}>
              {t.change_pct >= 0 ? "▲" : "▼"} {Math.abs(t.change_pct).toFixed(2)}%
            </span>
          </div>
        ))}
      </div>

      {/* Timestamp */}
      <div className="absolute right-0 top-0 bottom-0 z-20 flex items-center pr-2">
        <div className="flex items-center gap-1 bg-black/80 border border-white/10 rounded px-2 py-0.5">
          <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${live ? "bg-[#FBBF24] pulse-dot" : "bg-neutral-600"}`} />
          <span className="text-[9px] font-mono text-neutral-500">
            {live && timeStr ? timeStr : "Delayed"}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function TickerTape() {
  const [indices, setIndices] = useState(FALLBACK_INDICES);
  const [stocks, setStocks] = useState(FALLBACK_STOCKS);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [live, setLive] = useState(false);

  const fetchTickers = () => {
    axios.get(`${API}/ticker`).then((r) => {
      if (r.data.indices?.length > 0) setIndices(r.data.indices);
      if (r.data.stocks?.length > 0) setStocks(r.data.stocks);
      setLastUpdated(new Date());
      setLive(true);
    }).catch(() => setLive(false));
  };

  useEffect(() => {
    fetchTickers();
    const interval = setInterval(fetchTickers, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="border-b border-white/5 bg-black/60 divide-y divide-white/5">
      <Band items={indices} speed="35s" label="INDEX" live={live} lastUpdated={lastUpdated} />
      <Band items={stocks} speed="50s" label="NSE" live={live} lastUpdated={lastUpdated} />
    </div>
  );
}
