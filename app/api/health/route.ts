import { prisma } from "@/lib/prisma";
import { availableModels, chatModels, sttModel } from "@/lib/llm";

export const dynamic = "force-dynamic";

/** Kiểm tra nhanh cơ sở dữ liệu và AI. Chỉ trả trạng thái + tên model, không lộ bí mật. */
export async function GET() {
  let db = "ok";
  let ai = "ok";
  let models: string[] = [];
  try { await prisma.$queryRaw`SELECT 1`; } catch { db = "error"; }
  try { models = await availableModels(true); } catch (e) { ai = `error:${(e as { status?: number })?.status ?? "network"}`; }
  return Response.json(
    { db, ai, chat: await chatModels(), stt: await sttModel(), models },
    { status: db === "ok" && ai === "ok" ? 200 : 503 },
  );
}
