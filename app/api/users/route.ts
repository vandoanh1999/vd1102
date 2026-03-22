import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  try {
    const { email, password } = await req.json();
    
    if (!email || !password) 
      return Response.json({ error: "Email và mật khẩu không được để trống" }, { status: 400 });
    
    if (password.length < 6)
      return Response.json({ error: "Mật khẩu tối thiểu 6 ký tự" }, { status: 400 });

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) 
      return Response.json({ error: "Email đã tồn tại" }, { status: 409 });

    const hash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({ 
      data: { email, password: hash } 
    });

    return Response.json({ ok: true, id: user.id });
  } catch (e) {
    console.error("Register error:", e);
    return Response.json({ error: "Lỗi server, thử lại sau" }, { status: 500 });
  }
}
