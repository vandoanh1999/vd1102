import { PrismaClient } from "@prisma/client";
const globalForPrisma = global as unknown as { prisma?: PrismaClient };
export const prisma = globalForPrisma.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

/**
 * Neon tự ngủ khi không ai dùng; lần gọi đầu có thể báo "Can't reach database server".
 * Thử lại vài lần với độ trễ tăng dần thay vì báo lỗi ngay cho người dùng.
 */
export async function withDbRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const name = (e as { name?: string })?.name || "";
      if (!name.includes("PrismaClientInitializationError") && !name.includes("PrismaClientRustPanicError")) throw e;
      await new Promise(r => setTimeout(r, 700 * (i + 1)));
    }
  }
  throw last;
}
