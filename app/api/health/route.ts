import { prisma } from "@/lib/prisma";
import { availableModels, chatModels, sttModel, groq, modelParams } from "@/lib/llm";
import { systemPrompt, turnReminder, addressHint } from "@/lib/persona";
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

  const params = new URL(req.url).searchParams;
  const level = params.get("probe");
  const persona = params.get("persona") === "phanbien" ? "phanbien" : "ungho";
  const ask = params.get("q")?.slice(0, 300);
  let probe: unknown;
  if ((level === "hien" || level === "khia" || level === "gat") && (await hit("probe:all", 30)).ok) {
    const question = ask || (level === "gat" ? "thủ đô việt nam là gì vậy đm" : level === "hien" ? "dạ cho em hỏi thủ đô việt nam là gì ạ" : "thủ đô của việt nam là gì");
    const started = Date.now();
    try {
      const r = await groq.chat.completions.create({
        model: chat[0],
        max_tokens: 2_000,
        messages: [
          { role: "system", content: systemPrompt(persona, level, false, addressHint(question)) },
          { role: "system", content: turnReminder(persona, addressHint(question)) },
          { role: "user", content: question },
        ],
        ...modelParams(chat[0]),
      } as Parameters<typeof groq.chat.completions.create>[0] & { stream?: false });
      probe = { level, persona, model: chat[0], ms: Date.now() - started, answer: r.choices[0]?.message?.content };
    } catch (e) {
      probe = { level, error: (e as { status?: number })?.status, message: String(e).slice(0, 300) };
    }
  }

  return Response.json(
    { db, ai, chat, stt: await sttModel(), models, probe },
    { status: db === "ok" && ai === "ok" ? 200 : 503 },
  );
}
