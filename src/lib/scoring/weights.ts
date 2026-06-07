// Shared score weight constants — used by settings API and score route
export const DEFAULT_WEIGHTS = {
  relationship:   20,
  csat:           15,
  risk:           15,
  contractHealth: 15,
  resourceHealth: 10,
  projectHealth:  10,
  financial:      10,
  whitespace:      5,
} as const;

export type WeightKey = keyof typeof DEFAULT_WEIGHTS;
export const WEIGHT_KEYS = Object.keys(DEFAULT_WEIGHTS) as WeightKey[];
