import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { openai, MODEL_PRIMARY, MODEL_JUDGE, N_BEST } from "@/lib/openai";
import { FEATURES } from "@/lib/plans";
import { sse } from "@/lib/sse";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return new Response("Unauthorized", { status: 401 });

  const body = await req.json();
  const { conversationId, prompt } = body as { conversationId?: string; prompt: string };

  const user = await prisma.user.findUnique({ where: { email: session.user.email } });
  if (!user) return new Response("Unauthorized", { status: 401 });

  const plan = user.plan;
  const judgeEnabled = FEATURES[plan].judge;

  const conv = conversationId
    ? await prisma.conversation.findUnique({ where: { id: conversationId } })
    : await prisma.conversation.create({ data: { userId: user.id, title: prompt.slice(0, 60) } });
  if (!conv) return new Response("No conversation", { status: 400 });

  await prisma.message.create({ data: { conversationId: conv.id, role: "user", content: prompt } });

  const { stream, send, close } = sse();

  (async () => {
    try {
      const styles = [
        "Bạn là chuyên gia kỹ thuật, bullet rõ, ví dụ ngắn.",
        "Bạn là nhà khoa học dữ liệu, kiểm chứng, nêu giả định.",
        "Bạn là kiến trúc sư sản phẩm, đưa bước hành động ngay.",
      ];
      const k = judgeEnabled ? Math.min(N_BEST, styles.length) : 1;

      const calls = Array.from({ length: k }).map((_, i) =>
        openai.chat.completions.create({
          model: MODEL_PRIMARY,
          temperature: 0.7 - i * 0.2,
          messages: [
            { role: "system", content: styles[i] || styles[0] },
            { role: "user", content: prompt },
          ],
        })
      );
      const outs = await Promise.all(calls);
      const candidates = outs.map((o, i) => ({ idx: i, text: o.choices[0].message?.content?.trim() || "" }));

      let finalText = candidates[0].text;
      if (judgeEnabled && candidates.length > 1) {
        const judge = await openai.chat.completions.create({
          model: MODEL_JUDGE,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: "Bạn là Referee, trả JSON đúng schema." },
            {
              role: "user",
              content: `Chấm điểm và chọn best (0-10: accuracy, clarity, actionability, brevity). Trả JSON: {"scores":[],"best_idx":0,"synthesis":"..."}.\nPrompt: ${prompt}\n\nCandidates:\n${candidates.map(c => `#${c.idx}\n${c.text}`).join("\n\n")}`,
            },
          ],
        });
        let verdict: any = {};
        try { verdict = JSON.parse(judge.choices[0].message?.content || "{}"); } catch { /* ignore */ }
        finalText = verdict?.synthesis || candidates[verdict?.best_idx ?? 0]?.text || finalText;
        send({ type: "meta", verdict, candidates });
      }

      const refine = await openai.chat.completions.create({
        model: MODEL_JUDGE,
        stream: true,
        temperature: 0.2,
        messages: [
          { role: "system", content: "Finalizer: đúng, rõ, hành động; <= 350 từ; markdown ok." },
          { role: "user", content: finalText },
        ],
      });

      let acc = "";
      for await (const chunk of refine) {
        const delta = chunk.choices?.[0]?.delta?.content || "";
        if (delta) { acc += delta; send({ type: "token", token: delta }); }
      }

      await prisma.message.create({ data: { conversationId: conv.id, role: "assistant", content: acc } });
      send({ type: "done", conversationId: conv.id });
    } catch (e) {
      send({ type: "error", message: String(e) });
    } finally {
      close();
    }
  })();

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
