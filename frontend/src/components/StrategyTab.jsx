import { useState } from "react";
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
    universe: "nifty200",
    drop_min: 2.0,
    drop_max: 4.0,
    product: "D",
  });
  const [scanning, setScanning] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [autoMode, setAutoMode] = useState(false);
  const [warningOpen, setWarningOpen] = useState(false);
  const [confirmOneOpen, setConfirmOneOpen] = useState(null);
  const [executionResult, setExecutionResult] = useState(null);

  const update = (k, v) => setConfig((c) => ({ ...c, [k]: v }));
  const perSlot = config.capital / Math.max(1, config.slots);

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

  // MANUAL EXECUTE — fires for the candidates currently in scanResult
  const executeAll = async () => {
    if (!scanResult?.candidates?.length) {
      toast.error("Run a scan first");
      return;
    }
    setExecuting(true);
    try {
      const picks = scanResult.candidates.slice(0, config.slots);
      const r = await axios.post(
        `${API}/upstox/strategy/execute`,
        {
          candidates: picks,
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

  // AUTO — scan + execute in one shot, NO per-stock confirmation
  const autoExecute = async () => {
    setWarningOpen(false);
    setExecuting(true);
    setExecutionResult(null);
    try {
      const r = await axios.post(
        `${API}/upstox/strategy/auto`,
        {
          capital: config.capital,
          slots: config.slots,
          universe: config.universe,
          drop_min: config.drop_min,
          drop_max: config.drop_max,
          product: config.product,
        },
        { timeout: 180000 }
      );
      setScanResult(r.data.scan);
      setExecutionResult(r.data.execution);
      toast.success(
        `AUTO done · ${r.data.execution.placed} placed · ${r.data.execution.failed} failed`
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
          <Robot size={18} weight="duotone" className="text-[#E2FF00]" />
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
            <div className="text-[10px] font-mono text-[#E2FF00] mt-1">
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
              <span className="font-mono text-[#E2FF00]">
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
                disabled={scanning || executing}
                data-testid="auto-execute-button"
                className="bg-[#FF3B30] hover:bg-[#E03028] text-white font-bold tracking-wide"
              >
                <Robot size={16} weight="fill" className="mr-2" />
                Auto-Execute Top {config.slots}
              </Button>
            ) : (
              <Button
                onClick={executeAll}
                disabled={!scanResult || executing}
                data-testid="execute-button"
                className="bg-[#E2FF00] hover:bg-[#CBE600] text-black font-bold tracking-wide"
              >
                {executing ? (
                  <ArrowsClockwise size={16} weight="bold" className="mr-2 animate-spin" />
                ) : (
                  <Lightning size={16} weight="fill" className="mr-2" />
                )}
                Execute Top {config.slots}
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
          <div className="p-5 md:p-6 border-b border-white/5 flex justify-between items-center flex-wrap gap-2">
            <div>
              <h3 className="font-display font-bold text-lg uppercase tracking-tight">
                Today's Candidates
              </h3>
              <p className="text-xs text-neutral-500 font-mono mt-1">
                {scanResult.count} stocks · scanned {new Date(scanResult.scanned_at).toLocaleTimeString()} · top {config.slots} will be bought
              </p>
            </div>
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
                    <Th>#</Th>
                    <Th>Stock</Th>
                    <Th right>Prev Close</Th>
                    <Th right>LTP</Th>
                    <Th right>Drop</Th>
                    <Th right>Qty (est)</Th>
                    <Th right>Cost (est)</Th>
                    <Th right>Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {scanResult.candidates.map((c, i) => {
                    const inSlot = i < config.slots;
                    const qty = Math.floor(perSlot / c.ltp);
                    const cost = qty * c.ltp;
                    return (
                      <tr
                        key={c.symbol}
                        className={`border-b border-white/5 hover:bg-white/[0.02] ${
                          inSlot ? "bg-[#E2FF00]/[0.03]" : "opacity-50"
                        }`}
                        data-testid={`candidate-row-${c.symbol}`}
                      >
                        <Td>
                          <span className={`font-bold ${inSlot ? "text-[#E2FF00]" : "text-neutral-500"}`}>
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
                        <Td right>{inrFull2(c.prev_close)}</Td>
                        <Td right>{inrFull2(c.ltp)}</Td>
                        <Td right style={{ color: "#FF3B30" }} bold>
                          −{c.drop_pct}%
                        </Td>
                        <Td right>{qty || "—"}</Td>
                        <Td right>{cost > 0 ? inrFull2(cost) : "—"}</Td>
                        <Td right>
                          {inSlot && qty > 0 && (
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
            <Row k="Capital deployed" v={inrFull(config.capital)} c="#E2FF00" />
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
              className="bg-[#FF3B30] hover:bg-[#E03028] text-white font-bold"
            >
              <Robot size={16} weight="fill" className="mr-2" />
              FIRE {config.slots} ORDERS
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
              <Row k="LTP" v={inrFull2(confirmOneOpen.ltp)} c="#E2FF00" />
              <Row k="Drop today" v={`−${confirmOneOpen.drop_pct}%`} c="#FF3B30" />
              <Row k="Qty" v={Math.floor(perSlot / confirmOneOpen.ltp)} />
              <Row k="Est. cost" v={inrFull2(Math.floor(perSlot / confirmOneOpen.ltp) * confirmOneOpen.ltp)} c="#E2FF00" />
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
          <ListChecks size={18} weight="duotone" className="text-[#E2FF00]" />
          <h3 className="font-display font-bold text-lg uppercase tracking-tight">
            Execution Result
          </h3>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          <span className="text-[#00E676]">{result.placed} placed</span>
          <span className="text-neutral-500">{result.skipped} skipped</span>
          <span className="text-[#FF3B30]">{result.failed} failed</span>
          <Badge variant="outline" className="border-[#E2FF00]/40 text-[#E2FF00] bg-[#E2FF00]/5">
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
              <span className="font-mono font-bold text-[#E2FF00] text-sm">
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
