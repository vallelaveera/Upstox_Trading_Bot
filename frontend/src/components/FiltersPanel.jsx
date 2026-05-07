import { Sliders, Funnel } from "@phosphor-icons/react";
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
import { inrFull } from "@/lib/format";

export default function FiltersPanel({ filters, setFilters, sectors, disabled }) {
  const update = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const toggleSector = (s) => {
    setFilters((f) => {
      const has = (f.sectors || []).includes(s);
      return {
        ...f,
        sectors: has ? f.sectors.filter((x) => x !== s) : [...(f.sectors || []), s],
      };
    });
  };

  return (
    <div
      className="bg-[#0c0c0c] border border-white/10 rounded-xl p-5 md:p-6 space-y-6"
      data-testid="filters-panel"
    >
      <div className="flex items-center gap-2 pb-2 border-b border-white/5">
        <Sliders size={18} weight="duotone" className="text-[#E2FF00]" />
        <h2 className="font-display font-bold tracking-tight text-lg uppercase">
          Strategy
        </h2>
      </div>

      {/* Capital */}
      <Field label="Capital (₹)" hint={inrFull(filters.capital)}>
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
            {[2, 4, 6, 8, 12, 16, 24].map((w) => (
              <SelectItem
                key={w}
                value={String(w)}
                data-testid={`weeks-option-${w}`}
                className="font-mono"
              >
                Last {w} weeks
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* Buy dip range */}
      <RangeField
        label="Buy on Dip"
        hintLeft={`${filters.dip_min}%`}
        hintRight={`${filters.dip_max}%`}
        valueLeft={filters.dip_min}
        valueRight={filters.dip_max}
        onLeft={(v) => update("dip_min", v)}
        onRight={(v) => update("dip_max", v)}
        disabled={disabled}
        idLeft="dip-min"
        idRight="dip-max"
      />

      {/* Recovery target */}
      <SliderField
        label="Recovery Target (Sell)"
        hint={`+${filters.recovery_target}%`}
        value={filters.recovery_target}
        min={1}
        max={30}
        step={0.5}
        onChange={(v) => update("recovery_target", v)}
        disabled={disabled}
        testid="recovery-target"
      />

      {/* Stop loss */}
      <SliderField
        label="Stop-Loss"
        hint={`-${filters.stop_loss}%`}
        value={filters.stop_loss}
        min={1}
        max={30}
        step={0.5}
        onChange={(v) => update("stop_loss", v)}
        disabled={disabled}
        testid="stop-loss"
        accent="#FF3B30"
      />

      {/* Lookback */}
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

      {/* Max positions */}
      <SliderField
        label="Max Concurrent Positions"
        hint={`${filters.max_positions}`}
        value={filters.max_positions}
        min={1}
        max={30}
        step={1}
        onChange={(v) => update("max_positions", v)}
        disabled={disabled}
        testid="max-positions"
      />

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

function SliderField({ label, hint, value, min, max, step, onChange, disabled, testid, accent }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-[0.18em]">
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

function RangeField({ label, hintLeft, hintRight, valueLeft, valueRight, onLeft, onRight, disabled, idLeft, idRight }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-[11px] font-semibold text-neutral-400 uppercase tracking-[0.18em]">
          {label}
        </Label>
        <span className="text-sm font-mono font-bold text-[#E2FF00]" data-testid="filter-dip-range-value">
          {hintLeft} – {hintRight}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-[10px] text-neutral-500 font-mono">MIN</Label>
          <Slider
            min={0}
            max={50}
            step={0.5}
            value={[valueLeft]}
            disabled={disabled}
            onValueChange={(v) => onLeft(Math.min(v[0], valueRight - 0.5))}
            data-testid={`filter-${idLeft}-slider`}
          />
        </div>
        <div>
          <Label className="text-[10px] text-neutral-500 font-mono">MAX</Label>
          <Slider
            min={0}
            max={50}
            step={0.5}
            value={[valueRight]}
            disabled={disabled}
            onValueChange={(v) => onRight(Math.max(v[0], valueLeft + 0.5))}
            data-testid={`filter-${idRight}-slider`}
          />
        </div>
      </div>
    </div>
  );
}
