import { auth } from "@/lib/auth";
import { prisma, withDbRetry } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return new Response("Unauthorized", { status: 401 });
  const user = await withDbRetry(() => prisma.user.findUnique({ where: { email: session.user!.email! } }));
  if (!user) return new Response("Unauthorized", { status: 401 });
  const convs = await prisma.conversation.findMany({
    where: { userId: user.id },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true, updatedAt: true },
  });
  return Response.json(convs);
}
