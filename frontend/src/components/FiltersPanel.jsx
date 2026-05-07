import { Sliders, Funnel, Target, Stack, Clock, Crosshair, Receipt } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { inrFull, inrCompact } from "@/lib/format";
import {
  STRATEGY_TYPES,
  UNIVERSE_OPTIONS,
  ALLOC_PRESETS,
} from "@/lib/strategies";

export default function FiltersPanel({ filters, setFilters, sectors, disabled }) {
  const update = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const applyPreset = (p) => {
    setFilters((f) => ({
      ...f,
      max_positions: p.max_positions,
      max_picks_per_day: Math.min(f.max_picks_per_day || 5, p.max_positions),
    }));
  };

  const toggleSector = (s) => {
    setFilters((f) => {
      const has = (f.sectors || []).includes(s);
      return {
        ...f,
        sectors: has ? f.sectors.filter((x) => x !== s) : [...(f.sectors || []), s],
      };
    });
  };

  const perSlot = filters.capital / Math.max(1, filters.max_positions);

  const showPeakDip = filters.strategy_type === "peak_dip";
  const showDailyDrop = filters.strategy_type === "daily_drop";
  const showWeeklyDrop = filters.strategy_type === "weekly_drop";
  const showConsecutive = filters.strategy_type === "consecutive_down";

  return (
    <div
      className="bg-[#0c0c0c] border border-white/10 rounded-xl p-5 md:p-6 space-y-6"
      data-testid="filters-panel"
    >
      <div className="flex items-center gap-2 pb-2 border-b border-white/5">
        <Sliders size={18} weight="duotone" className="text-[#E2FF00]" />
        <h2 className="font-display font-bold tracking-tight text-lg uppercase">Strategy</h2>
      </div>

      {/* Universe */}
      <Field label="Universe" hint={`${UNIVERSE_OPTIONS.find((u) => u.key === filters.universe)?.size} stocks`}>
        <Select
          value={filters.universe}
          onValueChange={(v) => update("universe", v)}
          disabled={disabled}
        >
          <SelectTrigger
            data-testid="filter-universe-trigger"
            className="bg-black border-white/10 text-white font-mono"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#0c0c0c] border-white/10 text-white">
            {UNIVERSE_OPTIONS.map((u) => (
              <SelectItem
                key={u.key}
                value={u.key}
                data-testid={`universe-option-${u.key}`}
                className="font-mono"
              >
                {u.label} ({u.size})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* Strategy Type */}
      <div className="space-y-2">
        <Label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-[0.18em]">
          Trigger Type
        </Label>
        <div className="grid grid-cols-2 gap-2" data-testid="strategy-type-grid">
          {STRATEGY_TYPES.map((s) => {
            const active = filters.strategy_type === s.key;
            return (
              <button
                key={s.key}
                type="button"
                disabled={disabled}
                onClick={() => update("strategy_type", s.key)}
                data-testid={`strategy-type-${s.key}`}
                className={`text-left px-3 py-2.5 rounded-lg border transition-all ${
                  active
                    ? "bg-[#E2FF00]/10 border-[#E2FF00]/50 ring-1 ring-[#E2FF00]/30"
                    : "bg-black border-white/10 hover:border-white/25"
                }`}
              >
                <div
                  className={`text-xs font-display font-bold ${
                    active ? "text-[#E2FF00]" : "text-white"
                  }`}
                >
                  {s.label}
                </div>
                <div className="text-[10px] text-neutral-500 font-mono mt-0.5 uppercase">
                  {s.short}
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-neutral-500 leading-relaxed" data-testid="strategy-desc">
          {STRATEGY_TYPES.find((s) => s.key === filters.strategy_type)?.desc}
        </p>
      </div>

      {/* Allocation Presets */}
      <div className="space-y-2">
        <Label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-[0.18em]">
          Allocation Preset
        </Label>
        <div className="grid grid-cols-1 gap-1.5" data-testid="alloc-presets">
          {ALLOC_PRESETS.map((p) => {
            const active = filters.max_positions === p.max_positions;
            return (
              <button
                key={p.key}
                type="button"
                disabled={disabled}
                onClick={() => applyPreset(p)}
                data-testid={`preset-${p.key}`}
                className={`text-left px-3 py-2 rounded-lg border transition-all flex items-center justify-between ${
                  active
                    ? "bg-[#E2FF00]/10 border-[#E2FF00]/50"
                    : "bg-black border-white/10 hover:border-white/25"
                }`}
              >
                <div>
                  <div
                    className={`text-xs font-display font-bold ${
                      active ? "text-[#E2FF00]" : "text-white"
                    }`}
                  >
                    {p.label}
                  </div>
                  <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
                    {p.blurb}
                  </div>
                </div>
                <span className="font-mono text-xs text-neutral-400">
                  {p.max_positions}×
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex justify-between text-[11px] font-mono text-neutral-500 pt-1 border-t border-white/5">
          <span>Per-slot ≈</span>
          <span className="text-[#E2FF00]">{inrCompact(perSlot)}</span>
        </div>
      </div>

      {/* Capital */}
      <Field label="Capital" hint={inrFull(filters.capital)}>
        <Input
          type="number"
          min={10000}
          max={100000000}
          step={10000}
          value={filters.capital}
          disabled={disabled}
          onChange={(e) => update("capital", Number(e.target.value))}
          data-testid="filter-capital-input"
          className="bg-black border-white/10 text-white font-mono focus-visible:ring-[#E2FF00] focus-visible:ring-1"
        />
      </Field>

      {/* Period */}
      <Field label="Backtest Period">
        <Select
          value={String(filters.weeks)}
          onValueChange={(v) => update("weeks", Number(v))}
          disabled={disabled}
        >
          <SelectTrigger
            data-testid="filter-weeks-trigger"
            className="bg-black border-white/10 text-white font-mono"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-[#0c0c0c] border-white/10 text-white">
            {[1, 2, 4, 6, 8, 12, 16, 24].map((w) => (
              <SelectItem
                key={w}
                value={String(w)}
                data-testid={`weeks-option-${w}`}
                className="font-mono"
              >
                Last {w} {w === 1 ? "week" : "weeks"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* Conditional trigger params */}
      {showPeakDip && (
        <>
          <RangeField
            label="Buy on Dip from Peak"
            hintLeft={`${filters.dip_min}%`}
            hintRight={`${filters.dip_max}%`}
            valueLeft={filters.dip_min}
            valueRight={filters.dip_max}
            onLeft={(v) => update("dip_min", v)}
            onRight={(v) => update("dip_max", v)}
            disabled={disabled}
            idLeft="dip-min"
            idRight="dip-max"
            max={50}
          />
          <SliderField
            label="Peak Lookback (days)"
            hint={`${filters.lookback_days}d`}
            value={filters.lookback_days}
            min={5}
            max={60}
            step={1}
            onChange={(v) => update("lookback_days", v)}
            disabled={disabled}
            testid="lookback-days"
          />
        </>
      )}

      {showDailyDrop && (
        <RangeField
          label="Daily Drop Band"
          hintLeft={`-${filters.daily_drop_min}%`}
          hintRight={`-${filters.daily_drop_max}%`}
          valueLeft={filters.daily_drop_min}
          valueRight={filters.daily_drop_max}
          onLeft={(v) => update("daily_drop_min", v)}
          onRight={(v) => update("daily_drop_max", v)}
          disabled={disabled}
          idLeft="daily-drop-min"
          idRight="daily-drop-max"
          max={20}
          step={0.25}
        />
      )}

      {showWeeklyDrop && (
        <RangeField
          label="5-day Drop Band"
          hintLeft={`-${filters.weekly_drop_min}%`}
          hintRight={`-${filters.weekly_drop_max}%`}
          valueLeft={filters.weekly_drop_min}
          valueRight={filters.weekly_drop_max}
          onLeft={(v) => update("weekly_drop_min", v)}
          onRight={(v) => update("weekly_drop_max", v)}
          disabled={disabled}
          idLeft="weekly-drop-min"
          idRight="weekly-drop-max"
          max={40}
        />
      )}

      {showConsecutive && (
        <SliderField
          label="Min Red Days"
          hint={`${filters.consecutive_down_min}`}
          value={filters.consecutive_down_min}
          min={2}
          max={8}
          step={1}
          onChange={(v) => update("consecutive_down_min", v)}
          disabled={disabled}
          testid="consecutive-down-min"
        />
      )}

      {/* Exits */}
      <div className="pt-4 border-t border-white/5 space-y-5">
        <div className="flex items-center gap-2">
          <Target size={14} weight="duotone" className="text-[#00E676]" />
          <Label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-[0.18em]">
            Exits
          </Label>
        </div>

        <SliderField
          label="Recovery Target (sell)"
          hint={`+${filters.recovery_target}%`}
          value={filters.recovery_target}
          min={0.5}
          max={30}
          step={0.25}
          onChange={(v) => update("recovery_target", v)}
          disabled={disabled}
          testid="recovery-target"
          accent="#00E676"
        />

        <SliderField
          label="Stop-Loss"
          hint={`-${filters.stop_loss}%`}
          value={filters.stop_loss}
          min={0.5}
          max={30}
          step={0.25}
          onChange={(v) => update("stop_loss", v)}
          disabled={disabled}
          testid="stop-loss"
          accent="#FF3B30"
        />

        <SliderField
          label="Max Holding Days"
          hint={filters.max_holding_days === 0 ? "off" : `${filters.max_holding_days}d`}
          value={filters.max_holding_days}
          min={0}
          max={20}
          step={1}
          onChange={(v) => update("max_holding_days", v)}
          disabled={disabled}
          testid="max-holding-days"
          icon={Clock}
        />
      </div>

      {/* Sizing extras */}
      <div className="pt-4 border-t border-white/5 space-y-5">
        <div className="flex items-center gap-2">
          <Stack size={14} weight="duotone" className="text-[#E2FF00]" />
          <Label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-[0.18em]">
            Sizing
          </Label>
        </div>
        <SliderField
          label="Max Concurrent Positions"
          hint={`${filters.max_positions}`}
          value={filters.max_positions}
          min={1}
          max={50}
          step={1}
          onChange={(v) => update("max_positions", v)}
          disabled={disabled}
          testid="max-positions"
        />
        <SliderField
          label="Max Picks Per Day"
          hint={filters.max_picks_per_day === 0 ? "unlimited" : `${filters.max_picks_per_day}`}
          value={filters.max_picks_per_day}
          min={0}
          max={50}
          step={1}
          onChange={(v) => update("max_picks_per_day", v)}
          disabled={disabled}
          testid="max-picks-per-day"
          icon={Crosshair}
        />
      </div>

      {/* Sector filter */}
      <Field label="Sector Filter">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              disabled={disabled}
              data-testid="sector-filter-trigger"
              className="w-full justify-between bg-black border-white/10 text-white font-mono hover:bg-white/5 hover:text-white"
            >
              <span className="flex items-center gap-2">
                <Funnel size={14} weight="duotone" />
                {filters.sectors?.length
                  ? `${filters.sectors.length} selected`
                  : "All sectors"}
              </span>
              <span className="text-neutral-500">▾</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="bg-[#0c0c0c] border-white/10 text-white max-h-72 overflow-y-auto"
            align="start"
          >
            <DropdownMenuLabel className="text-xs text-neutral-400 uppercase">
              Filter sectors
            </DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-white/10" />
            {sectors.map((s) => (
              <DropdownMenuCheckboxItem
                key={s}
                checked={(filters.sectors || []).includes(s)}
                onCheckedChange={() => toggleSector(s)}
                data-testid={`sector-option-${s}`}
                className="font-mono text-sm"
              >
                {s}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </Field>

      {/* Transaction Costs */}
      <div className="pt-4 border-t border-white/5 space-y-5">
        <div className="flex items-center gap-2">
          <Receipt size={14} weight="duotone" className="text-[#FF6EC7]" />
          <Label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-[0.18em]">
            Transaction Costs
          </Label>
        </div>
        <div className="text-[11px] text-neutral-500 leading-relaxed -mt-3">
          Realistic NSE delivery costs · ~₹20 brokerage + 0.15% taxes/slippage per leg.
        </div>
        <SliderField
          label="Brokerage / leg (₹)"
          hint={`₹${filters.brokerage_per_leg}`}
          value={filters.brokerage_per_leg}
          min={0}
          max={100}
          step={1}
          onChange={(v) => update("brokerage_per_leg", v)}
          disabled={disabled}
          testid="brokerage-per-leg"
          accent="#FF6EC7"
        />
        <SliderField
          label="Tax + Slippage / leg"
          hint={`${filters.cost_pct_per_leg}%`}
          value={filters.cost_pct_per_leg}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => update("cost_pct_per_leg", v)}
          disabled={disabled}
          testid="cost-pct-per-leg"
          accent="#FF6EC7"
        />
        <div className="flex flex-wrap gap-2">
          {[
            { label: "Zero-broker", b: 0, p: 0.1 },
            { label: "Realistic", b: 20, p: 0.15 },
            { label: "Pessimistic", b: 30, p: 0.25 },
          ].map((preset) => (
            <button
              key={preset.label}
              type="button"
              disabled={disabled}
              onClick={() => {
                update("brokerage_per_leg", preset.b);
                update("cost_pct_per_leg", preset.p);
              }}
              data-testid={`cost-preset-${preset.label.toLowerCase().replace("-", "")}`}
              className={`text-[11px] font-mono px-3 py-1.5 rounded-full border transition-colors ${
                filters.brokerage_per_leg === preset.b && filters.cost_pct_per_leg === preset.p
                  ? "border-[#FF6EC7]/60 bg-[#FF6EC7]/10 text-[#FF6EC7]"
                  : "border-white/10 text-neutral-400 hover:border-white/25"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-[0.18em]">
          {label}
        </Label>
        {hint && <span className="text-[11px] font-mono text-neutral-500">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function SliderField({ label, hint, value, min, max, step, onChange, disabled, testid, accent, icon: Icon }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-[0.18em] flex items-center gap-1.5">
          {Icon && <Icon size={12} weight="duotone" className="text-neutral-500" />}
          {label}
        </Label>
        <span
          className="text-sm font-mono font-bold"
          style={{ color: accent || "#E2FF00" }}
          data-testid={`filter-${testid}-value`}
        >
          {hint}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        disabled={disabled}
        onValueChange={(v) => onChange(v[0])}
        data-testid={`filter-${testid}-slider`}
      />
    </div>
  );
}

function RangeField({ label, hintLeft, hintRight, valueLeft, valueRight, onLeft, onRight, disabled, idLeft, idRight, max = 50, step = 0.5 }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-[0.18em]">
          {label}
        </Label>
        <span className="text-sm font-mono font-bold text-[#E2FF00]" data-testid={`filter-${idLeft}-${idRight}-value`}>
          {hintLeft} – {hintRight}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[10px] text-neutral-500 font-mono">MIN</Label>
          <Slider
            min={0}
            max={max}
            step={step}
            value={[valueLeft]}
            disabled={disabled}
            onValueChange={(v) => onLeft(Math.min(v[0], valueRight - step))}
            data-testid={`filter-${idLeft}-slider`}
          />
        </div>
        <div>
          <Label className="text-[10px] text-neutral-500 font-mono">MAX</Label>
          <Slider
            min={0}
            max={max}
            step={step}
            value={[valueRight]}
            disabled={disabled}
            onValueChange={(v) => onRight(Math.max(v[0], valueLeft + step))}
            data-testid={`filter-${idRight}-slider`}
          />
        </div>
      </div>
    </div>
  );
}
