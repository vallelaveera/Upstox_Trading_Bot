import { useMemo, useState } from "react";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtDate, inrFull2, pct } from "@/lib/format";

export default function TradesTable({ trades }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");

  const rows = useMemo(() => {
    let r = trades || [];
    if (filter !== "all") r = r.filter((t) => t.status === filter);
    if (q) {
      const ql = q.toLowerCase();
      r = r.filter(
        (t) =>
          t.symbol.toLowerCase().includes(ql) ||
          (t.name || "").toLowerCase().includes(ql) ||
          (t.sector || "").toLowerCase().includes(ql)
      );
    }
    return r;
  }, [trades, q, filter]);

  return (
    <div className="bg-[#0c0c0c] border border-white/10 rounded-xl overflow-hidden" data-testid="trades-card">
      <div className="p-5 md:p-6 flex items-center justify-between gap-3 flex-wrap border-b border-white/5">
        <div>
          <h3 className="font-display font-bold text-lg md:text-xl uppercase tracking-tight">
            Trade Log
          </h3>
          <p className="text-xs text-neutral-500 mt-1 font-mono">
            {rows.length} of {trades?.length || 0} trades
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <MagnifyingGlass
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500"
            />
            <Input
              placeholder="Search stock…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              data-testid="trades-search-input"
              className="bg-black border-white/10 text-white pl-9 w-44 font-mono text-sm"
            />
          </div>
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger
              className="w-32 bg-black border-white/10 text-white font-mono text-sm"
              data-testid="trades-filter-trigger"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-[#0c0c0c] border-white/10 text-white">
              <SelectItem value="all" data-testid="trades-filter-all">
                All
              </SelectItem>
              <SelectItem value="closed" data-testid="trades-filter-closed">
                Closed
              </SelectItem>
              <SelectItem value="open" data-testid="trades-filter-open">
                Open
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[520px]">
        <Table>
          <TableHeader>
            <TableRow className="border-white/5 hover:bg-transparent">
              <TableHead className="text-[10px] uppercase tracking-widest text-neutral-500">
                Stock
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest text-neutral-500">
                Buy
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest text-neutral-500">
                Sell
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest text-neutral-500 text-right">
                Qty
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest text-neutral-500 text-right">
                P&L
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest text-neutral-500 text-right">
                P&L %
              </TableHead>
              <TableHead className="text-[10px] uppercase tracking-widest text-neutral-500 text-right">
                Status
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-12 text-neutral-500 font-mono text-sm">
                  No trades match your filter.
                </TableCell>
              </TableRow>
            )}
            {rows.map((t, idx) => {
              const positive = t.pnl >= 0;
              const c = positive ? "#00E676" : "#FF3B30";
              return (
                <TableRow
                  key={`${t.symbol}-${t.buy_date}-${idx}`}
                  className="border-white/5 hover:bg-white/[0.02]"
                  data-testid={`trade-row-${t.symbol}`}
                >
                  <TableCell className="py-3">
                    <div className="flex flex-col">
                      <span className="font-mono font-bold text-white text-sm">{t.symbol}</span>
                      <span className="text-[11px] text-neutral-500 truncate max-w-[150px]">
                        {t.sector}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-neutral-300 text-sm">
                    <div>{inrFull2(t.buy_price)}</div>
                    <div className="text-[11px] text-neutral-500">{fmtDate(t.buy_date)}</div>
                  </TableCell>
                  <TableCell className="font-mono text-neutral-300 text-sm">
                    {t.sell_price ? (
                      <>
                        <div>{inrFull2(t.sell_price)}</div>
                        <div className="text-[11px] text-neutral-500">
                          {t.status === "closed" ? fmtDate(t.sell_date) : "live"}
                        </div>
                      </>
                    ) : (
                      <span className="text-neutral-600">—</span>
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-neutral-300 text-sm text-right">{t.qty}</TableCell>
                  <TableCell
                    className="font-mono font-bold text-sm text-right"
                    style={{ color: c }}
                  >
                    {positive ? "+" : ""}
                    {inrFull2(t.pnl)}
                  </TableCell>
                  <TableCell className="font-mono text-sm text-right" style={{ color: c }}>
                    {pct(t.pnl_pct)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant="outline"
                      className={`font-mono text-[10px] uppercase tracking-widest border ${
                        t.status === "closed"
                          ? "border-white/15 text-neutral-300 bg-white/5"
                          : "border-[#00C896]/40 text-[#00C896] bg-[#00C896]/5"
                      }`}
                    >
                      {t.status === "closed" ? t.reason || "closed" : "open"}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
