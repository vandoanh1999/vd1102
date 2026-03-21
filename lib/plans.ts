export const PLANS = {
  FREE: {
    name: "VD1102 Free",
    price_usd: 0,
    contextLimit: 8_000,
    uploads: true,
    judge: false,
    messages_per_day: 50,
  },
  PRO: {
    name: "VD1102 Pro",
    price_usd: 7,
    contextLimit: 128_000,
    uploads: true,
    judge: true,
    messages_per_day: -1, // unlimited
  },
} as const;

// Keep backward compat
export const FEATURES = PLANS;
