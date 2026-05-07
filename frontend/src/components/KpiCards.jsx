import {
  Wallet,
  TrendUp,
  TrendDown,
  Trophy,
  ListChecks,
  Stack,
} from "@phosphor-icons/react";
import { inrFull, pct } from "@/lib/format";

export default function KpiCards({ kpis, simStart, simEnd }) {
  const positive = kpis.net_pnl >= 0;
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
      sub: `${pct(kpis.return_pct)} return`,
      icon: Stack,
      color: positive ? "#00E676" : "#FF3B30",
    },
    {
      key: "net-pnl",
      label: "Net P&L",
      value: `${positive ? "+" : ""}${inrFull(kpis.net_pnl)}`,
      sub: `Realized ${inrFull(kpis.realized_pnl)} · Open ${inrFull(kpis.unrealized_pnl)}`,
      icon: positive ? TrendUp : TrendDown,
      color: positive ? "#00E676" : "#FF3B30",
      big: true,
    },
    {
      key: "win-rate",
      label: "Win Rate",
      value: `${kpis.win_rate.toFixed(1)}%`,
      sub: `${kpis.wins}W · ${kpis.losses}L of ${kpis.closed_trades} closed`,
      icon: Trophy,
      color: "#E2FF00",
    },
    {
      key: "total-trades",
      label: "Total Trades",
      value: String(kpis.total_trades),
      sub: `${kpis.closed_trades} closed · ${kpis.open_positions} open`,
      icon: ListChecks,
      color: "#A3A3A3",
    },
  ];

  return (
    <div
      className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4"
      data-testid="kpi-grid"
    >
      {items.map(({ key, label, value, sub, icon: Icon, color, big }) => (
        <div
          key={key}
          data-testid={`kpi-${key}`}
          className="relative bg-[#0c0c0c] border border-white/10 rounded-xl p-4 md:p-5 hover:border-white/20 transition-colors group overflow-hidden"
        >
          <div
            className="absolute -right-6 -top-6 h-20 w-20 rounded-full opacity-10 group-hover:opacity-20 transition-opacity"
            style={{ background: color }}
          />
          <div className="flex items-center justify-between mb-3 relative z-10">
            <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-[0.2em]">
              {label}
            </span>
            <Icon size={18} weight="duotone" style={{ color }} />
          </div>
          <div
            className={`font-mono font-bold tracking-tight ${
              big ? "text-2xl lg:text-3xl" : "text-xl lg:text-2xl"
            }`}
            style={{ color: ["net-pnl", "final-portfolio"].includes(key) ? color : "#fff" }}
            data-testid={`kpi-${key}-value`}
          >
            {value}
          </div>
          <div className="mt-2 text-[11px] text-neutral-500 font-mono truncate">{sub}</div>
        </div>
      ))}
    </div>
  );
}
