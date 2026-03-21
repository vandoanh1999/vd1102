import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  const { email, password } = await req.json();
  if (!email || !password) return new Response("Email và mật khẩu không được để trống", { status: 400 });
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) return new Response("Email đã tồn tại", { status: 409 });
  const hash = await bcrypt.hash(password, 10);
  await prisma.user.create({ data: { email, password: hash } });
  return new Response("ok");
}
