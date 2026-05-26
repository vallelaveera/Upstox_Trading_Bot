import { Briefcase } from "@phosphor-icons/react";
import { inrFull2, pct, fmtDate } from "@/lib/format";

export default function OpenPositions({ positions }) {
  return (
    <div
      className="bg-[#0c0c0c] border border-white/10 rounded-xl overflow-hidden h-full"
      data-testid="open-positions-card"
    >
      <div className="p-5 md:p-6 border-b border-white/5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Briefcase size={18} weight="duotone" className="text-[#FBBF24]" />
          <h3 className="font-display font-bold text-lg uppercase tracking-tight">
            Open Positions
          </h3>
        </div>
        <span className="text-xs font-mono text-neutral-500" data-testid="open-positions-count">
          {positions?.length || 0}
        </span>
      </div>

      <div className="p-3 md:p-4 max-h-[480px] overflow-y-auto space-y-2">
        {(!positions || positions.length === 0) && (
          <div className="text-center py-12 text-neutral-500 font-mono text-sm">
            No open positions — all trades closed.
          </div>
        )}
        {positions?.map((p) => {
          const positive = p.unrealized_pnl >= 0;
          const c = positive ? "#FDE047" : "#FF3B30";
          return (
            <div
              key={p.symbol}
              data-testid={`open-position-${p.symbol}`}
              className="bg-black/40 border border-white/5 rounded-lg p-3 hover:border-white/15 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-white text-sm">{p.symbol}</span>
                    <span className="text-[10px] uppercase text-neutral-500 tracking-widest font-mono">
                      {p.sector}
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-500 truncate mt-0.5">{p.name}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono font-bold text-sm" style={{ color: c }}>
                    {pct(p.unrealized_pnl_pct)}
                  </div>
                  <div className="text-[11px] font-mono" style={{ color: c }}>
                    {positive ? "+" : ""}
                    {inrFull2(p.unrealized_pnl)}
                  </div>
                </div>
              </div>

              <div className="mt-2 pt-2 border-t border-white/5 grid grid-cols-3 gap-2 text-[11px] font-mono">
                <Stat k="QTY" v={p.qty} />
                <Stat k="BUY" v={inrFull2(p.buy_price)} sub={fmtDate(p.buy_date)} />
                <Stat k="LTP" v={inrFull2(p.current_price)} accent={c} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({ k, v, sub, accent }) {
  return (
    <div>
      <div className="text-[9px] text-neutral-500 uppercase tracking-widest">{k}</div>
      <div className="text-neutral-200" style={accent ? { color: accent } : {}}>{v}</div>
      {sub && <div className="text-[9px] text-neutral-600">{sub}</div>}
    </div>
  );
}
