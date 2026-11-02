import { auth } from "@/lib/auth";
import { prisma, withDbRetry } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return new Response("Unauthorized", { status: 401 });
  const conversationId = new URL(req.url).searchParams.get("conversationId");
  if (!conversationId) return new Response("Missing conversationId", { status: 400 });

  const user = await withDbRetry(() => prisma.user.findUnique({ where: { email: session.user!.email! } }));
  if (!user) return new Response("Unauthorized", { status: 401 });

  // Chỉ trả tin nhắn khi cuộc trò chuyện thuộc về đúng người đang đăng nhập.
  const conv = await prisma.conversation.findFirst({ where: { id: conversationId, userId: user.id } });
  if (!conv) return new Response("Not found", { status: 404 });

  const msgs = await prisma.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    select: { id: true, role: true, content: true, createdAt: true },
  });
  return Response.json(msgs);
}
