import { useEffect, useState, useRef } from "react";
import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const FALLBACK = [
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

export default function TickerTape() {
  const [tickers, setTickers] = useState(FALLBACK);
  const scrollRef = useRef(null);

  useEffect(() => {
    axios.get(`${API}/ticker`).then((r) => {
      if (r.data.tickers?.length > 0) setTickers(r.data.tickers);
    }).catch(() => {});
  }, []);

  const items = [...tickers, ...tickers];

  return (
    <div className="border-b border-white/5 bg-black/40 overflow-hidden relative">
      <div className="absolute left-0 top-0 bottom-0 w-12 z-10 bg-gradient-to-r from-black/80 to-transparent pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-12 z-10 bg-gradient-to-l from-black/80 to-transparent pointer-events-none" />
      <div ref={scrollRef} className="flex gap-0 ticker-scroll">
        {items.map((t, i) => (
          <div key={i} className="flex items-center gap-2 px-5 py-2 border-r border-white/5 shrink-0">
            <span className="text-[11px] font-mono font-bold text-white tracking-wider">{t.symbol}</span>
            <span className="text-[11px] font-mono text-neutral-300">₹{t.price.toLocaleString("en-IN")}</span>
            <span className={`text-[10px] font-mono font-bold ${t.change_pct >= 0 ? "text-[#FBBF24]" : "text-red-400"}`}>
              {t.change_pct >= 0 ? "▲" : "▼"} {Math.abs(t.change_pct).toFixed(2)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
