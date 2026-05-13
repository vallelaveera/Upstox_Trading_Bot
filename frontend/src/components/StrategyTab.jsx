import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { toast } from "sonner";
import {
  Lightning,
  ArrowsClockwise,
  MagnifyingGlass,
  Robot,
  ShieldWarning,
  CheckCircle,
  XCircle,
  Warning,
  ListChecks,
  Coins,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { inrFull, inrFull2, pct } from "@/lib/format";
import { UNIVERSE_OPTIONS } from "@/lib/strategies";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function StrategyTab({ onOrdersPlaced }) {
  const [config, setConfig] = useState({
    capital: 50000,
    slots: 5,
    universe: "nifty500",
    drop_min: 1.5,
    drop_max: 4.0,
    product: "D",
    min_mcap_cr: 5000,
    max_price: 1000,
    target_pct: 5.0,
    stop_pct: 3.0,
    max_holding_days: 4,
  });
  const [scanning, setScanning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [autoMode, setAutoMode] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);
  const [confirmOneOpen, setConfirmOneOpen] = useState(null);
  const [executionResult, setExecutionResult] = useState(null);
  const [selected, setSelected] = useState(new Set());

  const update = (k, v) => setConfig((c) => ({ ...c, [k]: v }));
  const perSlot = config.capital / Math.max(1, config.slots);

  // Auto-preselect top N candidates whenever scan completes
  useEffect(() => {
    if (scanResult?.candidates?.length) {
      const top = scanResult.candidates
        .slice(0, config.slots)
        .map((c) => c.symbol);
      setSelected(new Set(top));
    } else {
      setSelected(new Set());
    }
  }, [scanResult, config.slots]);

  const toggleSelect = (symbol) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) {
        next.delete(symbol);
      } else {
        if (next.size >= config.slots) {
          toast.error(`Slot cap reached (${config.slots}). Deselect one first.`);
          return prev;
        }
        next.add(symbol);
      }
      return next;
    });
  };

  const selectTopN = () => {
    if (!scanResult?.candidates) return;
    setSelected(
      new Set(scanResult.candidates.slice(0, config.slots).map((c) => c.symbol))
    );
  };
  const clearAll = () => setSelected(new Set());

  const selectedPicks = useMemo(() => {
    if (!scanResult?.candidates) return [];
    return scanResult.candidates.filter((c) => selected.has(c.symbol));
  }, [scanResult, selected]);

  const totalSelectedCost = useMemo(() => {
    return selectedPicks.reduce((s, c) => {
      const qty = Math.floor(perSlot / c.ltp);
      return s + qty * c.ltp;
    }, 0);
  }, [selectedPicks, perSlot]);

  // SCAN
  const runScan = async () => {
    setScanning(true);
    setExecutionResult(null);
    try {
      const r = await axios.post(
        `${API}/upstox/scan`,
        {
          universe: config.universe,
          drop_min: config.drop_min,
          drop_max: config.drop_max,
          top_n: Math.max(config.slots * 2, 10),
          min_mcap_cr: config.min_mcap_cr,
          max_price: config.max_price,
        },
        { timeout: 120000 }
      );
      setScanResult(r.data);
      toast.success(
        `Found ${r.data.count} stocks dipping ${config.drop_min}–${config.drop_max}% today`
      );
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message;
      toast.error(`Scan failed: ${typeof msg === "string" ? msg : "unknown"}`);
    } finally {
      setScanning(false);
    }
  };

  // MANUAL EXECUTE — fires for the SELECTED candidates
  const executeAll = async () => {
    if (selectedPicks.length === 0) {
      toast.error("Select at least one stock");
      return;
    }
    setExecuting(true);
    try {
      const r = await axios.post(
        `${API}/upstox/strategy/execute`,
        {
          candidates: selectedPicks,
          capital: config.capital,
          slots: config.slots,
          product: config.product,
        },
        { timeout: 120000 }
      );
      setExecutionResult(r.data);
      toast.success(
        `${r.data.placed} placed · ${r.data.skipped} skipped · ${r.data.failed} failed`
      );
      onOrdersPlaced?.();
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message;
      toast.error(`Execute failed: ${typeof msg === "string" ? msg : "unknown"}`);
    } finally {
      setExecuting(false);
    }
  };

  // AUTO — uses the user's CURRENT selection (no per-stock confirmation)
  const autoExecute = async () => {
    setWarningOpen(false);
    if (selectedPicks.length === 0) {
      toast.error("Select stocks first");
      return;
    }
    setExecuting(true);
    setExecutionResult(null);
    try {
      const r = await axios.post(
        `${API}/upstox/strategy/execute`,
        {
          candidates: selectedPicks,
          capital: config.capital,
          slots: config.slots,
          product: config.product,
          target_pct: config.target_pct,
          stop_pct: config.stop_pct,
          max_holding_days: config.max_holding_days,
          place_exits: true,
        },
        { timeout: 180000 }
      );
      setExecutionResult(r.data);
      toast.success(
        `AUTO done · ${r.data.placed} placed · ${r.data.targets_set || 0}T · ${r.data.stops_set || 0}SL`
      );
      onOrdersPlaced?.();
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message;
      toast.error(`Auto failed: ${typeof msg === "string" ? msg : "unknown"}`);
    } finally {
      setExecuting(false);
    }
  };

  // Single-stock manual confirm
  const buyOne = async (c) => {
    setExecuting(true);
    try {
      const r = await axios.post(
        `${API}/upstox/strategy/execute`,
        {
          candidates: [c],
          capital: perSlot,
          slots: 1,
          product: config.product,
        },
        { timeout: 60000 }
      );
      const res = r.data.results?.[0] || {};
      if (res.status === "placed") {
        toast.success(`${c.symbol} order placed · ID ${res.order_id}`);
      } else {
        toast.error(`${c.symbol}: ${res.reason || "failed"}`);
      }
      setConfirmOneOpen(null);
      onOrdersPlaced?.();
    } catch (e) {
      toast.error(`Order failed: ${e.message}`);
    } finally {
      setExecuting(false);
    }
  };

  return (
    <div className="space-y-4" data-testid="strategy-tab">
      {/* Config Bar */}
      <div className="bg-[#0c0c0c] border border-white/10 rounded-xl p-5 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Robot size={18} weight="duotone" className="text-[#00C896]" />
          <h3 className="font-display font-bold text-lg uppercase tracking-tight">
            Apply Strategy · Daily Drop
          </h3>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <Label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-[0.18em]">
              Capital (₹)
            </Label>
            <Input
              type="number"
              step={1000}
              value={config.capital}
              onChange={(e) => update("capital", Number(e.target.value))}
              data-testid="strategy-capital-input"
              className="bg-black border-white/10 text-white font-mono mt-2"
            />
            <div className="text-[10px] font-mono text-neutral-500 mt-1">
              {inrFull(config.capital)}
            </div>
          </div>
          <div>
            <Label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-[0.18em]">
              Slots
            </Label>
            <Input
              type="number"
              min={1}
              max={20}
              value={config.slots}
              onChange={(e) => update("slots", Number(e.target.value))}
              data-testid="strategy-slots-input"
              className="bg-black border-white/10 text-white font-mono mt-2"
            />
            <div className="text-[10px] font-mono text-[#00C896] mt-1">
              {inrFull(perSlot)}/stock
            </div>
          </div>
          <div>
            <Label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-[0.18em]">
              Universe
            </Label>
            <Select value={config.universe} onValueChange={(v) => update("universe", v)}>
              <SelectTrigger
                className="bg-black border-white/10 text-white font-mono mt-2"
                data-testid="strategy-universe-trigger"
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
          <div>
            <Label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-[0.18em]">
              Product
            </Label>
            <Select value={config.product} onValueChange={(v) => update("product", v)}>
              <SelectTrigger
                className="bg-black border-white/10 text-white font-mono mt-2"
                data-testid="strategy-product-trigger"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0c0c0c] border-white/10 text-white">
                <SelectItem value="D" className="font-mono">CNC (Delivery)</SelectItem>
                <SelectItem value="I" className="font-mono">MIS (Intraday)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-[0.18em] flex justify-between">
              <span>Drop Band</span>
              <span className="font-mono text-[#00C896]">
                {config.drop_min}% – {config.drop_max}%
              </span>
            </Label>
            <div className="grid grid-cols-2 gap-2 mt-3">
              <Slider
                min={0}
                max={20}
                step={0.25}
                value={[config.drop_min]}
                onValueChange={(v) =>
                  update("drop_min", Math.min(v[0], config.drop_max - 0.25))
                }
                data-testid="strategy-drop-min-slider"
              />
              <Slider
                min={0}
                max={20}
                step={0.25}
                value={[config.drop_max]}
                onValueChange={(v) =>
                  update("drop_max", Math.max(v[0], config.drop_min + 0.25))
                }
                data-testid="strategy-drop-max-slider"
              />
            </div>
          </div>
          <div className="md:col-span-2 lg:col-span-2">
            <Label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-[0.18em] flex justify-between">
              <span>Min Market Cap</span>
              <span className="font-mono text-[#00C896]">
                {config.min_mcap_cr === 0 ? "any" : `≥ ₹${config.min_mcap_cr.toLocaleString("en-IN")} Cr`}
              </span>
            </Label>
            <div className="mt-3">
              <Slider
                min={0}
                max={50000}
                step={500}
                value={[config.min_mcap_cr]}
                onValueChange={(v) => update("min_mcap_cr", v[0])}
                data-testid="strategy-mcap-slider"
              />
            </div>
            <div className="flex gap-1.5 mt-2">
              {[
                { l: "Any", v: 0 },
                { l: "1K Cr", v: 1000 },
                { l: "5K Cr", v: 5000 },
                { l: "20K Cr", v: 20000 },
                { l: "1L Cr", v: 100000 },
              ].map((p) => (
                <button
                  key={p.l}
                  type="button"
                  onClick={() => update("min_mcap_cr", p.v)}
                  data-testid={`mcap-preset-${p.v}`}
                  className={`text-[10px] font-mono px-2 py-1 rounded border transition-colors ${
                    config.min_mcap_cr === p.v
                      ? "border-[#00C896]/60 bg-[#00C896]/10 text-[#00C896]"
                      : "border-white/10 text-neutral-400 hover:border-white/25"
                  }`}
                >
                  {p.l}
                </button>
              ))}
            </div>
          </div>
          <div className="md:col-span-2 lg:col-span-2">
            <Label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-[0.18em] flex justify-between">
              <span>Max Price / Share</span>
              <span className="font-mono text-[#00C896]">
                {config.max_price === 0 ? "any" : `≤ ₹${config.max_price.toLocaleString("en-IN")}`}
              </span>
            </Label>
            <div className="mt-3">
              <Slider
                min={0}
                max={10000}
                step={100}
                value={[config.max_price]}
                onValueChange={(v) => update("max_price", v[0])}
                data-testid="strategy-maxprice-slider"
              />
            </div>
            <div className="flex gap-1.5 mt-2 flex-wrap">
              {[
                { l: "Any", v: 0 },
                { l: "₹500", v: 500 },
                { l: "₹1K", v: 1000 },
                { l: "₹2K", v: 2000 },
                { l: "₹5K", v: 5000 },
              ].map((p) => (
                <button
                  key={p.l}
                  type="button"
                  onClick={() => update("max_price", p.v)}
                  data-testid={`maxprice-preset-${p.v}`}
                  className={`text-[10px] font-mono px-2 py-1 rounded border transition-colors ${
                    config.max_price === p.v
                      ? "border-[#00C896]/60 bg-[#00C896]/10 text-[#00C896]"
                      : "border-white/10 text-neutral-400 hover:border-white/25"
                  }`}
                >
                  {p.l}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-neutral-500 mt-1.5 leading-snug">
              Skip ultra-heavy stocks (MRF/PageInd) so capital fans across more slots.
            </p>
          </div>
        </div>

        {/* Auto-Exit settings */}
        <div className="mt-5 pt-4 border-t border-white/5">
          <div className="flex items-center gap-2 mb-3">
            <Lightning size={14} weight="duotone" className="text-[#00E676]" />
            <Label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-[0.18em]">
              Auto-Exits (placed automatically after each buy)
            </Label>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-[0.18em] flex justify-between">
                <span>Take Profit</span>
                <span className="font-mono text-[#00E676]">+{config.target_pct}%</span>
              </Label>
              <Slider
                min={0.5}
                max={15}
                step={0.25}
                value={[config.target_pct]}
                onValueChange={(v) => update("target_pct", v[0])}
                data-testid="strategy-target-slider"
                className="mt-3"
              />
            </div>
            <div>
              <Label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-[0.18em] flex justify-between">
                <span>Stop Loss</span>
                <span className="font-mono text-[#FF3B30]">−{config.stop_pct}%</span>
              </Label>
              <Slider
                min={0.5}
                max={15}
                step={0.25}
                value={[config.stop_pct]}
                onValueChange={(v) => update("stop_pct", v[0])}
                data-testid="strategy-stop-slider"
                className="mt-3"
              />
            </div>
            <div>
              <Label className="text-[10px] font-semibold text-neutral-400 uppercase tracking-[0.18em] flex justify-between">
                <span>Max Holding</span>
                <span className="font-mono text-[#00C896]">{config.max_holding_days}d</span>
              </Label>
              <Slider
                min={1}
                max={20}
                step={1}
                value={[config.max_holding_days]}
                onValueChange={(v) => update("max_holding_days", v[0])}
                data-testid="strategy-maxhold-slider"
                className="mt-3"
              />
            </div>
          </div>
          <p className="text-[11px] text-neutral-500 leading-relaxed mt-3">
            Every buy fires <span className="text-[#00E676]">SELL LIMIT @ +{config.target_pct}%</span> (target) and <span className="text-[#FF3B30]">SELL SL-M @ −{config.stop_pct}%</span> (stop). Time-stop: positions held ≥{config.max_holding_days} days are force-sold via the <strong className="text-[#00C896]">Manage Positions</strong> button.
          </p>
        </div>

        {/* Auto mode toggle */}
        <div className="mt-5 pt-4 border-t border-white/5 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Switch
              checked={autoMode}
              onCheckedChange={setAutoMode}
              data-testid="auto-mode-toggle"
            />
            <div>
              <div className="text-sm font-display font-bold flex items-center gap-2">
                Auto-Execute
                {autoMode && (
                  <Badge className="bg-[#FF3B30]/15 border-[#FF3B30]/40 text-[#FF3B30] font-mono text-[10px] uppercase">
                    ⚠ ARMED
                  </Badge>
                )}
              </div>
              <div className="text-[11px] text-neutral-500">
                Skip per-stock review · fire all {config.slots} orders at once
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              onClick={runScan}
              disabled={scanning || executing}
              variant="outline"
              data-testid="scan-button"
              className="bg-transparent border-white/15 text-white hover:bg-white/5 hover:text-white"
            >
              {scanning ? (
                <ArrowsClockwise size={16} weight="bold" className="mr-2 animate-spin" />
              ) : (
                <MagnifyingGlass size={16} weight="bold" className="mr-2" />
              )}
              Scan Now
            </Button>

            {autoMode ? (
              <Button
                onClick={() => setWarningOpen(true)}
                disabled={scanning || executing || selectedPicks.length === 0}
                data-testid="auto-execute-button"
                className="bg-[#FF3B30] hover:bg-[#E03028] text-white font-bold tracking-wide"
              >
                <Robot size={16} weight="fill" className="mr-2" />
                Auto-Execute Selected ({selectedPicks.length})
              </Button>
            ) : (
              <Button
                onClick={executeAll}
                disabled={!scanResult || executing || selectedPicks.length === 0}
                data-testid="execute-button"
                className="bg-[#00C896] hover:bg-[#00A882] text-black font-bold tracking-wide"
              >
                {executing ? (
                  <ArrowsClockwise size={16} weight="bold" className="mr-2 animate-spin" />
                ) : (
                  <Lightning size={16} weight="fill" className="mr-2" />
                )}
                Execute Selected ({selectedPicks.length})
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Scan Results / Candidates */}
      {scanResult && (
        <div
          className="bg-[#0c0c0c] border border-white/10 rounded-xl overflow-hidden"
          data-testid="scan-results-card"
        >
          <div className="p-5 md:p-6 border-b border-white/5 flex justify-between items-center flex-wrap gap-3">
            <div>
              <h3 className="font-display font-bold text-lg uppercase tracking-tight">
                Today's Candidates
              </h3>
              <p className="text-xs text-neutral-500 font-mono mt-1">
                {scanResult.count} stocks · scanned {new Date(scanResult.scanned_at).toLocaleTimeString()} · pick up to {config.slots} to execute
              </p>
            </div>
            {scanResult.candidates.length > 0 && (
              <div className="flex items-center gap-3 flex-wrap">
                <Badge
                  variant="outline"
                  className="border-[#00C896]/40 text-[#00C896] bg-[#00C896]/5 font-mono"
                  data-testid="selection-summary"
                >
                  {selectedPicks.length}/{config.slots} selected · {inrFull(totalSelectedCost)}
                </Badge>
                <button
                  type="button"
                  onClick={selectTopN}
                  data-testid="select-top-n"
                  className="text-[11px] font-mono text-neutral-400 hover:text-[#00C896] underline-offset-4 hover:underline"
                >
                  Pick top {config.slots} by drop
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  data-testid="select-clear"
                  className="text-[11px] font-mono text-neutral-400 hover:text-[#FF3B30] underline-offset-4 hover:underline"
                >
                  Clear
                </button>
              </div>
            )}
          </div>
          {scanResult.candidates.length === 0 ? (
            <div className="p-12 text-center text-neutral-500 font-mono text-sm">
              No stocks dipped {config.drop_min}–{config.drop_max}% today.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-mono">
                <thead>
                  <tr className="border-b border-white/10 bg-white/[0.02]">
                    <Th>Pick</Th>
                    <Th>#</Th>
                    <Th>Stock</Th>
                    <Th right>MCap</Th>
                    <Th right>Prev</Th>
                    <Th right>LTP</Th>
                    <Th right>1d Drop</Th>
                    <Th right>5d Δ</Th>
                    <Th right>Qty</Th>
                    <Th right>Cost</Th>
                    <Th right>Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {scanResult.candidates.map((c, i) => {
                    const isSel = selected.has(c.symbol);
                    const qty = Math.floor(perSlot / c.ltp);
                    const cost = qty * c.ltp;
                    const wkDrop = c.weekly_drop_pct ?? 0;
                    return (
                      <tr
                        key={c.symbol}
                        className={`border-b border-white/5 hover:bg-white/[0.02] ${
                          isSel ? "bg-[#00C896]/[0.05]" : ""
                        }`}
                        data-testid={`candidate-row-${c.symbol}`}
                      >
                        <Td>
                          <Checkbox
                            checked={isSel}
                            onCheckedChange={() => toggleSelect(c.symbol)}
                            disabled={executing || (qty <= 0)}
                            data-testid={`select-${c.symbol}`}
                            className="border-white/30 data-[state=checked]:bg-[#00C896] data-[state=checked]:border-[#00C896] data-[state=checked]:text-black"
                          />
                        </Td>
                        <Td>
                          <span className={`font-bold ${isSel ? "text-[#00C896]" : "text-neutral-500"}`}>
                            {i + 1}
                          </span>
                        </Td>
                        <Td>
                          <div className="flex flex-col">
                            <span className="text-white font-bold">{c.symbol}</span>
                            <span className="text-[10px] text-neutral-500 truncate max-w-[180px]">
                              {c.sector} · {c.name}
                            </span>
                          </div>
                        </Td>
                        <Td right>
                          {c.market_cap_cr ? (
                            <span className={mcapTier(c.market_cap_cr).color}>
                              {fmtMcap(c.market_cap_cr)}
                            </span>
                          ) : (
                            <span className="text-neutral-600">—</span>
                          )}
                        </Td>
                        <Td right>{inrFull2(c.prev_close)}</Td>
                        <Td right>{inrFull2(c.ltp)}</Td>
                        <Td right style={{ color: "#FF3B30" }} bold>
                          −{c.drop_pct}%
                        </Td>
                        <Td right style={{ color: wkDrop > 0 ? "#FF3B30" : wkDrop < 0 ? "#00E676" : "#A3A3A3" }}>
                          {wkDrop > 0 ? "−" : wkDrop < 0 ? "+" : ""}
                          {Math.abs(wkDrop).toFixed(2)}%
                        </Td>
                        <Td right>{qty || "—"}</Td>
                        <Td right>{cost > 0 ? inrFull2(cost) : "—"}</Td>
                        <Td right>
                          {qty > 0 && (
                            <button
                              onClick={() => setConfirmOneOpen(c)}
                              data-testid={`buy-one-${c.symbol}`}
                              disabled={executing}
                              className="text-[#00E676] hover:underline text-xs font-bold"
                            >
                              Buy →
                            </button>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Execution Result */}
      {executionResult && <ExecutionResultCard result={executionResult} />}

      {/* Auto-execute warning modal */}
      <Dialog open={warningOpen} onOpenChange={setWarningOpen}>
        <DialogContent className="bg-[#0c0c0c] border-[#FF3B30]/40 text-white max-w-md" data-testid="auto-warning-dialog">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-tight flex items-center gap-2">
              <ShieldWarning size={20} weight="fill" className="text-[#FF3B30]" />
              Confirm Auto-Execution
            </DialogTitle>
            <DialogDescription className="text-neutral-400 text-xs">
              You are about to fire UP TO {config.slots} REAL market BUY orders without per-stock review.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 font-mono text-sm py-2">
            <Row k="Capital deployed" v={inrFull(config.capital)} c="#00C896" />
            <Row k="Slots" v={config.slots} />
            <Row k="Per stock" v={inrFull(perSlot)} />
            <Row k="Universe" v={config.universe.toUpperCase()} />
            <Row k="Drop band" v={`${config.drop_min}–${config.drop_max}%`} />
            <Row k="Product" v={config.product === "D" ? "CNC Delivery" : "MIS Intraday"} />
          </div>
          <div className="bg-[#FF3B30]/10 border border-[#FF3B30]/30 rounded-lg p-3 text-[11px] text-neutral-200">
            <Warning size={14} weight="fill" className="text-[#FF3B30] inline mr-1" />
            Orders are MARKET orders — they fill at whatever price is available right now. No price control.
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setWarningOpen(false)}
              data-testid="auto-cancel-button"
              className="bg-transparent border-white/15 text-white hover:bg-white/5 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={autoExecute}
              data-testid="auto-confirm-button"
              disabled={selectedPicks.length === 0}
              className="bg-[#FF3B30] hover:bg-[#E03028] text-white font-bold"
            >
              <Robot size={16} weight="fill" className="mr-2" />
              FIRE {selectedPicks.length} ORDERS
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Single-stock confirm */}
      <Dialog open={!!confirmOneOpen} onOpenChange={(o) => !o && setConfirmOneOpen(null)}>
        <DialogContent className="bg-[#0c0c0c] border-white/10 text-white max-w-md" data-testid="buy-one-dialog">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-tight">
              Buy {confirmOneOpen?.symbol}
            </DialogTitle>
          </DialogHeader>
          {confirmOneOpen && (
            <div className="space-y-2 font-mono text-sm py-2">
              <Row k="Symbol" v={confirmOneOpen.symbol} />
              <Row k="Sector" v={confirmOneOpen.sector} />
              <Row k="LTP" v={inrFull2(confirmOneOpen.ltp)} c="#00C896" />
              <Row k="Drop today" v={`−${confirmOneOpen.drop_pct}%`} c="#FF3B30" />
              <Row k="Qty" v={Math.floor(perSlot / confirmOneOpen.ltp)} />
              <Row k="Est. cost" v={inrFull2(Math.floor(perSlot / confirmOneOpen.ltp) * confirmOneOpen.ltp)} c="#00C896" />
              <Row k="Order type" v="MARKET" />
              <Row k="Product" v={config.product === "D" ? "CNC Delivery" : "MIS Intraday"} />
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmOneOpen(null)}
              data-testid="buy-one-cancel"
              className="bg-transparent border-white/15 text-white hover:bg-white/5 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={() => buyOne(confirmOneOpen)}
              disabled={executing}
              data-testid="buy-one-confirm"
              className="bg-[#00E676] hover:bg-[#00C766] text-black font-bold"
            >
              <Lightning size={16} weight="fill" className="mr-2" />
              Confirm Buy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExecutionResultCard({ result }) {
  return (
    <div className="bg-[#0c0c0c] border border-white/10 rounded-xl p-5 md:p-6" data-testid="execution-result-card">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ListChecks size={18} weight="duotone" className="text-[#00C896]" />
          <h3 className="font-display font-bold text-lg uppercase tracking-tight">
            Execution Result
          </h3>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="text-[#00E676]">{result.placed} placed</span>
          <span className="text-neutral-500">{result.skipped} skipped</span>
          <span className="text-[#FF3B30]">{result.failed} failed</span>
          <Badge variant="outline" className="border-[#00C896]/40 text-[#00C896] bg-[#00C896]/5">
            <Coins size={12} weight="fill" className="mr-1" /> ~{inrFull(result.total_invested_estimate)}
          </Badge>
        </div>
      </div>
      <div className="space-y-2">
        {(result.results || []).map((r, i) => (
          <div
            key={i}
            data-testid={`exec-row-${r.symbol}`}
            className="bg-black/40 border border-white/5 rounded-lg p-3 flex items-center justify-between gap-3 flex-wrap"
          >
            <div className="flex items-center gap-3">
              {r.status === "placed" && (
                <CheckCircle size={20} weight="fill" className="text-[#00E676]" />
              )}
              {r.status === "skipped" && <Warning size={20} weight="fill" className="text-neutral-500" />}
              {r.status === "failed" && <XCircle size={20} weight="fill" className="text-[#FF3B30]" />}
              <div>
                <div className="font-mono font-bold text-white">{r.symbol}</div>
                <div className="text-[11px] text-neutral-500">
                  {r.status === "placed" &&
                    `Qty ${r.qty} · LTP ${inrFull2(r.ltp)} · Drop ${pct(r.drop_pct)} · Order ${r.order_id || "—"}`}
                  {r.status === "skipped" && `Skipped — ${r.reason}`}
                  {r.status === "failed" && `Failed — ${r.reason}`}
                </div>
              </div>
            </div>
            {r.status === "placed" && (
              <span className="font-mono font-bold text-[#00C896] text-sm">
                {inrFull2(r.estimated_cost)}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ k, v, c }) {
  return (
    <div className="flex justify-between border-b border-white/5 pb-1.5">
      <span className="text-neutral-500">{k}</span>
      <span className="font-bold" style={c ? { color: c } : {}}>{v}</span>
    </div>
  );
}

function Th({ children, right }) {
  return (
    <th
      className={`text-[10px] uppercase tracking-widest text-neutral-500 font-semibold py-2 px-3 ${
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
      className={`py-3 px-3 ${right ? "text-right" : "text-left"} ${
        bold ? "font-bold" : ""
      } text-neutral-300`}
      style={style}
    >
      {children}
    </td>
  );
}

function fmtMcap(cr) {
  if (!cr) return "—";
  if (cr >= 100000) return `₹${(cr / 100000).toFixed(2)}L Cr`;
  if (cr >= 1000) return `₹${(cr / 1000).toFixed(2)}K Cr`;
  return `₹${cr.toFixed(0)} Cr`;
}

function mcapTier(cr) {
  // Visual hint: large cap >= 20K Cr (purple), mid 5–20K (yellow), small 1–5K (orange), micro <1K (red)
  if (cr >= 20000) return { tier: "Large", color: "text-[#A78BFA]" };
  if (cr >= 5000) return { tier: "Mid", color: "text-[#00C896]" };
  if (cr >= 1000) return { tier: "Small", color: "text-[#FFA940]" };
  return { tier: "Micro", color: "text-[#FF3B30]" };
}
