import { createHash } from "crypto";
import { prisma, withDbRetry } from "@/lib/prisma";

/**
 * Đếm lượt dùng theo ngày (giờ Việt Nam) trong bảng nhỏ "UsageCounter".
 * Không cần đăng nhập: mỗi máy được nhận diện bằng mã băm của địa chỉ IP
 * (không lưu IP gốc). Bảng tự tạo ở lần gọi đầu.
 */

let ready: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  if (!ready) {
    ready = withDbRetry(() => prisma.$executeRawUnsafe(
      `CREATE TABLE IF NOT EXISTS "UsageCounter" (
         "key"   TEXT    NOT NULL,
         "day"   DATE    NOT NULL,
         "count" INTEGER NOT NULL DEFAULT 0,
         PRIMARY KEY ("key", "day")
       )`
    )).then(() => undefined).catch(e => { ready = null; throw e; });
  }
  return ready;
}

/** Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD. */
function todayVN(): string {
  return new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
}

/** Mã ẩn danh của người gửi, suy ra từ IP + muối bí mật (không đảo ngược được). */
export function clientId(req: Request): string {
  const ip =
    req.headers.get("x-vercel-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";
  const salt = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "vnai";
  return createHash("sha256").update(`${ip}:${salt}`).digest("hex").slice(0, 32);
}

export type Hit = { ok: boolean; used: number; remaining: number };

/** Tăng bộ đếm rồi so với giới hạn. Lỗi DB thì cho qua (không làm sập dịch vụ vì bộ đếm). */
export async function hit(key: string, limit: number): Promise<Hit> {
  try {
    await ensureTable();
    const day = todayVN();
    const rows = await prisma.$queryRaw<{ count: number }[]>`
      INSERT INTO "UsageCounter" ("key", "day", "count") VALUES (${key}, ${day}::date, 1)
      ON CONFLICT ("key", "day") DO UPDATE SET "count" = "UsageCounter"."count" + 1
      RETURNING "count"`;
    const used = Number(rows[0]?.count ?? 1);

    // Thỉnh thoảng dọn số liệu cũ hơn 30 ngày.
    if (Math.random() < 0.01) {
      prisma.$executeRaw`DELETE FROM "UsageCounter" WHERE "day" < (${day}::date - 30)`.catch(() => {});
    }
    return { ok: used <= limit, used, remaining: Math.max(0, limit - used) };
  } catch (e) {
    console.error("[ratelimit] counter unavailable:", String(e));
    return { ok: true, used: 0, remaining: limit };
  }
}

const num = (v: string | undefined, d: number) => (v && Number(v) > 0 ? Number(v) : d);

export const LIMITS = {
  chatPerClient: num(process.env.LIMIT_CHAT_PER_DAY, 40),
  chatGlobal: num(process.env.LIMIT_CHAT_GLOBAL_PER_DAY, 5_000),
  sttPerClient: num(process.env.LIMIT_STT_PER_DAY, 60),
};
