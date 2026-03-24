import { auth } from "@/lib/auth";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return new Response("Unauthorized", { status: 401 });

  const { imageBase64, mimeType } = await req.json();
  if (!imageBase64) return new Response("No image", { status: 400 });

  const response = await groq.chat.completions.create({
    model: "meta-llama/llama-4-scout-17b-16e-instruct",
    messages: [{
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: { url: `data:${mimeType || "image/jpeg"};base64,${imageBase64}` }
        },
        {
          type: "text",
          text: `Bạn là chuyên gia OCR tài liệu tiếng Việt. Hãy trích xuất TOÀN BỘ nội dung từ ảnh tài liệu này.
Trả về JSON với cấu trúc sau, KHÔNG thêm bất kỳ text nào khác ngoài JSON:
{
  "title": "tiêu đề tài liệu",
  "subtitle": "tiêu đề phụ nếu có",
  "company": "tên công ty",
  "metadata": [{"label": "tên trường", "value": "giá trị"}],
  "table": {
    "headers": ["cột 1", "cột 2", ...],
    "rows": [["giá trị 1", "giá trị 2", ...]]
  },
  "summary": [{"label": "tên", "value": "giá trị"}],
  "footer_company": "công ty cuối trang",
  "signatures": [{"role": "vai trò", "name": "tên nếu có"}],
  "ref": "mã tham chiếu nếu có"
}`
        }
      ]
    }],
    max_tokens: 2000,
  });

  const text = response.choices[0].message.content || "";
  const clean = text.replace(/```json|```/g, "").trim();
  
  try {
    const data = JSON.parse(clean);
    return Response.json({ success: true, data });
  } catch {
    return Response.json({ success: false, raw: clean });
  }
}
