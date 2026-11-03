import { groq, CHAT_MODELS, friendlyAIError } from "@/lib/llm";
import { LEVELS, isLevel, systemPrompt, detectCrisis, type Level } from "@/lib/persona";
import { clientId, hit, LIMITS } from "@/lib/ratelimit";
import { sse } from "@/lib/sse";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PROMPT_CHARS = 4_000;
const MAX_HISTORY_MESSAGES = 20;
const MAX_HISTORY_CHARS = 12_000;

type Turn = { role: "user" | "assistant"; content: string };

const json = (body: unknown, status: number) => Response.json(body, { status });

/**
 * Lịch sử do trình duyệt gửi lên (cuộc trò chuyện lưu trên máy người dùng).
 * Chỉ nhận đúng dạng, cắt bớt từ cũ nhất cho vừa ngân sách ký tự.
 */
function cleanHistory(raw: unknown): Turn[] {
  if (!Array.isArray(raw)) return [];
  const turns: Turn[] = [];
  for (const m of raw.slice(-MAX_HISTORY_MESSAGES)) {
    const role = m?.role === "user" ? "user" : m?.role === "assistant" ? "assistant" : null;
    if (!role || typeof m?.content !== "string" || !m.content.trim()) continue;
    turns.push({ role, content: m.content.slice(0, MAX_PROMPT_CHARS) });
  }
  let budget = MAX_HISTORY_CHARS;
  const kept: Turn[] = [];
  for (let i = turns.length - 1; i >= 0; i--) {
    if (turns[i].content.length > budget) break;
    budget -= turns[i].content.length;
    kept.unshift(turns[i]);
  }
  return kept;
}

export async function POST(req: Request) {
  let body: { prompt?: string; history?: unknown; level?: string; adult?: boolean };
  try { body = await req.json(); } catch { return json({ error: "Dữ liệu gửi lên bị lỗi." }, 400); }

  const prompt = (body.prompt || "").trim();
  if (!prompt) return json({ error: "Gửi tin trống thì tao trả lời bằng niềm tin à?" }, 400);
  if (prompt.length > MAX_PROMPT_CHARS)
    return json({ error: `Viết sớ à? Tối đa ${MAX_PROMPT_CHARS} ký tự thôi.` }, 400);

  const level: Level = isLevel(body.level) ? body.level : "khia";
  if (LEVELS[level].adult && body.adult !== true)
    return json({ error: "Chế độ Mất dạy cần xác nhận đủ 18 tuổi." }, 403);

  // ── Giới hạn: mỗi máy N câu/ngày, toàn trang M câu/ngày (giữ ví tiền Groq) ──
  const mine = await hit(`chat:${clientId(req)}`, LIMITS.chatPerClient);
  if (!mine.ok)
    return json({ error: `Hết ${LIMITS.chatPerClient} câu hôm nay rồi. Mai quay lại ăn chửi tiếp nhé.`, limit: true, remaining: 0 }, 429);
  const global = await hit("chat:all", LIMITS.chatGlobal);
  if (!global.ok) return json({ error: "Hôm nay VNAI chửi nhiều quá khản cả cổ rồi. Mai quay lại nhé.", limit: true }, 429);

  const crisis = detectCrisis(prompt);
  const messages = [
    { role: "system" as const, content: systemPrompt(level, crisis) },
    ...cleanHistory(body.history),
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
      send({ type: "done", remaining: mine.remaining, crisis });
    } catch (e) {
      send({ type: "error", message: friendlyAIError(e) });
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
