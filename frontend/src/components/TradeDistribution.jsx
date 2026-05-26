import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, ReferenceLine } from "recharts";

function buildBuckets(trades) {
  const closed = trades.filter((t) => t.status === "closed" && t.pnl_pct != null);
  if (closed.length === 0) return [];
  const min = Math.floor(Math.min(...closed.map((t) => t.pnl_pct)));
  const max = Math.ceil(Math.max(...closed.map((t) => t.pnl_pct)));
  const step = 0.5;
  const buckets = {};
  for (let v = min; v <= max; v += step) {
    const key = parseFloat(v.toFixed(1));
    buckets[key] = { range: `${key}%`, count: 0, positive: key >= 0 };
  }
  closed.forEach((t) => {
    const bucket = parseFloat((Math.floor(t.pnl_pct / step) * step).toFixed(1));
    if (buckets[bucket] !== undefined) buckets[bucket].count++;
  });
  return Object.values(buckets).filter((b) => b.count > 0 || (b.range >= "-2%" && b.range <= "5%"));
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-black/95 border border-white/15 rounded-lg px-3 py-2 text-xs font-mono shadow-xl">
      <div className="text-neutral-400">{label}</div>
      <div className="text-white font-bold mt-1">{payload[0].value} trades</div>
    </div>
  );
}

export default function TradeDistribution({ trades }) {
  const data = buildBuckets(trades || []);
  if (data.length === 0) return null;

  return (
    <div className="bg-[#0c0c0c] border border-white/10 rounded-xl p-5 md:p-6">
      <div className="mb-4">
        <h3 className="font-display font-bold text-lg uppercase tracking-tight">Trade Return Distribution</h3>
        <p className="text-xs text-neutral-500 mt-1 font-mono">P&L % per closed trade</p>
      </div>
      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="range"
              tick={{ fill: "#737373", fontSize: 10, fontFamily: "JetBrains Mono" }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              minTickGap={20}
            />
            <YAxis
              tick={{ fill: "#737373", fontSize: 10, fontFamily: "JetBrains Mono" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
              width={28}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine x="0%" stroke="#FBBF24" strokeDasharray="4 4" strokeOpacity={0.4} />
            <Bar
              dataKey="count"
              radius={[3, 3, 0, 0]}
              fill="#FBBF24"
              fillOpacity={0.7}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
