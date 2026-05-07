export const STRATEGY_TYPES = [
  {
    key: "daily_drop",
    label: "Daily Drop",
    short: "1-day",
    desc: "Stocks that fell X% in a single session",
  },
  {
    key: "peak_dip",
    label: "Peak Dip",
    short: "N-day",
    desc: "Fell X–Y% from N-day peak",
  },
  {
    key: "weekly_drop",
    label: "Weekly Drop",
    short: "5-day",
    desc: "Fell X–Y% over last 5 trading days",
  },
  {
    key: "consecutive_down",
    label: "Red Streak",
    short: "streak",
    desc: "N consecutive red days",
  },
];

export const UNIVERSE_OPTIONS = [
  { key: "nifty50", label: "Nifty 50", size: 50 },
  { key: "nifty100", label: "Nifty 100", size: 100 },
  { key: "nifty200", label: "Nifty 200", size: 216 },
];

// Allocation presets — they set max_positions; per-slot is derived from capital
export const ALLOC_PRESETS = [
  {
    key: "concentrated",
    label: "Concentrated",
    max_positions: 10,
    blurb: "₹50K × 10 picks · high conviction",
  },
  {
    key: "balanced",
    label: "Balanced",
    max_positions: 20,
    blurb: "₹25K × 20 picks · default",
  },
  {
    key: "diversified",
    label: "Diversified",
    max_positions: 30,
    blurb: "₹16.6K × 30 · risk-spread",
  },
  {
    key: "spray",
    label: "Spray",
    max_positions: 40,
    blurb: "₹12.5K × 40 · wide net",
  },
  {
    key: "sniper",
    label: "Sniper",
    max_positions: 5,
    blurb: "₹1L × 5 · pure conviction",
  },
];

export const DEFAULT_FILTERS = {
  capital: 500000,
  weeks: 4,
  universe: "nifty200",
  strategy_type: "daily_drop",
  // peak_dip
  dip_min: 5,
  dip_max: 15,
  lookback_days: 20,
  // daily_drop
  daily_drop_min: 2,
  daily_drop_max: 4,
  // weekly_drop
  weekly_drop_min: 5,
  weekly_drop_max: 12,
  // consecutive_down
  consecutive_down_min: 3,
  // exits
  recovery_target: 3.5,
  stop_loss: 7,
  max_holding_days: 4,
  // sizing
  max_positions: 20,
  max_picks_per_day: 5,
  sectors: [],
};
