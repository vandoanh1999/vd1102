import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

export const { auth, handlers, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      name: "credentials",
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        if (!creds?.email || !creds?.password) return null;
        const user = await prisma.user.findUnique({ where: { email: String(creds.email) } });
        if (!user) return null;
        const ok = await bcrypt.compare(String(creds.password), user.password);
        if (!ok) return null;
        return { id: user.id, email: user.email, plan: user.plan } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) token.plan = (user as any).plan;
      return token;
    },
    async session({ session, token }) {
      (session as any).plan = token.plan;
      return session;
    },
  },
});
