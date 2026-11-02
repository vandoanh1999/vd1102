import { toFile } from "openai";
import { auth } from "@/lib/auth";
import { groq, friendlyAIError } from "@/lib/llm";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 8 * 1024 * 1024; // ~ vài phút ghi âm nén
const STT_MODEL = process.env.STT_MODEL || "whisper-large-v3-turbo";

/**
 * Whisper hay "bịa" câu quen thuộc khi đoạn ghi âm toàn tiếng ồn/im lặng
 * (nổi tiếng nhất là câu mời subscribe kênh YouTube). Gặp mấy câu này thì coi như không nghe được.
 */
const HALLUCINATIONS = [
  "subscribe", "ghiền mì gõ", "đăng ký kênh", "theo dõi kênh", "like và share",
  "cảm ơn các bạn đã theo dõi", "hẹn gặp lại các bạn", "không bỏ lỡ những video",
];

function looksHallucinated(text: string): boolean {
  const t = text.toLowerCase();
  return HALLUCINATIONS.some(h => t.includes(h));
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: "Đăng nhập trước đã." }, { status: 401 });

  let form: FormData;
  try { form = await req.formData(); } catch { return Response.json({ error: "Không đọc được ghi âm." }, { status: 400 }); }

  const audio = form.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0)
    return Response.json({ error: "Chưa nghe thấy gì cả." }, { status: 400 });
  if (audio.size > MAX_BYTES)
    return Response.json({ error: "Nói dài quá, chia nhỏ ra đi." }, { status: 413 });

  const name = audio instanceof File && audio.name ? audio.name : "voice.webm";

  try {
    const file = await toFile(Buffer.from(await audio.arrayBuffer()), name, { type: audio.type || "audio/webm" });
    const result = await groq.audio.transcriptions.create({
      file,
      model: STT_MODEL,
      language: "vi",
      temperature: 0,
      // Gợi ý ngữ cảnh giúp Whisper viết đúng dấu và từ lóng tiếng Việt.
      prompt: "Đây là câu hỏi tiếng Việt gửi cho trợ lý AI tên VNAI, có dấu đầy đủ.",
    });
    const text = (result.text || "").trim();
    if (!text || looksHallucinated(text)) return Response.json({ text: "", unclear: true });
    return Response.json({ text });
  } catch (e) {
    console.error("[stt] failed:", (e as { status?: number })?.status, String(e));
    return Response.json({ error: friendlyAIError(e) }, { status: 502 });
  }
}
