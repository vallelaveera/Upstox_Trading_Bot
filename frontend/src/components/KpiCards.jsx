import {
  Wallet,
  TrendUp,
  TrendDown,
  Trophy,
  ListChecks,
  Stack,
  Receipt,
  ChartLine,
  ShieldWarning,
  ArrowsDownUp,
} from "@phosphor-icons/react";
import { inrFull, pct } from "@/lib/format";

export default function KpiCards({ kpis, simStart, simEnd }) {
  const positive = kpis.net_pnl >= 0;
  const grossPositive = (kpis.gross_pnl ?? kpis.net_pnl) >= 0;
  const items = [
    {
      key: "starting-capital",
      label: "Starting Capital",
      value: inrFull(kpis.starting_capital),
      sub: `${simStart || "—"} → ${simEnd || "—"}`,
      icon: Wallet,
      color: "#A3A3A3",
    },
    {
      key: "final-portfolio",
      label: "Final Portfolio",
      value: inrFull(kpis.final_portfolio),
      sub: `${pct(kpis.return_pct)} return after costs`,
      icon: Stack,
      color: positive ? "#FDE047" : "#FF3B30",
    },
    {
      key: "gross-pnl",
      label: "Gross P&L",
      value: `${grossPositive ? "+" : ""}${inrFull(kpis.gross_pnl ?? kpis.net_pnl)}`,
      sub: "Before costs (the headline)",
      icon: grossPositive ? TrendUp : TrendDown,
      color: grossPositive ? "#FDE047" : "#FF3B30",
    },
    {
      key: "total-costs",
      label: "Total Costs",
      value: `−${inrFull(kpis.total_costs ?? 0)}`,
      sub: `Brokerage ${inrFull(kpis.total_brokerage ?? 0)} · STT/slip ${inrFull(kpis.total_taxes_slippage ?? 0)}`,
      icon: Receipt,
      color: "#FF6EC7",
    },
    {
      key: "net-pnl",
      label: "Net P&L (after costs)",
      value: `${positive ? "+" : ""}${inrFull(kpis.net_pnl)}`,
      sub: `Cost drag −${(kpis.cost_drag_pct ?? 0).toFixed(2)}% of capital`,
      icon: positive ? TrendUp : TrendDown,
      color: positive ? "#FDE047" : "#FF3B30",
      big: true,
    },
    {
      key: "win-rate",
      label: "Win Rate",
      value: `${kpis.win_rate.toFixed(1)}%`,
      sub: `${kpis.wins}W · ${kpis.losses}L of ${kpis.closed_trades} closed`,
      icon: Trophy,
      color: "#FBBF24",
    },
    {
      key: "total-trades",
      label: "Total Trades",
      value: String(kpis.total_trades),
      sub: `${kpis.exits_target ?? 0}T · ${kpis.exits_stoploss ?? 0}SL · ${kpis.exits_time ?? 0}Time · ${kpis.open_positions}Open`,
      icon: ListChecks,
      color: "#A3A3A3",
    },
  ];

  const riskItems = [
    {
      key: "sharpe",
      label: "Sharpe Ratio",
      value: kpis.sharpe_ratio != null ? kpis.sharpe_ratio.toFixed(2) : "—",
      sub: "Risk-adjusted return (>1 = good)",
      icon: ChartLine,
      color: kpis.sharpe_ratio > 1 ? "#FBBF24" : kpis.sharpe_ratio > 0 ? "#A3A3A3" : "#EF4444",
    },
    {
      key: "sortino",
      label: "Sortino Ratio",
      value: kpis.sortino_ratio != null ? kpis.sortino_ratio.toFixed(2) : "—",
      sub: "Downside risk-adjusted (>2 = excellent)",
      icon: ArrowsDownUp,
      color: kpis.sortino_ratio > 2 ? "#FBBF24" : kpis.sortino_ratio > 0 ? "#A3A3A3" : "#EF4444",
    },
    {
      key: "max-drawdown",
      label: "Max Drawdown",
      value: kpis.max_drawdown_pct != null ? `−${kpis.max_drawdown_pct.toFixed(1)}%` : "—",
      sub: "Worst peak-to-trough loss",
      icon: ShieldWarning,
      color: kpis.max_drawdown_pct < 10 ? "#FBBF24" : kpis.max_drawdown_pct < 20 ? "#F59E0B" : "#EF4444",
    },
    {
      key: "calmar",
      label: "Calmar Ratio",
      value: kpis.calmar_ratio != null ? kpis.calmar_ratio.toFixed(2) : "—",
      sub: "Return / max drawdown (>1 = solid)",
      icon: TrendUp,
      color: kpis.calmar_ratio > 1 ? "#FBBF24" : "#A3A3A3",
    },
  ];

  return (
    <div className="space-y-3">
    <div
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3 md:gap-4"
      data-testid="kpi-grid"
    >
      {items.map(({ key, label, value, sub, icon: Icon, color, big }) => (
        <KpiCard key={key} label={label} value={value} sub={sub} Icon={Icon} color={color} big={big} testid={`kpi-${key}`} />
      ))}
    </div>

    {/* Risk metrics row */}
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
      {riskItems.map(({ key, label, value, sub, icon: Icon, color }) => (
        <KpiCard key={key} label={label} value={value} sub={sub} Icon={Icon} color={color} testid={`kpi-${key}`} />
      ))}
    </div>
    </div>
  );
}

function KpiCard({ label, value, sub, Icon, color, big, testid }) {
  return (
    <div
      data-testid={testid}
      className={`relative bg-[#0c0c0c] border rounded-xl p-4 md:p-5 hover:border-white/20 transition-colors group overflow-hidden ${
        big ? "border-[#FBBF24]/30 ring-1 ring-[#FBBF24]/10" : "border-white/10"
      }`}
    >
      <div
        className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-10 group-hover:opacity-20 transition-opacity"
        style={{ background: color }}
      />
      <div className="flex items-center justify-between mb-3 relative z-10">
        <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-[0.18em] truncate">{label}</span>
        <Icon size={18} weight="duotone" style={{ color }} />
      </div>
      <div
        className={`font-mono font-bold tracking-tight break-all ${big ? "text-xl lg:text-2xl" : "text-base lg:text-lg"}`}
        style={{ color }}
        data-testid={`${testid}-value`}
      >
        {value}
      </div>
      <div className="mt-2 text-[11px] text-neutral-500 font-mono leading-tight break-words" title={sub}>{sub}</div>
    </div>
  );
}
