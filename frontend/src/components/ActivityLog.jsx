import { useEffect, useRef, useState } from "react";
import { Terminal } from "@phosphor-icons/react";

const IDLE_MESSAGES = [
  { type: "info", text: "System ready. Configure filters and run simulation." },
  { type: "system", text: "Connected to Yahoo Finance data feed." },
  { type: "system", text: "RAG store initialised — RELIANCE, TCS loaded." },
  { type: "info", text: "Claude AI model standing by for candidate analysis." },
];

const RUN_SEQUENCE = [
  { type: "system", text: "Initialising backtest engine..." },
  { type: "info", text: "Fetching historical data from Yahoo Finance..." },
  { type: "info", text: "Loading Nifty 50 universe — 50 instruments." },
  { type: "info", text: "Building OHLCV series map..." },
  { type: "signal", text: "Scanning for dip signals across universe..." },
  { type: "signal", text: "Signal detected → RELIANCE · Entry ₹2,840" },
  { type: "signal", text: "Signal detected → TCS · Entry ₹3,910" },
  { type: "signal", text: "Signal detected → INFY · Entry ₹1,572" },
  { type: "info", text: "Rotating capital — 3 positions filled." },
  { type: "signal", text: "Exit triggered → RELIANCE · Target hit +3.5%" },
  { type: "signal", text: "Exit triggered → TCS · Stop-loss −2%" },
  { type: "info", text: "Redeploying freed capital..." },
  { type: "signal", text: "Signal detected → HDFCBANK · Entry ₹1,715" },
  { type: "info", text: "Computing risk metrics — Sharpe, Sortino, Calmar..." },
  { type: "info", text: "Fetching Nifty 50 benchmark curve..." },
  { type: "success", text: "Backtest complete. Results ready." },
];

const TYPE_STYLES = {
  system: "text-neutral-500",
  info: "text-neutral-300",
  signal: "text-[#FBBF24]",
  success: "text-green-400",
  error: "text-red-400",
};

export default function ActivityLog({ running, result }) {
  const [logs, setLogs] = useState(IDLE_MESSAGES);
  const [idx, setIdx] = useState(0);
  const bottomRef = useRef(null);
  const prevRunning = useRef(false);

  useEffect(() => {
    if (running && !prevRunning.current) {
      setLogs([]);
      setIdx(0);
    }
    if (!running && prevRunning.current && result) {
      // flush remaining messages instantly
      setLogs(RUN_SEQUENCE);
    }
    prevRunning.current = running;
  }, [running, result]);

  useEffect(() => {
    if (!running) return;
    if (idx >= RUN_SEQUENCE.length) return;
    const timer = setTimeout(() => {
      setLogs((prev) => [...prev, RUN_SEQUENCE[idx]]);
      setIdx((i) => i + 1);
    }, 400 + Math.random() * 600);
    return () => clearTimeout(timer);
  }, [running, idx]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="bg-[#0c0c0c] border border-white/10 rounded-xl p-5 flex flex-col h-full min-h-[280px]">
      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-white/5">
        <Terminal size={15} weight="duotone" className="text-[#FBBF24]" />
        <h3 className="font-display font-bold text-sm uppercase tracking-widest text-white">Activity Log</h3>
        {running && (
          <span className="ml-auto flex items-center gap-1.5 text-[10px] font-mono text-[#FBBF24]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#FBBF24] pulse-dot" />
            RUNNING
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto space-y-1.5 font-mono text-[11px] leading-relaxed">
        {logs.map((log, i) => (
          <div key={i} className={`flex gap-2 ${TYPE_STYLES[log.type] || "text-neutral-400"}`}>
            <span className="text-neutral-700 shrink-0 select-none">›</span>
            <span>{log.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
