import { prisma } from "@/lib/prisma";
import { groq } from "@/lib/llm";

export const dynamic = "force-dynamic";

/** Kiểm tra nhanh cơ sở dữ liệu và chìa khoá AI. Chỉ trả trạng thái, không lộ bí mật. */
export async function GET() {
  let db = "ok";
  let ai = "ok";
  try { await prisma.$queryRaw`SELECT 1`; } catch { db = "error"; }
  try { await groq.models.list(); } catch (e) { ai = `error:${(e as { status?: number })?.status ?? "network"}`; }
  return Response.json({ db, ai }, { status: db === "ok" && ai === "ok" ? 200 : 503 });
}
