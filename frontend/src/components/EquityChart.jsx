import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import { inrCompact, inrFull, fmtDate } from "@/lib/format";

export default function EquityChart({ data, starting }) {
  if (!data || data.length === 0) return null;

  const formatted = data.map((d) => ({
    ...d,
    label: fmtDate(d.date),
  }));
  const max = Math.max(...data.map((d) => d.equity));
  const min = Math.min(...data.map((d) => d.equity));
  const padding = (max - min) * 0.15 || starting * 0.02;

  return (
    <div
      className="bg-[#0c0c0c] border border-white/10 rounded-xl p-5 md:p-6"
      data-testid="equity-chart-card"
    >
      <div className="flex items-end justify-between mb-4 flex-wrap gap-2">
        <div>
          <h3 className="font-display font-bold text-lg md:text-xl uppercase tracking-tight">
            Equity Curve
          </h3>
          <p className="text-xs text-neutral-500 mt-1 font-mono">
            Daily mark-to-market portfolio value
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#E2FF00]" />
            <span className="text-neutral-400 font-mono">Equity</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-px w-4 bg-neutral-500 border-dashed" style={{borderTop:"1px dashed #737373", height:0}} />
            <span className="text-neutral-400 font-mono">Capital</span>
          </span>
        </div>
      </div>

      <div className="h-[320px] md:h-[360px] w-full" data-testid="equity-chart-svg">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <AreaChart data={formatted} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#E2FF00" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#E2FF00" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="#666"
              tick={{ fill: "#A3A3A3", fontSize: 11, fontFamily: "JetBrains Mono" }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              minTickGap={32}
            />
            <YAxis
              domain={[Math.floor(min - padding), Math.ceil(max + padding)]}
              stroke="#666"
              tick={{ fill: "#A3A3A3", fontSize: 11, fontFamily: "JetBrains Mono" }}
              tickLine={false}
              axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
              tickFormatter={(v) => inrCompact(v)}
              width={70}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              y={starting}
              stroke="#737373"
              strokeDasharray="4 4"
              label={{
                value: `Capital ${inrCompact(starting)}`,
                fill: "#A3A3A3",
                fontSize: 10,
                position: "insideTopRight",
                fontFamily: "JetBrains Mono",
              }}
            />
            <Area
              type="monotone"
              dataKey="equity"
              stroke="#E2FF00"
              strokeWidth={2}
              fill="url(#equityFill)"
              activeDot={{ r: 5, fill: "#E2FF00", stroke: "#050505", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-black/95 border border-white/15 rounded-lg p-3 backdrop-blur-sm shadow-2xl">
      <div className="text-xs text-neutral-400 font-mono mb-1.5">{label}</div>
      <div className="space-y-1 text-sm font-mono">
        <Row k="Equity" v={inrFull(d.equity)} c="#E2FF00" />
        <Row k="Cash" v={inrFull(d.cash)} c="#fff" />
        <Row k="Invested" v={inrFull(d.invested)} c="#fff" />
        <Row k="Open pos" v={d.open_positions} c="#A3A3A3" />
      </div>
    </div>
  );
}

function Row({ k, v, c }) {
  return (
    <div className="flex items-center justify-between gap-6">
      <span className="text-neutral-500">{k}</span>
      <span style={{ color: c }} className="font-bold">{v}</span>
    </div>
  );
}
