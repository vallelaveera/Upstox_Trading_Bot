import { useState, useCallback } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Lightning, ArrowsClockwise, Plus, X, Trophy, ChartBar } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
} from "recharts";
import { inrCompact, inrFull, fmtDate, pct } from "@/lib/format";
import { STRATEGY_TYPES, UNIVERSE_OPTIONS } from "@/lib/strategies";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const COLORS = ["#FBBF24", "#FDE047", "#00B0FF", "#FF6EC7", "#FFA940"];

const DEFAULT_STRATEGY = (i) => ({
  label: `Strategy ${i + 1}`,
  strategy_type: "daily_drop",
  daily_drop_min: 2,
  daily_drop_max: 4,
  weekly_drop_min: 5,
  weekly_drop_max: 12,
  dip_min: 5,
  dip_max: 15,
  lookback_days: 20,
  consecutive_down_min: 3,
  recovery_target: 3.5,
  stop_loss: 7,
  max_holding_days: 4,
  max_positions: 20,
  max_picks_per_day: 5,
});

const PRESET_STRATEGIES = [
  {
    label: "Daily 20×₹25K",
    strategy_type: "daily_drop",
    daily_drop_min: 2,
    daily_drop_max: 4,
    recovery_target: 3.5,
    stop_loss: 7,
    max_holding_days: 4,
    max_positions: 20,
    max_picks_per_day: 5,
  },
  {
    label: "Daily 40×₹12.5K",
    strategy_type: "daily_drop",
    daily_drop_min: 2,
    daily_drop_max: 4,
    recovery_target: 3.5,
    stop_loss: 7,
    max_holding_days: 4,
    max_positions: 40,
    max_picks_per_day: 10,
  },
  {
    label: "PeakDip 20×₹25K",
    strategy_type: "peak_dip",
    dip_min: 5,
    dip_max: 15,
    recovery_target: 8,
    stop_loss: 7,
    max_holding_days: 0,
    max_positions: 20,
  },
  {
    label: "Sniper 5×₹1L",
    strategy_type: "daily_drop",
    daily_drop_min: 3,
    daily_drop_max: 6,
    recovery_target: 4,
    stop_loss: 6,
    max_holding_days: 5,
    max_positions: 5,
    max_picks_per_day: 2,
  },
  {
    label: "Weekly Drop",
    strategy_type: "weekly_drop",
    weekly_drop_min: 6,
    weekly_drop_max: 14,
    recovery_target: 5,
    stop_loss: 8,
    max_holding_days: 7,
    max_positions: 20,
    max_picks_per_day: 5,
  },
];

export default function ComparePanel({ sectors }) {
  const [capital, setCapital] = useState(500000);
  const [weeks, setWeeks] = useState(4);
  const [universe, setUniverse] = useState("nifty200");
  const [strategies, setStrategies] = useState(PRESET_STRATEGIES.slice(0, 3));
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);

  const updateStrat = (idx, patch) => {
    setStrategies((arr) => arr.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const removeStrat = (idx) => {
    setStrategies((arr) => arr.filter((_, i) => i !== idx));
  };

  const addStrat = () => {
    if (strategies.length >= 5) return;
    setStrategies((arr) => [...arr, DEFAULT_STRATEGY(arr.length)]);
  };

  const loadPreset = (idx) => {
    if (strategies.length >= 5) {
      toast.error("Maximum 5 strategies");
      return;
    }
    setStrategies((arr) => [...arr, { ...PRESET_STRATEGIES[idx] }]);
  };

  const runAll = useCallback(async () => {
    if (strategies.length === 0) {
      toast.error("Add at least one strategy");
      return;
    }
    setRunning(true);
    try {
      const res = await axios.post(
        `${API}/compare`,
        { capital, weeks, universe, strategies },
        { timeout: 240000 }
      );
      setResults(res.data);
      const winner = res.data.results.reduce(
        (best, r) => (r.kpis?.net_pnl > (best?.kpis?.net_pnl ?? -Infinity) ? r : best),
        null
      );
      toast.success(
        `Compared ${res.data.results.length} strategies · Winner: ${winner?.label}`
      );
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message || "Compare failed";
      toast.error(typeof msg === "string" ? msg : "Compare failed");
    } finally {
      setRunning(false);
    }
  }, [capital, weeks, universe, strategies]);

  return (
    <div className="space-y-6" data-testid="compare-panel">
      {/* Top bar */}
      <div className="bg-[#0c0c0c] border border-white/10 rounded-xl p-5 md:p-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <Label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-[0.18em]">
              Capital
            </Label>
            <Input
              type="number"
              step={10000}
              value={capital}
              onChange={(e) => setCapital(Number(e.target.value))}
              disabled={running}
              data-testid="compare-capital-input"
              className="bg-black border-white/10 text-white font-mono mt-2"
            />
            <div className="text-[11px] font-mono text-neutral-500 mt-1">
              {inrFull(capital)}
            </div>
          </div>
          <div>
            <Label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-[0.18em]">
              Period
            </Label>
            <Select
              value={String(weeks)}
              onValueChange={(v) => setWeeks(Number(v))}
              disabled={running}
            >
              <SelectTrigger
                className="bg-black border-white/10 text-white font-mono mt-2"
                data-testid="compare-weeks-trigger"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0c0c0c] border-white/10 text-white">
                {[1, 2, 4, 6, 8, 12, 16, 24].map((w) => (
                  <SelectItem key={w} value={String(w)} className="font-mono">
                    Last {w} {w === 1 ? "week" : "weeks"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-[0.18em]">
              Universe
            </Label>
            <Select
              value={universe}
              onValueChange={setUniverse}
              disabled={running}
            >
              <SelectTrigger
                className="bg-black border-white/10 text-white font-mono mt-2"
                data-testid="compare-universe-trigger"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0c0c0c] border-white/10 text-white">
                {UNIVERSE_OPTIONS.map((u) => (
                  <SelectItem key={u.key} value={u.key} className="font-mono">
                    {u.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button
              onClick={runAll}
              disabled={running || strategies.length === 0}
              data-testid="run-compare-button"
              className="w-full bg-[#FBBF24] hover:bg-[#D97706] text-black font-bold py-6 tracking-wide"
            >
              {running ? (
                <>
                  <ArrowsClockwise size={20} weight="bold" className="mr-2 animate-spin" />
                  Running…
                </>
              ) : (
                <>
                  <Lightning size={20} weight="fill" className="mr-2" />
                  Compare All
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Quick add presets */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-neutral-500 uppercase tracking-widest font-semibold">
          Quick add:
        </span>
        {PRESET_STRATEGIES.map((p, i) => (
          <button
            key={p.label}
            type="button"
            disabled={running || strategies.length >= 5}
            onClick={() => loadPreset(i)}
            data-testid={`compare-preset-${i}`}
            className="text-xs font-mono px-3 py-1.5 rounded-full border border-white/10 hover:border-[#FBBF24]/40 hover:bg-[#FBBF24]/5 transition-colors text-neutral-300 disabled:opacity-40"
          >
            + {p.label}
          </button>
        ))}
      </div>

      {/* Strategy editor cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4" data-testid="strategy-cards">
        {strategies.map((s, idx) => (
          <StrategyCard
            key={idx}
            idx={idx}
            color={COLORS[idx]}
            strategy={s}
            update={(p) => updateStrat(idx, p)}
            remove={() => removeStrat(idx)}
            disabled={running}
          />
        ))}
        {strategies.length < 5 && (
          <button
            type="button"
            disabled={running}
            onClick={addStrat}
            data-testid="compare-add-strategy"
            className="bg-[#0c0c0c] border-2 border-dashed border-white/10 rounded-xl p-6 hover:border-[#FBBF24]/40 hover:bg-[#FBBF24]/5 transition-colors flex flex-col items-center justify-center gap-2 min-h-[200px] text-neutral-500 hover:text-[#FBBF24]"
          >
            <Plus size={28} weight="bold" />
            <span className="font-display font-bold uppercase tracking-wide text-sm">
              Add Strategy ({strategies.length}/5)
            </span>
          </button>
        )}
      </div>

      {/* Results */}
      {results && <CompareResults results={results} colors={COLORS} starting={capital} />}

      {/* Empty hint */}
      {!results && !running && (
        <div className="bg-[#0c0c0c] border border-dashed border-white/10 rounded-xl p-10 text-center">
          <ChartBar size={32} weight="duotone" className="mx-auto text-[#FBBF24] mb-3" />
          <h3 className="font-display font-bold text-lg uppercase tracking-tight">
            Compare up to 5 strategies head-to-head
          </h3>
          <p className="text-sm text-neutral-500 mt-2 max-w-md mx-auto">
            Same window, same capital, same universe — different strategies. Find your
            winner before going live on Upstox.
          </p>
        </div>
      )}
    </div>
  );
}

function StrategyCard({ idx, color, strategy, update, remove, disabled }) {
  const t = STRATEGY_TYPES.find((x) => x.key === strategy.strategy_type);
  return (
    <div
      className="bg-[#0c0c0c] border border-white/10 rounded-xl p-5 relative overflow-hidden"
      data-testid={`strategy-card-${idx}`}
    >
      <div
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: color }}
      />
      <div className="flex items-center justify-between mb-3">
        <Input
          value={strategy.label}
          onChange={(e) => update({ label: e.target.value })}
          disabled={disabled}
          data-testid={`strategy-label-${idx}`}
          className="bg-transparent border-0 text-white font-display font-bold text-base p-0 focus-visible:ring-0 focus-visible:bg-white/5 px-2 h-9"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={remove}
          data-testid={`strategy-remove-${idx}`}
          className="text-neutral-500 hover:text-[#FF3B30] transition-colors p-1"
        >
          <X size={16} weight="bold" />
        </button>
      </div>

      <div className="space-y-3">
        <SmallSelect
          label="Trigger"
          value={strategy.strategy_type}
          onChange={(v) => update({ strategy_type: v })}
          options={STRATEGY_TYPES.map((s) => ({ value: s.key, label: s.label }))}
          disabled={disabled}
          testid={`strategy-trigger-${idx}`}
        />

        {strategy.strategy_type === "daily_drop" && (
          <div className="grid grid-cols-2 gap-2">
            <SmallNum label="Drop min %" value={strategy.daily_drop_min} onChange={(v) => update({ daily_drop_min: v })} disabled={disabled} step={0.25} />
            <SmallNum label="Drop max %" value={strategy.daily_drop_max} onChange={(v) => update({ daily_drop_max: v })} disabled={disabled} step={0.25} />
          </div>
        )}
        {strategy.strategy_type === "peak_dip" && (
          <div className="grid grid-cols-2 gap-2">
            <SmallNum label="Dip min %" value={strategy.dip_min} onChange={(v) => update({ dip_min: v })} disabled={disabled} />
            <SmallNum label="Dip max %" value={strategy.dip_max} onChange={(v) => update({ dip_max: v })} disabled={disabled} />
          </div>
        )}
        {strategy.strategy_type === "weekly_drop" && (
          <div className="grid grid-cols-2 gap-2">
            <SmallNum label="5-day min %" value={strategy.weekly_drop_min} onChange={(v) => update({ weekly_drop_min: v })} disabled={disabled} />
            <SmallNum label="5-day max %" value={strategy.weekly_drop_max} onChange={(v) => update({ weekly_drop_max: v })} disabled={disabled} />
          </div>
        )}
        {strategy.strategy_type === "consecutive_down" && (
          <SmallNum label="Min red days" value={strategy.consecutive_down_min} onChange={(v) => update({ consecutive_down_min: v })} disabled={disabled} step={1} />
        )}

        <div className="grid grid-cols-2 gap-2">
          <SmallNum label="Target +%" value={strategy.recovery_target} onChange={(v) => update({ recovery_target: v })} disabled={disabled} step={0.25} />
          <SmallNum label="Stop −%" value={strategy.stop_loss} onChange={(v) => update({ stop_loss: v })} disabled={disabled} step={0.25} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <SmallNum label="Hold ≤ days" value={strategy.max_holding_days} onChange={(v) => update({ max_holding_days: v })} disabled={disabled} step={1} hint="0=off" />
          <SmallNum label="Max positions" value={strategy.max_positions} onChange={(v) => update({ max_positions: v })} disabled={disabled} step={1} />
        </div>
        <SmallNum label="Max picks/day" value={strategy.max_picks_per_day} onChange={(v) => update({ max_picks_per_day: v })} disabled={disabled} step={1} hint="0=unlimited" />
      </div>

      <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
        <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
          {t?.label} · {strategy.max_positions} slots
        </span>
      </div>
    </div>
  );
}

function SmallSelect({ label, value, onChange, options, disabled, testid }) {
  return (
    <div>
      <Label className="text-[10px] text-neutral-500 uppercase tracking-widest font-semibold">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger
          className="bg-black border-white/10 text-white font-mono text-xs h-9 mt-1"
          data-testid={testid}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="bg-[#0c0c0c] border-white/10 text-white">
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="font-mono text-xs">
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function SmallNum({ label, value, onChange, disabled, step = 0.5, hint }) {
  return (
    <div>
      <Label className="text-[10px] text-neutral-500 uppercase tracking-widest font-semibold flex items-center justify-between">
        <span>{label}</span>
        {hint && <span className="text-[9px] normal-case tracking-normal text-neutral-600">{hint}</span>}
      </Label>
      <Input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="bg-black border-white/10 text-white font-mono text-xs h-9 mt-1"
      />
    </div>
  );
}

function CompareResults({ results, colors, starting }) {
  const list = results.results || [];
  // build merged equity data for chart
  const dateSet = new Set();
  list.forEach((r) => (r.equity_curve || []).forEach((p) => dateSet.add(p.date)));
  const dates = Array.from(dateSet).sort();
  const merged = dates.map((d) => {
    const row = { date: d, label: fmtDate(d) };
    list.forEach((r, i) => {
      const pt = (r.equity_curve || []).find((p) => p.date === d);
      row[r.label || `s${i}`] = pt ? pt.equity : null;
    });
    return row;
  });

  // winner by net_pnl
  const winnerIdx = list.reduce(
    (best, r, i) =>
      r.kpis?.net_pnl > (list[best]?.kpis?.net_pnl ?? -Infinity) ? i : best,
    0
  );

  const allValues = merged.flatMap((r) =>
    list.map((s) => r[s.label]).filter((v) => v != null)
  );
  const yMin = Math.min(starting, ...allValues);
  const yMax = Math.max(starting, ...allValues);
  const pad = (yMax - yMin) * 0.1 || starting * 0.02;

  return (
    <div className="space-y-4" data-testid="compare-results">
      {/* Equity chart */}
      <div className="bg-[#0c0c0c] border border-white/10 rounded-xl p-5 md:p-6">
        <div className="flex items-end justify-between mb-4 flex-wrap gap-2">
          <div>
            <h3 className="font-display font-bold text-lg md:text-xl uppercase tracking-tight">
              Equity Comparison
            </h3>
            <p className="text-xs text-neutral-500 mt-1 font-mono">
              All strategies · same window · same capital
            </p>
          </div>
        </div>
        <div className="h-[380px] w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <LineChart data={merged} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
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
                domain={[Math.floor(yMin - pad), Math.ceil(yMax + pad)]}
                stroke="#666"
                tick={{ fill: "#A3A3A3", fontSize: 11, fontFamily: "JetBrains Mono" }}
                tickLine={false}
                axisLine={{ stroke: "rgba(255,255,255,0.08)" }}
                tickFormatter={(v) => inrCompact(v)}
                width={70}
              />
              <Tooltip
                contentStyle={{
                  background: "rgba(0,0,0,0.95)",
                  border: "1px solid rgba(255,255,255,0.15)",
                  borderRadius: "8px",
                  fontFamily: "JetBrains Mono",
                  fontSize: "12px",
                }}
                formatter={(v) => inrFull(v)}
              />
              <Legend
                wrapperStyle={{
                  fontFamily: "JetBrains Mono",
                  fontSize: "11px",
                  paddingTop: "8px",
                }}
              />
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
              {list.map((r, i) => (
                <Line
                  key={r.label || i}
                  type="monotone"
                  dataKey={r.label || `s${i}`}
                  stroke={colors[i % colors.length]}
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5, stroke: "#050505", strokeWidth: 2 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Comparison matrix */}
      <div className="bg-[#0c0c0c] border border-white/10 rounded-xl p-5 md:p-6 overflow-x-auto" data-testid="compare-matrix">
        <h3 className="font-display font-bold text-lg uppercase tracking-tight mb-4">
          Head-to-head matrix
        </h3>
        <table className="w-full text-sm font-mono">
          <thead>
            <tr className="border-b border-white/10">
              <Th>Strategy</Th>
              <Th right>Net P&L</Th>
              <Th right>Return</Th>
              <Th right>Win Rate</Th>
              <Th right>Trades</Th>
              <Th right>Avg Hold</Th>
              <Th right>Max DD</Th>
              <Th right>Tgt/SL/Time</Th>
            </tr>
          </thead>
          <tbody>
            {list.map((r, i) => {
              const k = r.kpis || {};
              const isWinner = i === winnerIdx;
              const positive = (k.net_pnl ?? 0) >= 0;
              const c = positive ? "#FDE047" : "#FF3B30";
              return (
                <tr
                  key={r.label || i}
                  className={`border-b border-white/5 hover:bg-white/[0.02] ${
                    isWinner ? "bg-[#FBBF24]/5" : ""
                  }`}
                  data-testid={`compare-row-${i}`}
                >
                  <td className="py-3 px-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full inline-block"
                        style={{ background: colors[i % colors.length] }}
                      />
                      <span className="font-display font-bold text-white text-sm">
                        {r.label}
                      </span>
                      {isWinner && (
                        <Trophy size={14} weight="fill" className="text-[#FBBF24]" />
                      )}
                    </div>
                    <div className="text-[10px] text-neutral-500 mt-0.5">
                      {STRATEGY_TYPES.find((s) => s.key === r.params?.strategy_type)?.label} ·{" "}
                      {r.params?.max_positions} slots
                    </div>
                  </td>
                  <Td right style={{ color: c }} bold>
                    {positive ? "+" : ""}
                    {inrFull(k.net_pnl)}
                  </Td>
                  <Td right style={{ color: c }}>{pct(k.return_pct)}</Td>
                  <Td right>{(k.win_rate ?? 0).toFixed(1)}%</Td>
                  <Td right>{k.total_trades ?? 0}</Td>
                  <Td right>{(k.avg_holding_days ?? 0).toFixed(1)}d</Td>
                  <Td right style={{ color: "#FF3B30" }}>
                    -{(k.max_drawdown_pct ?? 0).toFixed(2)}%
                  </Td>
                  <Td right>
                    <span className="text-[#FDE047]">{k.exits_target ?? 0}</span>
                    <span className="text-neutral-500"> / </span>
                    <span className="text-[#FF3B30]">{k.exits_stoploss ?? 0}</span>
                    <span className="text-neutral-500"> / </span>
                    <span className="text-neutral-300">{k.exits_time ?? 0}</span>
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, right }) {
  return (
    <th
      className={`text-[10px] uppercase tracking-widest text-neutral-500 font-semibold py-2 px-2 ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

function Td({ children, right, style, bold }) {
  return (
    <td
      className={`py-3 px-2 ${right ? "text-right" : "text-left"} ${
        bold ? "font-bold" : ""
      } text-neutral-300`}
      style={style}
    >
      {children}
    </td>
  );
}
