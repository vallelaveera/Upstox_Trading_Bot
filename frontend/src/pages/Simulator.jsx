import { useEffect, useState, useCallback } from "react";
import axios from "axios";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  Lightning,
  ArrowsClockwise,
  ChartLineUp,
  ChartBar,
  Play,
  Plug,
} from "@phosphor-icons/react";
import FiltersPanel from "@/components/FiltersPanel";
import KpiCards from "@/components/KpiCards";
import EquityChart from "@/components/EquityChart";
import TradesTable from "@/components/TradesTable";
import OpenPositions from "@/components/OpenPositions";
import EmptyState from "@/components/EmptyState";
import ComparePanel from "@/components/ComparePanel";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DEFAULT_FILTERS } from "@/lib/strategies";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Simulator() {
  const [tab, setTab] = useState("run");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [sectors, setSectors] = useState([]);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    axios
      .get(`${API}/universes`)
      .then((r) => setSectors(r.data.sectors || []))
      .catch(() => {});
  }, []);

  const runSim = useCallback(async () => {
    setRunning(true);
    try {
      const payload = { ...filters };
      if (!payload.sectors || payload.sectors.length === 0) delete payload.sectors;
      const res = await axios.post(`${API}/simulate`, payload, { timeout: 180000 });
      setResult(res.data);
      toast.success(
        `Done · ${res.data.kpis.total_trades} trades · ${res.data.kpis.win_rate}% win · ${res.data.kpis.return_pct}% return`
      );
    } catch (e) {
      console.error(e);
      const msg = e?.response?.data?.detail || e.message || "Simulation failed";
      toast.error(typeof msg === "string" ? msg : "Simulation failed");
    } finally {
      setRunning(false);
    }
  }, [filters]);

  const reset = () => {
    setFilters(DEFAULT_FILTERS);
    toast("Filters reset to defaults");
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white bg-grid bg-noise">
      {/* Header */}
      <header className="border-b border-white/5 sticky top-0 z-30 backdrop-blur-md bg-[#050505]/80">
        <div className="max-w-[1600px] mx-auto px-6 md:px-8 py-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-[#E2FF00] flex items-center justify-center text-black">
              <ChartLineUp size={22} weight="bold" />
            </div>
            <div>
              <h1
                className="font-display text-xl md:text-2xl font-bold tracking-tight leading-none"
                data-testid="app-title"
              >
                NSE SWING <span className="text-[#E2FF00]">SIM</span>
              </h1>
              <p className="text-[11px] text-neutral-500 uppercase tracking-[0.2em] mt-1">
                Buy the dip · Rotate · Backtest
              </p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-3 text-xs text-neutral-400">
            <span className="pulse-dot inline-block h-1.5 w-1.5 rounded-full bg-[#00E676]" />
            <span className="font-mono uppercase tracking-wider">Yahoo Finance · Live data</span>
            <Link to="/live" data-testid="nav-go-live">
              <Button className="bg-[#E2FF00] hover:bg-[#CBE600] text-black font-bold tracking-wide">
                <Plug size={14} weight="fill" className="mr-2" />
                Go Live
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab} className="max-w-[1600px] mx-auto p-4 md:p-8">
        <TabsList
          className="bg-[#0c0c0c] border border-white/10 mb-6 p-1 h-auto"
          data-testid="tabs-list"
        >
          <TabsTrigger
            value="run"
            data-testid="tab-run"
            className="data-[state=active]:bg-[#E2FF00] data-[state=active]:text-black px-5 py-2.5 font-display font-bold tracking-wide uppercase text-sm"
          >
            <Play size={16} weight="fill" className="mr-2" />
            Single Run
          </TabsTrigger>
          <TabsTrigger
            value="compare"
            data-testid="tab-compare"
            className="data-[state=active]:bg-[#E2FF00] data-[state=active]:text-black px-5 py-2.5 font-display font-bold tracking-wide uppercase text-sm"
          >
            <ChartBar size={16} weight="fill" className="mr-2" />
            Compare 5 Strategies
          </TabsTrigger>
        </TabsList>

        <TabsContent value="run" className="mt-0">
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 md:gap-6">
            <aside className="lg:col-span-1 space-y-4">
              <FiltersPanel
                filters={filters}
                setFilters={setFilters}
                sectors={sectors}
                disabled={running}
              />
              <div className="flex flex-col gap-2">
                <Button
                  onClick={runSim}
                  disabled={running}
                  data-testid="run-simulation-button"
                  className="w-full bg-[#E2FF00] hover:bg-[#CBE600] text-black font-bold py-6 text-base tracking-wide rounded-lg transition-all"
                >
                  {running ? (
                    <>
                      <ArrowsClockwise size={20} weight="bold" className="mr-2 animate-spin" />
                      Running backtest…
                    </>
                  ) : (
                    <>
                      <Lightning size={20} weight="fill" className="mr-2" />
                      Run Simulation
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={reset}
                  disabled={running}
                  data-testid="reset-filters-button"
                  className="w-full bg-transparent border border-white/15 text-white hover:bg-white/5 hover:text-white"
                >
                  Reset filters
                </Button>
              </div>
            </aside>

            <section className="lg:col-span-3 space-y-4 md:space-y-6">
              {!result && !running && <EmptyState />}
              {running && <LoadingPanels />}
              {result && (
                <>
                  <KpiCards
                    kpis={result.kpis}
                    simStart={result.sim_start}
                    simEnd={result.sim_end}
                  />
                  <EquityChart
                    data={result.equity_curve}
                    starting={result.kpis.starting_capital}
                  />
                  <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 md:gap-6">
                    <div className="xl:col-span-2">
                      <TradesTable trades={result.trades} />
                    </div>
                    <div className="xl:col-span-1">
                      <OpenPositions positions={result.open_positions} />
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        </TabsContent>

        <TabsContent value="compare" className="mt-0">
          <ComparePanel sectors={sectors} />
        </TabsContent>

        <footer className="mt-12 pt-6 border-t border-white/5 text-xs text-neutral-500 flex flex-wrap justify-between gap-2">
          <span data-testid="footer-disclaimer">
            For research & education only. Not investment advice. Past performance ≠ future returns.
          </span>
          <span className="font-mono">Phase 2 · Upstox live trading (coming soon)</span>
        </footer>
      </Tabs>
    </div>
  );
}

function LoadingPanels() {
  return (
    <div className="space-y-4" data-testid="loading-panels">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-28 rounded-xl border border-white/10 bg-[#0e0e0e] shimmer" />
        ))}
      </div>
      <div className="h-[360px] rounded-xl border border-white/10 bg-[#0e0e0e] shimmer" />
      <div className="h-[400px] rounded-xl border border-white/10 bg-[#0e0e0e] shimmer" />
    </div>
  );
}
