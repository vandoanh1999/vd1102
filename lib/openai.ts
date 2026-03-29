import OpenAI from "openai";

// Groq is OpenAI-compatible — just change baseURL + models
export const openai = new OpenAI({
  apiKey: process.env.GROQ_API_KEY!,
  baseURL: "https://api.groq.com/openai/v1",
});

export const MODEL_PRIMARY = process.env.MODEL_PRIMARY || "llama-3.1-8b-instant";
export const MODEL_JUDGE   = process.env.MODEL_JUDGE   || "llama-3.3-70b-versatile";
export const N_BEST = Number(process.env.N_BEST || 3);

export const SYSTEM_BASE = `Bạn là AI lập trình chuyên nghiệp.
- Khi được yêu cầu viết code: LUÔN viết code thật, chạy được, có comment.
- KHÔNG giải thích dài dòng khi chưa được hỏi.
- Dùng markdown code block với đúng ngôn ngữ.
- Ưu tiên code ngắn gọn, thực tế, copy-paste chạy ngay.`;
