import { prisma } from "@/lib/prisma";
import { availableModels, chatModels, sttModel, groq, modelParams } from "@/lib/llm";
import { systemPrompt } from "@/lib/persona";
import { hit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Kiểm tra nhanh cơ sở dữ liệu và AI. Chỉ trả trạng thái + tên model, không lộ bí mật.
 * ?probe=khia|gat|hien : chat thử một câu mẫu để xem AI trả lời thật (tối đa 30 lần/ngày toàn trang).
 */
export async function GET(req: Request) {
  let db = "ok";
  let ai = "ok";
  let models: string[] = [];
  try { await prisma.$queryRaw`SELECT 1`; } catch { db = "error"; }
  try { models = await availableModels(true); } catch (e) { ai = `error:${(e as { status?: number })?.status ?? "network"}`; }
  const chat = await chatModels();

  const level = new URL(req.url).searchParams.get("probe");
  let probe: unknown;
  if ((level === "hien" || level === "khia" || level === "gat") && (await hit("probe:all", 30)).ok) {
    const started = Date.now();
    try {
      const r = await groq.chat.completions.create({
        model: chat[0],
        max_tokens: 800,
        messages: [
          { role: "system", content: systemPrompt(level, false) },
          { role: "user", content: "thủ đô của việt nam là gì" },
        ],
        ...modelParams(chat[0]),
      } as Parameters<typeof groq.chat.completions.create>[0] & { stream?: false });
      probe = { level, model: chat[0], ms: Date.now() - started, answer: r.choices[0]?.message?.content };
    } catch (e) {
      probe = { level, error: (e as { status?: number })?.status, message: String(e).slice(0, 300) };
    }
  }

  return Response.json(
    { db, ai, chat, stt: await sttModel(), models, probe },
    { status: db === "ok" && ai === "ok" ? 200 : 503 },
  );
}
