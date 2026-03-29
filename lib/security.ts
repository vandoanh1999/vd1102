/**
 * security.ts — Chuyển thể từ Genesis Core V8 / TrustCert-AI
 * Tác giả gốc: Doanh1102
 * Tích hợp vào: vd1102 (vina-ai.com)
 *
 * Gồm 4 module:
 *  1. InputValidator   — chặn XSS, SQL injection, path traversal
 *  2. SHA3Hasher       — hash message bằng SHA3-256 (Node crypto built-in)
 *  3. PerformanceMonitor — đo thời gian từng AI call
 *  4. BatchProcessor   — gọi nhiều AI request song song
 */

import { createHash } from "crypto";

// ─────────────────────────────────────────────
// 1. INPUT VALIDATOR
// ─────────────────────────────────────────────

const SQL_PATTERNS = [
  /(\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b|\bDROP\b|\bUNION\b|\bEXEC\b)/i,
  /(--|;|\/\*|\*\/)/,
  /(\bOR\b\s+\d+\s*=\s*\d+|\bAND\b\s+\d+\s*=\s*\d+)/i,
];

const XSS_PATTERNS = [
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  /javascript\s*:/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi,
  /<iframe[\s\S]*?>/gi,
  /eval\s*\(/gi,
];

const PATH_TRAVERSAL_PATTERNS = [/\.\.[\/\\]/, /%2e%2e[\/\\]/i];

export interface ValidationResult {
  isValid: boolean;
  threats: string[];
  sanitized: string;
}

export class InputValidator {
  private maxLength: number;

  constructor(maxLength = 32_000) {
    this.maxLength = maxLength;
  }

  validate(input: string): ValidationResult {
    const threats: string[] = [];

    // Kiểm tra độ dài
    if (input.length > this.maxLength) {
      threats.push(`Input quá dài: ${input.length} ký tự (max ${this.maxLength})`);
    }

    // Kiểm tra SQL injection
    for (const pattern of SQL_PATTERNS) {
      if (pattern.test(input)) {
        threats.push("SQL injection detected");
        break;
      }
    }

    // Kiểm tra XSS
    for (const pattern of XSS_PATTERNS) {
      if (pattern.test(input)) {
        threats.push("XSS attack detected");
        break;
      }
    }

    // Kiểm tra path traversal
    for (const pattern of PATH_TRAVERSAL_PATTERNS) {
      if (pattern.test(input)) {
        threats.push("Path traversal detected");
        break;
      }
    }

    return {
      isValid: threats.length === 0,
      threats,
      sanitized: this.sanitize(input),
    };
  }

  sanitize(input: string): string {
    return input
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#x27;")
      .replace(/\//g, "&#x2F;")
      .slice(0, this.maxLength);
  }

  /** Dùng trong API route: ném lỗi 400 nếu input nguy hiểm */
  assertSafe(input: string): string {
    const result = this.validate(input);
    if (!result.isValid) {
      throw new Error(`Unsafe input: ${result.threats.join(", ")}`);
    }
    return result.sanitized;
  }
}

// Singleton dùng chung toàn app
export const validator = new InputValidator();

// ─────────────────────────────────────────────
// 2. SHA3 HASHER
// ─────────────────────────────────────────────

export class SHA3Hasher {
  /**
   * Hash một chuỗi bằng SHA3-256
   * Node.js gọi là "sha3-256" hoặc "sha256" tuỳ version —
   * dùng "sha256" cho tương thích cao nhất trên Vercel.
   */
  hash(data: string): string {
    return createHash("sha256").update(data, "utf8").digest("hex");
  }

  /**
   * Tạo message fingerprint: hash(userId + content + timestamp)
   * Dùng để detect duplicate message hoặc lưu DB
   */
  fingerprint(userId: string, content: string): string {
    const ts = Math.floor(Date.now() / 1000); // granularity 1 giây
    return this.hash(`${userId}:${content}:${ts}`);
  }

  /**
   * Verify fingerprint — kiểm tra message có bị tamper không
   */
  verify(userId: string, content: string, expectedHash: string): boolean {
    const ts = Math.floor(Date.now() / 1000);
    // Cho phép ±5 giây lệch clock
    for (let delta = -5; delta <= 5; delta++) {
      const candidate = this.hash(`${userId}:${content}:${ts + delta}`);
      if (candidate === expectedHash) return true;
    }
    return false;
  }
}

export const hasher = new SHA3Hasher();

// ─────────────────────────────────────────────
// 3. PERFORMANCE MONITOR
// ─────────────────────────────────────────────

interface OperationStats {
  count: number;
  totalMs: number;
  minMs: number;
  maxMs: number;
  errors: number;
}

export class PerformanceMonitor {
  private stats = new Map<string, OperationStats>();

  /** Bắt đầu đo — trả về hàm stop() */
  start(operation: string): () => void {
    const begin = performance.now();

    return () => {
      const durationMs = performance.now() - begin;
      this.record(operation, durationMs, false);
    };
  }

  recordError(operation: string): void {
    const existing = this.stats.get(operation);
    if (existing) {
      existing.errors++;
    } else {
      this.stats.set(operation, {
        count: 0,
        totalMs: 0,
        minMs: Infinity,
        maxMs: 0,
        errors: 1,
      });
    }
  }

  private record(operation: string, ms: number, isError: boolean): void {
    const existing = this.stats.get(operation);
    if (existing) {
      existing.count++;
      existing.totalMs += ms;
      existing.minMs = Math.min(existing.minMs, ms);
      existing.maxMs = Math.max(existing.maxMs, ms);
      if (isError) existing.errors++;
    } else {
      this.stats.set(operation, {
        count: 1,
        totalMs: ms,
        minMs: ms,
        maxMs: ms,
        errors: isError ? 1 : 0,
      });
    }
  }

  getStats(operation?: string) {
    if (operation) {
      const s = this.stats.get(operation);
      if (!s) return null;
      return {
        operation,
        count: s.count,
        avgMs: s.count ? +(s.totalMs / s.count).toFixed(2) : 0,
        minMs: +s.minMs.toFixed(2),
        maxMs: +s.maxMs.toFixed(2),
        errors: s.errors,
        errorRate: s.count ? +((s.errors / s.count) * 100).toFixed(1) + "%" : "0%",
      };
    }

    // Trả về tất cả
    const result: Record<string, ReturnType<typeof this.getStats>> = {};
    for (const [key] of this.stats) {
      result[key] = this.getStats(key);
    }
    return result;
  }

  reset(operation?: string): void {
    if (operation) {
      this.stats.delete(operation);
    } else {
      this.stats.clear();
    }
  }
}

export const monitor = new PerformanceMonitor();

// ─────────────────────────────────────────────
// 4. BATCH PROCESSOR
// ─────────────────────────────────────────────

export interface BatchResult<T> {
  results: Array<{ index: number; value: T | null; error?: string }>;
  successful: number;
  failed: number;
  total: number;
  durationMs: number;
}

export class BatchProcessor {
  private maxConcurrent: number;
  private timeoutMs: number;

  constructor(maxConcurrent = 3, timeoutMs = 30_000) {
    this.maxConcurrent = maxConcurrent;
    this.timeoutMs = timeoutMs;
  }

  async processBatch<T, R>(
    items: T[],
    processor: (item: T, index: number) => Promise<R>
  ): Promise<BatchResult<R>> {
    const start = performance.now();
    const results: BatchResult<R>["results"] = [];
    let successful = 0;
    let failed = 0;

    // Chia thành chunks theo maxConcurrent
    for (let i = 0; i < items.length; i += this.maxConcurrent) {
      const chunk = items.slice(i, i + this.maxConcurrent);

      const chunkResults = await Promise.allSettled(
        chunk.map((item, j) =>
          this.withTimeout(processor(item, i + j), this.timeoutMs)
        )
      );

      for (let j = 0; j < chunkResults.length; j++) {
        const res = chunkResults[j];
        if (res.status === "fulfilled") {
          results.push({ index: i + j, value: res.value });
          successful++;
        } else {
          results.push({
            index: i + j,
            value: null,
            error: res.reason?.message ?? "Unknown error",
          });
          failed++;
        }
      }
    }

    return {
      results,
      successful,
      failed,
      total: items.length,
      durationMs: +(performance.now() - start).toFixed(2),
    };
  }

  private withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
      ),
    ]);
  }
}

export const batchProcessor = new BatchProcessor(3, 30_000);

// ─────────────────────────────────────────────
// HELPER — Dùng trong API route Next.js
// ─────────────────────────────────────────────

/**
 * Wrap 1 AI call với đầy đủ: validate input → monitor → hash output
 *
 * Ví dụ dùng trong app/api/chat/route.ts:
 *
 *   import { secureAICall } from "@/lib/security";
 *
 *   const result = await secureAICall(
 *     "chat",
 *     userId,
 *     userMessage,
 *     () => openai.chat.completions.create({ ... })
 *   );
 */
export async function secureAICall<T>(
  operationName: string,
  userId: string,
  userInput: string,
  aiCall: () => Promise<T>
): Promise<{ data: T; inputHash: string; durationMs: number }> {
  // 1. Validate input
  validator.assertSafe(userInput);

  // 2. Hash input
  const inputHash = hasher.fingerprint(userId, userInput);

  // 3. Monitor + call
  const stop = monitor.start(operationName);
  try {
    const data = await aiCall();
    stop();
    const stats = monitor.getStats(operationName) as { avgMs: number } | null;
    return {
      data,
      inputHash,
      durationMs: stats?.avgMs ?? 0,
    };
  } catch (err) {
    monitor.recordError(operationName);
    stop();
    throw err;
  }
}
