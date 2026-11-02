import { auth } from "@/lib/auth";
import { prisma, withDbRetry } from "@/lib/prisma";
import { groq, CHAT_MODELS, friendlyAIError } from "@/lib/llm";
import { PLANS } from "@/lib/plans";
import { LEVELS, isLevel, systemPrompt, detectCrisis, type Level } from "@/lib/persona";
import { sse } from "@/lib/sse";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PROMPT_CHARS = 4_000;
const HISTORY_MESSAGES = 20;

/** Tin nhắn cũ từng bị mã hoá HTML khi lưu — giải mã lại trước khi đưa cho AI. */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'").replace(/&#x2F;/g, "/").replace(/&amp;/g, "&");
}

/** Mốc 0 giờ hôm nay theo giờ Việt Nam (UTC+7). */
function startOfTodayVN(): Date {
  const offset = 7 * 3600_000;
  const vn = new Date(Date.now() + offset);
  return new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - offset);
}

const json = (body: unknown, status: number) => Response.json(body, { status });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return json({ error: "Đăng nhập đã rồi hẵng chửi nhau." }, 401);

  let body: { conversationId?: string; prompt?: string; level?: string; adult?: boolean };
  try { body = await req.json(); } catch { return json({ error: "Dữ liệu gửi lên bị lỗi." }, 400); }

  const prompt = (body.prompt || "").trim();
  if (!prompt) return json({ error: "Gửi tin trống thì tao trả lời bằng niềm tin à?" }, 400);
  if (prompt.length > MAX_PROMPT_CHARS)
    return json({ error: `Viết sớ à? Tối đa ${MAX_PROMPT_CHARS} ký tự thôi.` }, 400);

  const user = await withDbRetry(() =>
    prisma.user.findUnique({ where: { email: session.user!.email! } })
  );
  if (!user) return json({ error: "Không tìm thấy tài khoản." }, 401);
  const plan = PLANS[user.plan];

  // ── Cấp độ chửi ──
  let level: Level = isLevel(body.level) ? body.level : "khia";
  if (!plan.levels.includes(level)) level = "khia";
  if (LEVELS[level].adult && body.adult !== true)
    return json({ error: "Chế độ Mất dạy cần xác nhận đủ 18 tuổi." }, 403);

  // ── Giới hạn số câu mỗi ngày ──
  let usedToday = 0;
  if (plan.messages_per_day > 0) {
    usedToday = await prisma.message.count({
      where: { role: "user", createdAt: { gte: startOfTodayVN() }, conversation: { userId: user.id } },
    });
    if (usedToday >= plan.messages_per_day)
      return json({
        error: `Hết ${plan.messages_per_day} câu miễn phí hôm nay rồi. Mai quay lại ăn chửi tiếp nhé.`,
        limit: true,
      }, 429);
  }

  // ── Cuộc trò chuyện: chỉ được mở cuộc của chính mình ──
  const conv = body.conversationId
    ? await prisma.conversation.findFirst({ where: { id: body.conversationId, userId: user.id } })
    : await prisma.conversation.create({ data: { userId: user.id, title: prompt.slice(0, 60) } });
  if (!conv) return json({ error: "Không tìm thấy cuộc trò chuyện." }, 404);

  // ── Lịch sử để AI nhớ ngữ cảnh ──
  const recent = await prisma.message.findMany({
    where: { conversationId: conv.id },
    orderBy: { createdAt: "desc" },
    take: HISTORY_MESSAGES,
    select: { role: true, content: true },
  });
  const history: { role: "user" | "assistant"; content: string }[] = [];
  let budget = plan.history_chars;
  for (const m of recent) {
    const role = m.role === "user" ? "user" : m.role === "assistant" ? "assistant" : null;
    if (!role) continue;
    const content = decodeEntities(m.content);
    if (content.length > budget) break;
    budget -= content.length;
    history.unshift({ role, content });
  }

  const crisis = detectCrisis(prompt);
  await prisma.message.create({ data: { conversationId: conv.id, role: "user", content: prompt } });

  const messages = [
    { role: "system" as const, content: systemPrompt(level, crisis) },
    ...history,
    { role: "user" as const, content: prompt },
  ];

  const { stream, send, close } = sse();

  (async () => {
    let answer = "";
    let lastError: unknown;
    try {
      for (const model of CHAT_MODELS) {
        try {
          const completion = await groq.chat.completions.create({
            model,
            stream: true,
            temperature: crisis ? 0.5 : LEVELS[level].temperature,
            max_tokens: 1_500,
            messages,
          });
          for await (const chunk of completion) {
            const token = chunk.choices?.[0]?.delta?.content || "";
            if (token) { answer += token; send({ type: "token", token }); }
          }
          lastError = undefined;
          break;
        } catch (e) {
          lastError = e;
          console.error(`[chat] model ${model} failed:`, (e as { status?: number })?.status, String(e));
          if (answer) break; // đã stream được một phần thì không đổi model giữa chừng
        }
      }

      if (!answer) throw lastError ?? new Error("Empty answer");

      await prisma.message.create({ data: { conversationId: conv.id, role: "assistant", content: answer } });
      await prisma.conversation.update({ where: { id: conv.id }, data: { updatedAt: new Date() } });

      const remaining = plan.messages_per_day > 0 ? Math.max(0, plan.messages_per_day - usedToday - 1) : -1;
      send({ type: "done", conversationId: conv.id, remaining, crisis });
    } catch (e) {
      send({ type: "error", message: friendlyAIError(e), conversationId: conv.id });
    } finally {
      close();
    }
  })();

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
