const STACK = [
  { name: "Python", desc: "Core engine", color: "#3B82F6" },
  { name: "FastAPI", desc: "REST API", color: "#10B981" },
  { name: "Claude AI", desc: "LLM + RAG", color: "#FBBF24" },
  { name: "Yahoo Finance", desc: "Market data", color: "#A78BFA" },
  { name: "Pandas", desc: "Data processing", color: "#F472B6" },
  { name: "AWS Lambda", desc: "Serverless", color: "#FB923C" },
  { name: "MongoDB", desc: "Storage", color: "#4ADE80" },
  { name: "Upstox API", desc: "Live trading", color: "#38BDF8" },
];

export default function TechStackPanel() {
  return (
    <div className="bg-[#0c0c0c] border border-white/10 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-white/5">
        <span className="h-1.5 w-1.5 rounded-full bg-[#FBBF24] pulse-dot" />
        <h3 className="font-display font-bold text-sm uppercase tracking-widest text-white">
          Powered By
        </h3>
      </div>
      <div className="space-y-2">
        {STACK.map((s) => (
          <div key={s.name} className="flex items-center justify-between gap-2 group">
            <div className="flex items-center gap-2">
              <span
                className="h-1.5 w-1.5 rounded-full shrink-0"
                style={{ backgroundColor: s.color }}
              />
              <span className="text-xs font-mono font-semibold text-white">{s.name}</span>
            </div>
            <span className="text-[10px] text-neutral-600 font-mono">{s.desc}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-white/5">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-[#4ADE80] pulse-dot" />
          <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">All systems live</span>
        </div>
      </div>
    </div>
  );
}
