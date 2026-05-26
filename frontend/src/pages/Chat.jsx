import { useState, useRef, useEffect } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import {
  ChartLineUp,
  PaperPlaneTilt,
  Robot,
  User,
  Spinner,
  Database,
  CaretDown,
  CaretRight,
} from "@phosphor-icons/react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const SUGGESTIONS = [
  "When was the last time RELIANCE fell 5% in a week and recovered?",
  "What were TCS's best and worst months in 2022?",
  "Did RELIANCE hit any 52-week highs recently?",
  "Compare RELIANCE and TCS performance in 2023",
  "When did TCS drop more than 8% in a month?",
];

const KNOWN_STOCKS = ["RELIANCE", "TCS"];

function SourceChip({ source }) {
  const [open, setOpen] = useState(false);
  const typeColor =
    source.type === "daily"
      ? "text-blue-400"
      : source.type === "weekly"
      ? "text-purple-400"
      : "text-amber-400";
  return (
    <div className="border border-white/10 rounded-lg overflow-hidden text-xs">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-white/5 transition-colors text-left"
      >
        {open ? (
          <CaretDown size={12} className="text-neutral-500 shrink-0" />
        ) : (
          <CaretRight size={12} className="text-neutral-500 shrink-0" />
        )}
        <span className="font-mono text-neutral-400">{source.date}</span>
        <span className="font-semibold text-white">{source.symbol}</span>
        <span className={`uppercase tracking-wider ${typeColor}`}>{source.type}</span>
        <span className="ml-auto text-neutral-600">score {source.score}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-1 text-neutral-400 leading-relaxed border-t border-white/5">
          {source.text}
        </div>
      )}
    </div>
  );
}

function Message({ msg }) {
  const [showSources, setShowSources] = useState(false);
  const isUser = msg.role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[75%] bg-[#00C896] text-black rounded-2xl rounded-tr-sm px-4 py-3 text-sm font-medium">
          {msg.content}
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-3 items-start">
      <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0 mt-0.5">
        <Robot size={16} className="text-[#00C896]" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="bg-white/5 border border-white/8 rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-neutral-200 leading-relaxed whitespace-pre-wrap">
          {msg.content}
        </div>
        {msg.sources?.length > 0 && (
          <div className="mt-2">
            <button
              onClick={() => setShowSources((s) => !s)}
              className="flex items-center gap-1.5 text-xs text-neutral-500 hover:text-neutral-300 transition-colors"
            >
              <Database size={12} />
              {showSources ? "Hide" : "Show"} {msg.sources.length} sources
            </button>
            {showSources && (
              <div className="mt-2 space-y-1.5">
                {msg.sources.map((s, i) => (
                  <SourceChip key={i} source={s} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex gap-3 items-start">
      <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center shrink-0">
        <Robot size={16} className="text-[#00C896]" />
      </div>
      <div className="bg-white/5 border border-white/8 rounded-2xl rounded-tl-sm px-4 py-3">
        <div className="flex gap-1 items-center h-4">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full bg-neutral-500 animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Chat() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hi! I have 5 years of historical data for RELIANCE and TCS. Ask me anything — price patterns, weekly drops, recoveries, best/worst periods, and more.",
      sources: [],
    },
  ]);
  const [input, setInput] = useState("");
  const [symbol, setSymbol] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async (question) => {
    const q = (question || input).trim();
    if (!q || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: q }]);
    setLoading(true);
    try {
      const res = await axios.post(`${API}/chat`, {
        question: q,
        symbol: symbol || null,
      });
      setMessages((m) => [
        ...m,
        { role: "assistant", content: res.data.answer, sources: res.data.sources },
      ]);
    } catch (e) {
      const detail = e?.response?.data?.detail || e.message || "Something went wrong";
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Error: ${detail}`, sources: [] },
      ]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="min-h-screen bg-[#111111] text-white bg-grid bg-noise flex flex-col">
      {/* Header */}
      <header className="border-b border-white/5 sticky top-0 z-30 backdrop-blur-md bg-[#111111]/80">
        <div className="max-w-[900px] mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-[#00C896] flex items-center justify-center text-black">
              <Robot size={18} weight="bold" />
            </div>
            <div>
              <h1 className="font-display text-lg font-bold tracking-tight leading-none">
                SIGNAL<span className="text-[#00C896]">FORGE</span> AI
              </h1>
              <p className="text-[10px] text-neutral-500 uppercase tracking-[0.2em] mt-0.5">
                5-Year Market Research
              </p>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            <Link
              to="/"
              className="text-xs text-neutral-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              Simulator
            </Link>
            <Link
              to="/live"
              className="text-xs text-neutral-400 hover:text-white px-3 py-1.5 rounded-lg hover:bg-white/5 transition-colors"
            >
              Live
            </Link>
          </nav>
        </div>
      </header>

      {/* Symbol filter */}
      <div className="max-w-[900px] mx-auto px-6 pt-4 w-full">
        <div className="flex items-center gap-2">
          <span className="text-xs text-neutral-500">Filter by stock:</span>
          {["", ...KNOWN_STOCKS].map((s) => (
            <button
              key={s}
              onClick={() => setSymbol(s)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                symbol === s
                  ? "bg-[#00C896] text-black border-[#00C896] font-semibold"
                  : "border-white/10 text-neutral-400 hover:border-white/30 hover:text-white"
              }`}
            >
              {s || "All"}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 max-w-[900px] mx-auto w-full px-6 py-6 space-y-5">
        {messages.map((m, i) => (
          <Message key={i} msg={m} />
        ))}
        {loading && <TypingDots />}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions */}
      {messages.length <= 1 && !loading && (
        <div className="max-w-[900px] mx-auto w-full px-6 pb-4">
          <p className="text-xs text-neutral-600 mb-2 uppercase tracking-widest">Try asking</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => send(s)}
                className="text-xs border border-white/10 rounded-full px-3 py-1.5 text-neutral-400 hover:border-white/30 hover:text-white transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="sticky bottom-0 bg-[#111111]/90 backdrop-blur-md border-t border-white/5">
        <div className="max-w-[900px] mx-auto px-6 py-4">
          <div className="flex gap-3 items-end">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKey}
              placeholder="Ask about price history, dips, recoveries, patterns…"
              rows={1}
              className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-neutral-600 resize-none focus:outline-none focus:border-white/25 transition-colors"
              style={{ minHeight: 48, maxHeight: 120 }}
            />
            <button
              onClick={() => send()}
              disabled={!input.trim() || loading}
              className="h-12 w-12 rounded-xl bg-[#00C896] text-black flex items-center justify-center disabled:opacity-30 hover:bg-[#00A882] transition-colors shrink-0"
            >
              {loading ? (
                <Spinner size={18} className="animate-spin" />
              ) : (
                <PaperPlaneTilt size={18} weight="bold" />
              )}
            </button>
          </div>
          <p className="text-[10px] text-neutral-700 mt-2 text-center">
            Powered by Claude · 5yr NSE data · RELIANCE &amp; TCS available
          </p>
        </div>
      </div>
    </div>
  );
}
