import type { Level } from "@/lib/persona";

export const PLANS = {
  FREE: {
    name: "VNAI Free",
    price_vnd: 0,
    messages_per_day: 30,
    history_chars: 12_000,
    // Giai đoạn kéo người dùng: mở cả 3 cấp độ. Khi có cổng thanh toán,
    // chuyển "gat" sang chỉ dành cho PRO bằng cách bỏ nó khỏi danh sách này.
    levels: ["hien", "khia", "gat"] as Level[],
  },
  PRO: {
    name: "VNAI Pro",
    price_vnd: 49_000,
    messages_per_day: -1, // không giới hạn
    history_chars: 40_000,
    levels: ["hien", "khia", "gat"] as Level[],
  },
} as const;

export type PlanKey = keyof typeof PLANS;
