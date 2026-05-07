import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Plug,
  PlugsConnected,
  ArrowsClockwise,
  ChartLineUp,
  Wallet,
  Briefcase,
  Receipt,
  ShieldWarning,
  ArrowRight,
  CheckCircle,
  XCircle,
  Lightning,
} from "@phosphor-icons/react";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import StrategyTab from "@/components/StrategyTab";
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

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function LiveTrading() {
  const [status, setStatus] = useState({ connected: false, profile: null });
  const [loading, setLoading] = useState(false);
  const [funds, setFunds] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [positions, setPositions] = useState([]);
  const [orders, setOrders] = useState([]);
  const [params] = useSearchParams();
  const navigate = useNavigate();

  // OAuth callback handling
  useEffect(() => {
    const u = params.get("upstox");
    if (u === "ok") {
      toast.success("Upstox connected successfully");
      navigate("/live", { replace: true });
    } else if (u === "error") {
      toast.error(`Upstox connection failed: ${params.get("detail") || ""}`);
      navigate("/live", { replace: true });
    }
  }, [params, navigate]);

  const refreshStatus = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/upstox/status`);
      setStatus(r.data);
      return r.data;
    } catch (e) {
      console.error(e);
    }
  }, []);

  const refreshAll = useCallback(async () => {
    if (!status.connected) return;
    setLoading(true);
    try {
      const [f, h, p, o] = await Promise.allSettled([
        axios.get(`${API}/upstox/funds`),
        axios.get(`${API}/upstox/holdings`),
        axios.get(`${API}/upstox/positions`),
        axios.get(`${API}/upstox/orders`),
      ]);
      if (f.status === "fulfilled") setFunds(f.value.data?.data || null);
      if (h.status === "fulfilled") setHoldings(h.value.data?.data || []);
      if (p.status === "fulfilled") setPositions(p.value.data?.data || []);
      if (o.status === "fulfilled") setOrders(o.value.data?.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [status.connected]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  useEffect(() => {
    if (status.connected) refreshAll();
  }, [status.connected, refreshAll]);

  const connect = async () => {
    try {
      const r = await axios.get(`${API}/upstox/auth/url`);
      window.location.href = r.data.authorization_url;
    } catch (e) {
      toast.error("Failed to start Upstox auth");
    }
  };

  const disconnect = async () => {
    await axios.post(`${API}/upstox/disconnect`);
    setStatus({ connected: false, profile: null });
    setFunds(null);
    setHoldings([]);
    setPositions([]);
    setOrders([]);
    toast("Upstox disconnected");
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white bg-grid bg-noise">
      {/* Header */}
      <header className="border-b border-white/5 sticky top-0 z-30 backdrop-blur-md bg-[#050505]/80">
        <div className="max-w-[1600px] mx-auto px-6 md:px-8 py-5 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#E2FF00] flex items-center justify-center text-black">
              <ChartLineUp size={22} weight="bold" />
            </div>
            <div>
              <h1 className="font-display text-xl md:text-2xl font-bold tracking-tight leading-none">
                NSE SWING <span className="text-[#E2FF00]">SIM</span>
              </h1>
              <p className="text-[11px] text-neutral-500 uppercase tracking-[0.2em] mt-1">
                Live Trading · Upstox API v2
              </p>
            </div>
          </Link>
          <nav className="flex items-center gap-2">
            <Link to="/">
              <Button
                variant="outline"
                className="bg-transparent border-white/15 text-white hover:bg-white/5 hover:text-white"
                data-testid="nav-back-to-sim"
              >
                ← Simulator
              </Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto p-4 md:p-8 space-y-6">
        {/* Connection bar */}
        <div
          className="bg-[#0c0c0c] border border-white/10 rounded-xl p-5 md:p-6 flex items-center justify-between flex-wrap gap-4"
          data-testid="upstox-connection-card"
        >
          <div className="flex items-center gap-4">
            <div
              className={`h-12 w-12 rounded-lg flex items-center justify-center ${
                status.connected ? "bg-[#00E676]/10 text-[#00E676]" : "bg-white/5 text-neutral-500"
              }`}
            >
              {status.connected ? (
                <PlugsConnected size={24} weight="duotone" />
              ) : (
                <Plug size={24} weight="duotone" />
              )}
            </div>
            <div>
              <div className="font-display font-bold text-lg uppercase tracking-tight" data-testid="upstox-status-text">
                {status.connected ? "Connected" : "Not Connected"}
              </div>
              {status.connected && status.profile ? (
                <div className="text-xs text-neutral-400 font-mono mt-1">
                  {status.profile.user_name || status.profile.email || status.profile.user_id} ·
                  Token expires in 24h
                </div>
              ) : (
                <div className="text-xs text-neutral-500 font-mono mt-1">
                  Click connect to authorize trading via Upstox OAuth
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status.connected && (
              <Button
                variant="outline"
                onClick={refreshAll}
                disabled={loading}
                data-testid="upstox-refresh-button"
                className="bg-transparent border-white/15 text-white hover:bg-white/5 hover:text-white"
              >
                <ArrowsClockwise size={16} weight="bold" className={`mr-2 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            )}
            {status.connected ? (
              <Button
                variant="outline"
                onClick={disconnect}
                data-testid="upstox-disconnect-button"
                className="bg-transparent border-[#FF3B30]/40 text-[#FF3B30] hover:bg-[#FF3B30]/10 hover:text-[#FF3B30]"
              >
                Disconnect
              </Button>
            ) : (
              <Button
                onClick={connect}
                data-testid="upstox-connect-button"
                className="bg-[#E2FF00] hover:bg-[#CBE600] text-black font-bold px-6 py-5 tracking-wide"
              >
                <Plug size={18} weight="fill" className="mr-2" />
                Connect Upstox
              </Button>
            )}
          </div>
        </div>

        {/* Disclaimer / safety */}
        {status.connected && (
          <div
            className="bg-[#FF6EC7]/5 border border-[#FF6EC7]/30 rounded-xl p-4 flex items-start gap-3"
            data-testid="live-trading-warning"
          >
            <ShieldWarning size={20} weight="duotone" className="text-[#FF6EC7] flex-shrink-0 mt-0.5" />
            <div className="text-xs text-neutral-300 leading-relaxed">
              <strong className="text-[#FF6EC7] uppercase tracking-wider">Live Mode</strong> — Every order placed
              here goes to the real NSE through Upstox. Manual confirm is enforced — review carefully before clicking
              Place Order.
            </div>
          </div>
        )}

        {!status.connected ? (
          <NotConnectedHero onConnect={connect} instrumentsLoaded={status.instruments_loaded} />
        ) : (
          <Tabs defaultValue="strategy" className="space-y-4">
            <TabsList className="bg-[#0c0c0c] border border-white/10 p-1 h-auto">
              <TabsTrigger
                value="strategy"
                data-testid="live-tab-strategy"
                className="data-[state=active]:bg-[#E2FF00] data-[state=active]:text-black px-5 py-2.5 font-display font-bold tracking-wide uppercase text-sm"
              >
                Apply Strategy
              </TabsTrigger>
              <TabsTrigger
                value="trade"
                data-testid="live-tab-trade"
                className="data-[state=active]:bg-[#E2FF00] data-[state=active]:text-black px-5 py-2.5 font-display font-bold tracking-wide uppercase text-sm"
              >
                Manual Order
              </TabsTrigger>
              <TabsTrigger
                value="holdings"
                data-testid="live-tab-holdings"
                className="data-[state=active]:bg-[#E2FF00] data-[state=active]:text-black px-5 py-2.5 font-display font-bold tracking-wide uppercase text-sm"
              >
                Holdings
              </TabsTrigger>
              <TabsTrigger
                value="positions"
                data-testid="live-tab-positions"
                className="data-[state=active]:bg-[#E2FF00] data-[state=active]:text-black px-5 py-2.5 font-display font-bold tracking-wide uppercase text-sm"
              >
                Positions
              </TabsTrigger>
              <TabsTrigger
                value="orders"
                data-testid="live-tab-orders"
                className="data-[state=active]:bg-[#E2FF00] data-[state=active]:text-black px-5 py-2.5 font-display font-bold tracking-wide uppercase text-sm"
              >
                Orders
              </TabsTrigger>
            </TabsList>

            <TabsContent value="strategy" className="space-y-4">
              <StrategyTab onOrdersPlaced={refreshAll} />
            </TabsContent>

            <TabsContent value="trade" className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2">
                  <OrderForm onSuccess={refreshAll} />
                </div>
                <div className="lg:col-span-1">
                  <FundsCard funds={funds} />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="holdings">
              <HoldingsTable holdings={holdings} />
            </TabsContent>
            <TabsContent value="positions">
              <PositionsTable positions={positions} />
            </TabsContent>
            <TabsContent value="orders">
              <OrdersTable orders={orders} onCancel={refreshAll} />
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
}

function NotConnectedHero({ onConnect, instrumentsLoaded }) {
  return (
    <div
      className="bg-[#0c0c0c] border border-white/10 rounded-2xl p-8 md:p-14 relative overflow-hidden"
      data-testid="not-connected-hero"
    >
      <div className="absolute -right-32 -top-32 h-72 w-72 rounded-full bg-[#E2FF00]/5 blur-3xl" />
      <div className="relative z-10 max-w-2xl">
        <h2 className="font-display text-3xl md:text-5xl font-black tracking-tight leading-[1.05]">
          Connect Upstox to <span className="text-[#E2FF00]">go live</span>.
        </h2>
        <p className="mt-5 text-neutral-400 max-w-xl leading-relaxed">
          Authorize via OAuth, place delivery orders on NSE with manual confirmation, view holdings + positions
          + funds. {instrumentsLoaded > 0 && `${instrumentsLoaded.toLocaleString()} NSE equity instruments cached.`}
        </p>
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-3">
          <Step icon={Plug} title="OAuth" desc="Upstox secure consent flow" />
          <Step icon={Lightning} title="Manual Confirm" desc="Every order needs your click" />
          <Step icon={Briefcase} title="Real Holdings" desc="Live funds, holdings, positions" />
        </div>
        <Button
          onClick={onConnect}
          data-testid="hero-connect-button"
          className="mt-8 bg-[#E2FF00] hover:bg-[#CBE600] text-black font-bold py-6 px-8 tracking-wide"
        >
          <Plug size={20} weight="fill" className="mr-2" />
          Connect Upstox now
          <ArrowRight size={20} weight="bold" className="ml-2" />
        </Button>
      </div>
    </div>
  );
}

function Step({ icon: Icon, title, desc }) {
  return (
    <div className="bg-black/40 border border-white/10 rounded-xl p-4">
      <Icon size={18} weight="duotone" className="text-[#E2FF00]" />
      <div className="font-display font-bold text-base mt-2">{title}</div>
      <div className="text-[12px] text-neutral-500 mt-1">{desc}</div>
    </div>
  );
}

function OrderForm({ onSuccess }) {
  const [form, setForm] = useState({
    symbol: "RELIANCE",
    quantity: 1,
    transaction_type: "BUY",
    order_type: "MARKET",
    product: "D",
    price: 0,
    validity: "DAY",
  });
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [instLookup, setInstLookup] = useState(null);
  const [ltp, setLtp] = useState(null);

  const update = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const lookupSymbol = async () => {
    try {
      const r = await axios.get(`${API}/upstox/instruments/${form.symbol.toUpperCase()}`);
      setInstLookup(r.data);
      // also fetch LTP
      const q = await axios.post(`${API}/upstox/quote`, { symbols: [form.symbol.toUpperCase()] });
      const data = q.data?.data || {};
      const firstKey = Object.keys(data)[0];
      setLtp(firstKey ? data[firstKey]?.last_price : null);
    } catch {
      setInstLookup(null);
      setLtp(null);
    }
  };

  useEffect(() => {
    if (form.symbol) lookupSymbol();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.symbol]);

  const submit = (e) => {
    e?.preventDefault?.();
    if (!instLookup) {
      toast.error("Symbol not found in Upstox instruments");
      return;
    }
    setConfirming(true);
  };

  const confirmPlace = async () => {
    setSubmitting(true);
    try {
      const r = await axios.post(`${API}/upstox/orders/place`, {
        ...form,
        symbol: form.symbol.toUpperCase(),
        quantity: parseInt(form.quantity),
        price: parseFloat(form.price) || 0,
      });
      const orderId = r.data?.data?.order_id || "—";
      toast.success(`Order placed · ID: ${orderId}`);
      setConfirming(false);
      onSuccess?.();
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message;
      toast.error(`Order failed: ${typeof msg === "string" ? msg : "unknown"}`);
    } finally {
      setSubmitting(false);
    }
  };

  const estCost =
    form.order_type === "LIMIT"
      ? parseFloat(form.price || 0) * parseInt(form.quantity || 0)
      : (ltp || 0) * parseInt(form.quantity || 0);

  return (
    <>
      <div className="bg-[#0c0c0c] border border-white/10 rounded-xl p-5 md:p-6" data-testid="order-form-card">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display font-bold text-lg uppercase tracking-tight">Place Order</h3>
          <Badge variant="outline" className="border-[#E2FF00]/40 text-[#E2FF00] bg-[#E2FF00]/5 font-mono">
            Manual Confirm
          </Badge>
        </div>

        <form onSubmit={submit} className="space-y-4">
          {/* Symbol */}
          <div>
            <Label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-[0.18em]">
              Symbol (NSE)
            </Label>
            <Input
              value={form.symbol}
              onChange={(e) => update("symbol", e.target.value.toUpperCase())}
              data-testid="order-symbol-input"
              placeholder="RELIANCE"
              className="bg-black border-white/10 text-white font-mono text-base mt-2 uppercase"
            />
            <div className="text-[11px] font-mono text-neutral-500 mt-1.5 flex items-center gap-2">
              {instLookup ? (
                <>
                  <CheckCircle size={12} weight="fill" className="text-[#00E676]" />
                  <span>{instLookup.name}</span>
                  <span>·</span>
                  <span className="text-neutral-600">{instLookup.instrument_key}</span>
                  {ltp && (
                    <>
                      <span>·</span>
                      <span className="text-[#E2FF00]">LTP {inrFull2(ltp)}</span>
                    </>
                  )}
                </>
              ) : (
                <>
                  <XCircle size={12} weight="fill" className="text-[#FF3B30]" />
                  <span>Symbol not found in Upstox NSE instruments</span>
                </>
              )}
            </div>
          </div>

          {/* Side toggle */}
          <div className="grid grid-cols-2 gap-2">
            {["BUY", "SELL"].map((side) => (
              <button
                key={side}
                type="button"
                onClick={() => update("transaction_type", side)}
                data-testid={`order-side-${side.toLowerCase()}`}
                className={`py-3 rounded-lg font-display font-bold tracking-wide uppercase border transition-all ${
                  form.transaction_type === side
                    ? side === "BUY"
                      ? "bg-[#00E676]/15 border-[#00E676] text-[#00E676]"
                      : "bg-[#FF3B30]/15 border-[#FF3B30] text-[#FF3B30]"
                    : "bg-black border-white/10 text-neutral-400 hover:border-white/25"
                }`}
              >
                {side}
              </button>
            ))}
          </div>

          {/* Order type + Product */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-[0.18em]">
                Order Type
              </Label>
              <Select value={form.order_type} onValueChange={(v) => update("order_type", v)}>
                <SelectTrigger
                  className="bg-black border-white/10 text-white font-mono mt-2"
                  data-testid="order-type-trigger"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0c0c0c] border-white/10 text-white">
                  <SelectItem value="MARKET" className="font-mono">Market</SelectItem>
                  <SelectItem value="LIMIT" className="font-mono">Limit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-[0.18em]">
                Product
              </Label>
              <Select value={form.product} onValueChange={(v) => update("product", v)}>
                <SelectTrigger
                  className="bg-black border-white/10 text-white font-mono mt-2"
                  data-testid="order-product-trigger"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[#0c0c0c] border-white/10 text-white">
                  <SelectItem value="D" className="font-mono">CNC (Delivery)</SelectItem>
                  <SelectItem value="I" className="font-mono">MIS (Intraday)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Qty + Price */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-[0.18em]">
                Quantity
              </Label>
              <Input
                type="number"
                min={1}
                value={form.quantity}
                onChange={(e) => update("quantity", e.target.value)}
                data-testid="order-quantity-input"
                className="bg-black border-white/10 text-white font-mono mt-2"
              />
            </div>
            {form.order_type === "LIMIT" && (
              <div>
                <Label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-[0.18em]">
                  Limit Price (₹)
                </Label>
                <Input
                  type="number"
                  step="0.05"
                  value={form.price}
                  onChange={(e) => update("price", e.target.value)}
                  data-testid="order-price-input"
                  className="bg-black border-white/10 text-white font-mono mt-2"
                />
              </div>
            )}
          </div>

          {/* Estimate */}
          {estCost > 0 && (
            <div className="bg-black/40 border border-white/5 rounded-lg p-3 flex justify-between font-mono text-sm">
              <span className="text-neutral-400">Estimated cost:</span>
              <span className="text-[#E2FF00] font-bold">{inrFull(estCost)}</span>
            </div>
          )}

          <Button
            type="submit"
            disabled={!instLookup}
            data-testid="order-review-button"
            className="w-full bg-[#E2FF00] hover:bg-[#CBE600] text-black font-bold py-6 tracking-wide"
          >
            <ArrowRight size={18} weight="bold" className="mr-2" />
            Review & Confirm Order
          </Button>
        </form>
      </div>

      {/* Confirmation modal */}
      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent className="bg-[#0c0c0c] border-white/10 text-white max-w-md" data-testid="order-confirm-dialog">
          <DialogHeader>
            <DialogTitle className="font-display uppercase tracking-tight">Confirm Order</DialogTitle>
            <DialogDescription className="text-neutral-400 text-xs">
              This will place a real order on NSE via Upstox. Review carefully.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 font-mono text-sm py-2">
            <Row k="Symbol" v={form.symbol.toUpperCase()} />
            <Row k="Side" v={form.transaction_type} c={form.transaction_type === "BUY" ? "#00E676" : "#FF3B30"} />
            <Row k="Quantity" v={form.quantity} />
            <Row k="Order type" v={form.order_type} />
            {form.order_type === "LIMIT" && <Row k="Price" v={`₹${form.price}`} />}
            <Row k="Product" v={form.product === "D" ? "CNC (Delivery)" : "MIS (Intraday)"} />
            <Row k="Validity" v={form.validity} />
            {ltp && <Row k="LTP" v={inrFull2(ltp)} c="#E2FF00" />}
            {estCost > 0 && <Row k="Est. cost" v={inrFull(estCost)} c="#E2FF00" />}
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirming(false)}
              disabled={submitting}
              data-testid="order-cancel-button"
              className="bg-transparent border-white/15 text-white hover:bg-white/5 hover:text-white"
            >
              Cancel
            </Button>
            <Button
              onClick={confirmPlace}
              disabled={submitting}
              data-testid="order-confirm-place-button"
              className="bg-[#E2FF00] hover:bg-[#CBE600] text-black font-bold"
            >
              {submitting ? (
                <ArrowsClockwise size={16} weight="bold" className="mr-2 animate-spin" />
              ) : (
                <Lightning size={16} weight="fill" className="mr-2" />
              )}
              Confirm & Place
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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

function FundsCard({ funds }) {
  const eq = funds?.equity || {};
  return (
    <div className="bg-[#0c0c0c] border border-white/10 rounded-xl p-5 md:p-6" data-testid="funds-card">
      <div className="flex items-center gap-2 mb-4">
        <Wallet size={18} weight="duotone" className="text-[#E2FF00]" />
        <h3 className="font-display font-bold text-lg uppercase tracking-tight">Funds (Equity)</h3>
      </div>
      <div className="space-y-3 font-mono text-sm">
        <KV k="Available margin" v={inrFull(eq.available_margin ?? eq.available_balance ?? 0)} accent="#00E676" />
        <KV k="Used margin" v={inrFull(eq.used_margin ?? eq.utilised_margin ?? 0)} />
        <KV k="Payin amount" v={inrFull(eq.payin_amount ?? 0)} />
        <KV k="Notional cash" v={inrFull(eq.notional_cash ?? 0)} />
      </div>
    </div>
  );
}

function KV({ k, v, accent }) {
  return (
    <div className="flex justify-between border-b border-white/5 pb-2">
      <span className="text-neutral-500">{k}</span>
      <span className="font-bold" style={accent ? { color: accent } : {}}>{v}</span>
    </div>
  );
}

function HoldingsTable({ holdings }) {
  if (!holdings || holdings.length === 0) {
    return (
      <div className="bg-[#0c0c0c] border border-white/10 rounded-xl p-12 text-center text-neutral-500" data-testid="holdings-empty">
        <Briefcase size={32} weight="duotone" className="mx-auto text-neutral-600 mb-3" />
        No holdings in your account.
      </div>
    );
  }
  return (
    <div className="bg-[#0c0c0c] border border-white/10 rounded-xl overflow-hidden" data-testid="holdings-table">
      <table className="w-full text-sm font-mono">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.02]">
            <Th>Symbol</Th>
            <Th right>Qty</Th>
            <Th right>Avg</Th>
            <Th right>LTP</Th>
            <Th right>Day Δ</Th>
            <Th right>Total Δ</Th>
            <Th right>Value</Th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h, i) => {
            const ltp = h.last_price ?? 0;
            const avg = h.average_price ?? 0;
            const qty = h.quantity ?? 0;
            const totalChg = (ltp - avg) * qty;
            const totalChgPct = avg > 0 ? ((ltp - avg) / avg) * 100 : 0;
            const dayChg = h.day_change ?? 0;
            const dayChgPct = h.day_change_percentage ?? 0;
            const value = ltp * qty;
            return (
              <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]" data-testid={`holding-row-${h.tradingsymbol}`}>
                <Td>{h.tradingsymbol || h.trading_symbol}</Td>
                <Td right>{qty}</Td>
                <Td right>{inrFull2(avg)}</Td>
                <Td right>{inrFull2(ltp)}</Td>
                <Td right style={{ color: dayChg >= 0 ? "#00E676" : "#FF3B30" }}>
                  {pct(dayChgPct)}
                </Td>
                <Td right style={{ color: totalChg >= 0 ? "#00E676" : "#FF3B30" }} bold>
                  {totalChg >= 0 ? "+" : ""}{inrFull2(totalChg)} ({pct(totalChgPct)})
                </Td>
                <Td right>{inrFull(value)}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PositionsTable({ positions }) {
  if (!positions || positions.length === 0) {
    return (
      <div className="bg-[#0c0c0c] border border-white/10 rounded-xl p-12 text-center text-neutral-500" data-testid="positions-empty">
        No open positions.
      </div>
    );
  }
  return (
    <div className="bg-[#0c0c0c] border border-white/10 rounded-xl overflow-hidden" data-testid="positions-table">
      <table className="w-full text-sm font-mono">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.02]">
            <Th>Symbol</Th>
            <Th>Product</Th>
            <Th right>Qty</Th>
            <Th right>Avg</Th>
            <Th right>LTP</Th>
            <Th right>P&L</Th>
          </tr>
        </thead>
        <tbody>
          {positions.map((p, i) => {
            const pnl = p.pnl ?? 0;
            return (
              <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02]" data-testid={`position-row-${i}`}>
                <Td>{p.tradingsymbol || p.trading_symbol}</Td>
                <Td>{p.product}</Td>
                <Td right>{p.quantity}</Td>
                <Td right>{inrFull2(p.average_price ?? 0)}</Td>
                <Td right>{inrFull2(p.last_price ?? 0)}</Td>
                <Td right style={{ color: pnl >= 0 ? "#00E676" : "#FF3B30" }} bold>
                  {pnl >= 0 ? "+" : ""}{inrFull2(pnl)}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function OrdersTable({ orders, onCancel }) {
  const cancel = async (orderId) => {
    if (!window.confirm(`Cancel order ${orderId}?`)) return;
    try {
      await axios.delete(`${API}/upstox/orders/${orderId}`);
      toast.success(`Order ${orderId} cancelled`);
      onCancel?.();
    } catch (e) {
      toast.error("Cancel failed");
    }
  };
  if (!orders || orders.length === 0) {
    return (
      <div className="bg-[#0c0c0c] border border-white/10 rounded-xl p-12 text-center text-neutral-500" data-testid="orders-empty">
        <Receipt size={32} weight="duotone" className="mx-auto text-neutral-600 mb-3" />
        No orders today.
      </div>
    );
  }
  return (
    <div className="bg-[#0c0c0c] border border-white/10 rounded-xl overflow-hidden" data-testid="orders-table">
      <table className="w-full text-sm font-mono">
        <thead>
          <tr className="border-b border-white/10 bg-white/[0.02]">
            <Th>Time</Th>
            <Th>Symbol</Th>
            <Th>Side</Th>
            <Th right>Qty</Th>
            <Th right>Price</Th>
            <Th>Status</Th>
            <Th right>Action</Th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o, i) => {
            const status = (o.status || "").toUpperCase();
            const cancelable = ["OPEN", "PENDING", "TRIGGER PENDING"].includes(status);
            return (
              <tr key={o.order_id || i} className="border-b border-white/5" data-testid={`order-row-${o.order_id}`}>
                <Td>{o.order_timestamp || ""}</Td>
                <Td>{o.tradingsymbol || o.trading_symbol}</Td>
                <Td style={{ color: o.transaction_type === "BUY" ? "#00E676" : "#FF3B30" }}>
                  {o.transaction_type}
                </Td>
                <Td right>{o.quantity}</Td>
                <Td right>{inrFull2(o.price || o.average_price || 0)}</Td>
                <Td>
                  <Badge variant="outline" className="font-mono text-[10px] border-white/15 text-neutral-300">
                    {status}
                  </Badge>
                </Td>
                <Td right>
                  {cancelable && (
                    <button
                      onClick={() => cancel(o.order_id)}
                      data-testid={`cancel-order-${o.order_id}`}
                      className="text-[#FF3B30] hover:underline text-xs"
                    >
                      Cancel
                    </button>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({ children, right }) {
  return (
    <th className={`text-[10px] uppercase tracking-widest text-neutral-500 font-semibold py-2 px-3 ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}
function Td({ children, right, style, bold }) {
  return (
    <td className={`py-3 px-3 ${right ? "text-right" : "text-left"} ${bold ? "font-bold" : ""} text-neutral-300`} style={style}>
      {children}
    </td>
  );
}
