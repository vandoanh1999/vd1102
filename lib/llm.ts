import OpenAI from "openai";

// Groq tương thích API OpenAI — chỉ đổi baseURL.
export const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY || "missing",
  baseURL: "https://api.groq.com/openai/v1",
  timeout: 45_000,
  maxRetries: 1,
});

/**
 * Thứ tự ưu tiên model chat (giỏi tiếng Việt, theo lệnh tốt trước).
 * Danh sách model mỗi tài khoản Groq dùng được có thể khác nhau và thay đổi theo thời gian,
 * nên app hỏi Groq danh sách thật rồi mới chọn — không đoán cứng.
 */
const CHAT_PREFERENCE = [
  "llama-3.3-70b-versatile",
  "openai/gpt-oss-120b",
  "moonshotai/kimi-k2-instruct-0905",
  "moonshotai/kimi-k2-instruct",
  "meta-llama/llama-4-maverick-17b-128e-instruct",
  "qwen/qwen3-32b",
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "openai/gpt-oss-20b",
  "llama-3.1-8b-instant",
];
const STT_PREFERENCE = ["whisper-large-v3-turbo", "whisper-large-v3"];

const NOT_CHAT = /whisper|tts|guard|prompt-guard|playai|orpheus|distil|compound|safeguard|allam/i;

let cache: { at: number; ids: string[] } | null = null;
const TTL = 10 * 60_000;

/** Danh sách model tài khoản dùng được (lưu tạm 10 phút). */
export async function availableModels(force = false): Promise<string[]> {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.ids;
  const res = await groq.models.list();
  const ids = res.data.filter(m => (m as { active?: boolean }).active !== false).map(m => m.id);
  cache = { at: Date.now(), ids };
  return ids;
}

/** Model chat theo thứ tự thử: ưu tiên biến môi trường, rồi danh sách ưu tiên, rồi bất kỳ model chat nào còn lại. */
export async function chatModels(): Promise<string[]> {
  let ids: string[] = [];
  try { ids = await availableModels(); } catch { /* không lấy được danh sách → dùng danh sách ưu tiên */ }
  const wanted = [process.env.CHAT_MODEL, ...CHAT_PREFERENCE].filter(Boolean) as string[];
  if (!ids.length) return wanted.slice(0, 3);
  const picked = wanted.filter(id => ids.includes(id));
  const others = ids.filter(id => !NOT_CHAT.test(id) && !picked.includes(id));
  return [...new Set([...picked, ...others])].slice(0, 3);
}

export async function sttModel(): Promise<string> {
  try {
    const ids = await availableModels();
    return [process.env.STT_MODEL, ...STT_PREFERENCE].find(id => id && ids.includes(id))
      || ids.find(id => /whisper/i.test(id)) || STT_PREFERENCE[0];
  } catch {
    return process.env.STT_MODEL || STT_PREFERENCE[0];
  }
}

/**
 * Tham số riêng theo loại model:
 *  - gpt-oss là model "suy nghĩ trước khi nói": mức nghĩ vừa — đủ khôn mà vẫn nhanh (phần nghĩ không lẫn vào câu trả lời).
 *  - qwen3 có thể chèn <think>…</think> vào câu trả lời: yêu cầu giấu đi.
 */
export function modelParams(model: string): Record<string, unknown> {
  if (model.startsWith("openai/gpt-oss")) return { reasoning_effort: "medium" }; // nghĩ kỹ hơn để trả lời khôn hơn
  if (/qwen3/i.test(model)) return { reasoning_format: "hidden" };
  return {};
}

/** Lọc phòng hờ đoạn <think>…</think> nếu model vẫn trả về trong luồng chữ. */
export function thinkFilter() {
  let inThink = false;
  let pending = "";
  /** Gọi khi luồng kết thúc: trả nốt phần chữ còn giữ lại (nếu không nằm trong <think>). */
  const end = (): string => { const rest = inThink ? "" : pending; pending = ""; return rest; };
  const push = (chunk: string): string => {
    pending += chunk;
    let out = "";
    for (;;) {
      if (inThink) {
        const end = pending.indexOf("</think>");
        if (end < 0) { pending = pending.slice(-8); return out; }
        pending = pending.slice(end + 8);
        inThink = false;
      } else {
        const start = pending.indexOf("<think>");
        if (start < 0) {
          // giữ lại đuôi có thể là đầu thẻ "<think" bị cắt giữa hai gói
          const keep = pending.lastIndexOf("<");
          if (keep >= 0 && pending.length - keep < 7) { out += pending.slice(0, keep); pending = pending.slice(keep); }
          else { out += pending; pending = ""; }
          return out;
        }
        out += pending.slice(0, start);
        pending = pending.slice(start + 7);
        inThink = true;
      }
    }
  };
  return { push, end };
}

/** Model báo 404 (bị gỡ / không có quyền) → bỏ bộ nhớ tạm để lần sau hỏi lại danh sách. */
export function forgetModels() { cache = null; }

/** Đổi lỗi kỹ thuật thành câu dễ hiểu cho người dùng (không lộ chi tiết nhạy cảm). */
export function friendlyAIError(e: unknown): string {
  const status = (e as { status?: number })?.status;
  if (status === 403 && /blocked at the project level/i.test(String(e)))
    return "Model AI đang bị chặn trong cài đặt dự án Groq. Admin vào console.groq.com → Settings → Project → Limits để bật model.";
  if (status === 401 || status === 403)
    return "Não AI đang bị khoá (chìa khoá GROQ_API_KEY sai hoặc hết hạn). Báo admin thay chìa khoá giùm.";
  if (status === 404) return "Groq vừa đổi danh sách model, VNAI đang dò lại. Gửi lại câu hỏi thử xem.";
  if (status === 429) return "AI đang bị hỏi dồn quá, thở không kịp. Đợi vài giây rồi hỏi lại.";
  if (status && status >= 500) return "Máy chủ AI đang trục trặc. Thử lại sau ít phút.";
  return "Có lỗi khi gọi AI. Thử lại sau nhé.";
}
