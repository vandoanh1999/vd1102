import { groq, chatModels, forgetModels, friendlyAIError, modelParams, thinkFilter } from "@/lib/llm";
import {
  LEVELS, systemPrompt, turnReminder, detectCrisis, detectTone, addressHint, isPersona, isPointless, isHot, SEEN_MARK,
  type Persona, type Level,
} from "@/lib/persona";
import { parseMood, step, classifyMessage, seenProbability, moodInstruction, type MoodState, type MoodEvent } from "@/lib/mood";
import { clientId, hit, LIMITS } from "@/lib/ratelimit";
import { sse } from "@/lib/sse";
import { hardBlock, moderate, recordBlock, refusal } from "@/lib/safety";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_PROMPT_CHARS = 4_000;
const MAX_HISTORY_MESSAGES = 20;
const MAX_HISTORY_CHARS = 12_000;

type Turn = { role: "user" | "assistant"; content: string };

const json = (body: unknown, status: number) => Response.json(body, { status });

/** Thời gian hiện tại theo giờ Việt Nam — để AI trả lời đúng "hôm nay thứ mấy", "mấy giờ rồi". */
function nowVN(): string {
  const parts = new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh", weekday: "long", day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date());
  return `THỜI GIAN HIỆN TẠI (giờ Việt Nam): ${parts}.`;
}

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
    // m.content === SEEN_MARK: lượt trước NYC đã "seen", giữ nguyên để AI hiểu ngữ cảnh.
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
  let body: { prompt?: string; history?: unknown; adult?: boolean; persona?: string; mood?: unknown };
  try { body = await req.json(); } catch { return json({ error: "Dữ liệu gửi lên bị lỗi." }, 400); }

  const prompt = (body.prompt || "").trim();
  if (!prompt) return json({ error: "Gửi tin trống thì tao trả lời bằng niềm tin à?" }, 400);
  if (prompt.length > MAX_PROMPT_CHARS)
    return json({ error: `Viết sớ à? Tối đa ${MAX_PROMPT_CHARS} ký tự thôi.` }, 400);

  // VNAI xưng mày – tao và có thể văng tục → chỉ dành cho người đã xác nhận đủ 18 tuổi.
  if (body.adult !== true) return json({ error: "Cần xác nhận đủ 18 tuổi trước khi trò chuyện." }, 403);

  // ── Giới hạn: mỗi máy N câu/ngày, toàn trang M câu/ngày (giữ ví tiền Groq) ──
  // Giai đoạn thử nghiệm: không giới hạn số câu mỗi người. Chỉ giữ trần chống spam rất cao
  // theo máy (không hiện ra) và trần toàn trang để kịch bản tự động không vét sạch lượt Groq.
  const mine = await hit(`chat:${clientId(req)}`, LIMITS.chatPerClient);
  if (!mine.ok) return json({ error: "Nhắn nhanh quá, nghỉ tay chút rồi quay lại nhé.", limit: true }, 429);
  const global = await hit("chat:all", LIMITS.chatGlobal);
  if (!global.ok) return json({ error: "Hôm nay VNAI chửi nhiều quá khản cả cổ rồi. Mai quay lại nhé.", limit: true }, 429);

  const history = cleanHistory(body.history);
  const crisis = detectCrisis(prompt);
  // Không khí cuộc trò chuyện (lịch sự / bình thường / gây sự) — tự đoán, người dùng không phải chọn.
  const saidBefore = history.filter(h => h.role === "user").map(h => h.content);
  const persona: Persona = isPersona(body.persona) ? body.persona : "ungho";
  const address = addressHint(prompt, saidBefore);

  // ── Tâm trạng SDE của NYC: nguôi theo thời gian vắng mặt rồi nhảy theo tin nhắn mới ──
  let mood: MoodState | undefined;
  let event: MoodEvent | undefined;
  let seenNow = false;
  if (persona === "phanbien") {
    event = classifyMessage(prompt, saidBefore[saidBefore.length - 1], { isPointless, isHot, isCrisis: detectCrisis });
    mood = step(parseMood(body.mood), event);
    seenNow = !crisis && Math.random() < seenProbability(mood.z, event);
  }
  // Độ gắt: NYC theo độ giận; còn lại theo không khí lời người dùng.
  let level: Level = detectTone(prompt, saidBefore);
  if (mood) level = mood.z[0] >= 0.6 ? "gat" : mood.z[0] < 0.3 && level !== "gat" ? "hien" : level;

  const messages = [
    { role: "system" as const, content: systemPrompt(persona, level, crisis, address) },
    { role: "system" as const, content: nowVN() },
    ...(mood && !crisis ? [{ role: "system" as const, content: moodInstruction(mood.z) }] : []),
    // Xúc xắc đã quyết là lần này KHÔNG seen → bảo AI trả lời (cộc lốc) để cùng một câu "alo" lúc rep lúc không.
    ...(mood && !crisis && (event === "pointless" || event === "repeat")
      ? [{ role: "system" as const, content: `Lần này đừng dùng ${SEEN_MARK}: trả lời đúng 1 câu cộc lốc, lầy lội, kiểu bị làm phiền.` }]
      : []),
    ...history,
    // Lệnh nhắc ẩn sát câu hỏi để AI trả lời đúng trọng tâm, giữ đúng nhân cách.
    ...(crisis ? [] : [{ role: "system" as const, content: turnReminder(persona, address) }]),
    { role: "user" as const, content: prompt },
  ];

  const { stream, send, close } = sse();
  const sendRefusal = (text: string) => {
    send({ type: "token", token: text });
    send({ type: "done", crisis: false, tone: level, mood, blocked: true });
  };

  // ── LỚP AN TOÀN 1: lọc cứng tại chỗ (nội dung tình dục dính trẻ em) → chặn ngay ──
  const hard = hardBlock(prompt);
  if (hard.violation) {
    recordBlock(hard.category, "input");
    sendRefusal(refusal(hard.category, persona));
    close();
    return sseResponse(stream);
  }

  // ── LỚP AN TOÀN 2: mô hình kiểm duyệt chấm tin nhắn, chạy song song với AI trả lời ──
  const lastAssistant = [...history].reverse().find(h => h.role === "assistant")?.content;
  const inputCheck = moderate(
    lastAssistant ? `Ngữ cảnh (VNAI vừa nói): ${lastAssistant.slice(0, 600)}\n\nTin nhắn người dùng: ${prompt}` : prompt,
  );

  // NYC tung xúc xắc theo tâm trạng: trúng thì "Đã xem" luôn, khỏi gọi AI (trừ khi tin nhắn vi phạm).
  if (seenNow) {
    const v = await inputCheck;
    if (v?.violation) {
      recordBlock(v.category, "input");
      sendRefusal(refusal(v.category, persona));
    } else {
      send({ type: "seen" });
      send({ type: "done", crisis: false, tone: level, seen: true, mood });
    }
    close();
    return sseResponse(stream);
  }

  (async () => {
    let answer = "";
    let lastError: unknown;
    // Giữ lại vài ký tự đầu để nhận ra mã "Đã xem" trước khi gửi chữ nào ra màn hình.
    let held = "";
    let decided = false;
    let seen = false;
    // Chữ chỉ được gửi ra màn hình khi tin nhắn đã qua kiểm duyệt; trước đó xếp hàng chờ.
    let gateOpen = false;
    let queued = "";
    let blocked: Awaited<typeof inputCheck> = null;
    const genCtrl = new AbortController();
    const out = (token: string) => {
      answer += token;
      if (gateOpen) send({ type: "token", token }); else queued += token;
    };
    const gate = inputCheck.then(v => {
      if (v?.violation) { blocked = v; genCtrl.abort(); return; }
      gateOpen = true;
      if (queued) { send({ type: "token", token: queued }); queued = ""; }
    });
    const emit = (token: string) => {
      if (seen) return;
      if (!decided) {
        held += token;
        const head = held.trimStart();
        if (head && SEEN_MARK.startsWith(head)) return;        // còn có thể là mã → chờ thêm
        decided = true;
        if (head.startsWith(SEEN_MARK)) { seen = true; return; }
        token = held; held = "";
      }
      out(token);
    };
    try {
      for (const model of await chatModels()) {
        try {
          const completion = await groq.chat.completions.create({
            model,
            stream: true,
            temperature: crisis ? 0.5 : LEVELS[level].temperature,
            max_tokens: 2_000,
            messages,
            ...modelParams(model),
          } as Parameters<typeof groq.chat.completions.create>[0] & { stream: true }, { signal: genCtrl.signal });
          const clean = thinkFilter();
          for await (const chunk of completion) {
            const token = clean.push(chunk.choices?.[0]?.delta?.content || "");
            if (token) emit(token);
          }
          const tail = clean.end();
          if (tail) emit(tail);
          // Hết luồng mà phần giữ lại chưa đủ dài để quyết: đúng mã thì seen, không thì gửi ra.
          if (!decided && held.trim()) {
            decided = true;
            if (held.trim().startsWith(SEEN_MARK.slice(0, -1))) seen = true;
            else out(held);
          }
          lastError = undefined;
          break;
        } catch (e) {
          lastError = e;
          const status = (e as { status?: number })?.status;
          console.error(`[chat] model ${model} failed:`, status, String(e));
          if (status === 404) forgetModels();
          if (answer || seen || genCtrl.signal.aborted) break; // đã stream một phần / bị chặn thì dừng
        }
      }
      await gate;
      // Tin nhắn vi phạm → bỏ toàn bộ câu trả lời, gửi câu từ chối cố định.
      if (blocked) {
        const v = blocked as NonNullable<typeof blocked>;
        recordBlock(v.category, "input");
        sendRefusal(refusal(v.category, persona));
        return;
      }
      // Chỉ NYC mới được seen; khủng hoảng thì không bao giờ seen.
      if (seen && persona === "phanbien" && !crisis) {
        send({ type: "seen" });
        send({ type: "done", crisis: false, tone: level, seen: true, mood });
        return;
      }
      if (seen) throw new Error("Empty answer");
      if (!answer) throw lastError ?? new Error("Empty answer");
      // ── LỚP AN TOÀN 3: chấm cả câu trả lời; AI lỡ viết sai thì thay bằng câu từ chối ──
      const outCheck = await moderate(`Người dùng: ${prompt}\n\nVNAI trả lời: ${answer}`);
      if (outCheck?.violation) {
        recordBlock(outCheck.category, "output");
        send({ type: "replace", text: refusal(outCheck.category, persona) });
      }
      send({ type: "done", crisis, tone: level, mood, event });
    } catch (e) {
      send({ type: "error", message: friendlyAIError(e), mood });
    } finally {
      close();
    }
  })();

  return sseResponse(stream);
}

function sseResponse(stream: ReadableStream) {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
