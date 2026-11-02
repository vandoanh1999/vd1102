import OpenAI from "openai";

// Groq tương thích API OpenAI — chỉ đổi baseURL.
export const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY || "missing",
  baseURL: "https://api.groq.com/openai/v1",
  timeout: 45_000,
  maxRetries: 1,
});

/** Model chính viết tiếng Việt tốt; model dự phòng nhanh, rẻ khi model chính quá tải. */
export const CHAT_MODELS = [
  process.env.CHAT_MODEL || "llama-3.3-70b-versatile",
  process.env.CHAT_MODEL_FALLBACK || "llama-3.1-8b-instant",
];

/** Đổi lỗi kỹ thuật thành câu dễ hiểu cho người dùng (không lộ chi tiết nhạy cảm). */
export function friendlyAIError(e: unknown): string {
  const status = (e as { status?: number })?.status;
  if (status === 401 || status === 403)
    return "Não AI đang bị khoá (chìa khoá GROQ_API_KEY sai hoặc hết hạn). Báo admin thay chìa khoá giùm.";
  if (status === 429) return "AI đang bị hỏi dồn quá, thở không kịp. Đợi vài giây rồi hỏi lại.";
  if (status && status >= 500) return "Máy chủ AI đang trục trặc. Thử lại sau ít phút.";
  return "Có lỗi khi gọi AI. Thử lại sau nhé.";
}
