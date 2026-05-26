import { ChartLineUp, Lightning, ShieldCheck, ArrowDown, ArrowUp } from "@phosphor-icons/react";

export default function EmptyState() {
  return (
    <div
      className="relative bg-[#0c0c0c] border border-white/10 rounded-2xl p-8 md:p-14 overflow-hidden"
      data-testid="empty-state"
    >
      <div className="absolute -right-32 -top-32 h-72 w-72 rounded-full bg-[#FBBF24]/5 blur-3xl" />
      <div className="absolute -left-24 -bottom-24 h-72 w-72 rounded-full bg-[#FDE047]/5 blur-3xl" />

      <div className="relative z-10 max-w-2xl">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-[#FDE047] pulse-dot" />
          <span className="text-[11px] font-mono uppercase tracking-widest text-neutral-300">
            Real NSE data · Yahoo Finance
          </span>
        </div>

        <h2 className="font-display text-3xl md:text-5xl font-black tracking-tight leading-[1.05]">
          Backtest your <span className="text-[#FBBF24]">swing</span> strategy <br />
          on the last <span className="font-mono">N</span> weeks of NSE.
        </h2>

        <p className="mt-5 text-neutral-200 text-sm md:text-base max-w-xl leading-relaxed">
          Drop ₹5L of paper capital into the engine. We scan Nifty 50 daily, buy
          stocks dipping inside your dip-band, sell on target or stop-loss. Tweak
          the filters, then mash the yellow button.
        </p>

        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-3">
          <Step
            n="01"
            icon={ArrowDown}
            title="Scan daily drops"
            desc="Stocks falling 2–4% in one session"
          />
          <Step
            n="02"
            icon={Lightning}
            title="Rotate capital"
            desc="20 slots, redeploy as winners exit"
          />
          <Step
            n="03"
            icon={ArrowUp}
            title="Quick exit"
            desc="Target +3.5%, max 4-day hold"
          />
        </div>

        <div className="mt-8 flex items-center gap-4 text-xs text-neutral-500 font-mono">
          <span className="flex items-center gap-1.5">
            <ShieldCheck size={14} weight="duotone" className="text-[#FDE047]" />
            No login required
          </span>
          <span>·</span>
          <span className="flex items-center gap-1.5">
            <ChartLineUp size={14} weight="duotone" className="text-[#FBBF24]" />
            Live market data
          </span>
        </div>
      </div>
    </div>
  );
}

function Step({ n, icon: Icon, title, desc }) {
  return (
    <div className="bg-black/40 border border-white/10 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[11px] text-neutral-500">{n}</span>
        <Icon size={18} weight="duotone" className="text-[#FBBF24]" />
      </div>
      <div className="font-display font-bold text-base">{title}</div>
      <div className="text-[12px] text-neutral-400 mt-1">{desc}</div>
    </div>
  );
}
