"use client";

/**
 * Lịch sử trò chuyện lưu NGAY TRÊN MÁY người dùng (localStorage), không gửi lên server.
 * Chỉ giữ 5 cuộc gần nhất; cuộc cũ hơn tự bị xoá.
 */

export type StoredMessage = { role: "user" | "assistant"; content: string; crisis?: boolean; seen?: boolean };
export type LocalConv = { id: string; title: string; updatedAt: number; messages: StoredMessage[] };

const KEY = "vnai.convs.v1";
export const MAX_CONVS = 5;
const MAX_MESSAGES_PER_CONV = 100;
export const CHANGED_EVENT = "vnai:convs";

export function loadConvs(): LocalConv[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as LocalConv[]) : [];
    return Array.isArray(list)
      ? list.filter(c => c && typeof c.id === "string" && Array.isArray(c.messages))
        .sort((a, b) => b.updatedAt - a.updatedAt)
      : [];
  } catch {
    return [];
  }
}

function write(list: LocalConv[]) {
  const trimmed = list.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CONVS);
  try {
    localStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    // Bộ nhớ đầy: bỏ bớt cuộc cũ nhất rồi thử lại một lần.
    try { localStorage.setItem(KEY, JSON.stringify(trimmed.slice(0, Math.max(1, trimmed.length - 1)))); } catch { /* bỏ qua */ }
  }
  window.dispatchEvent(new CustomEvent(CHANGED_EVENT));
}

export function getConv(id: string): LocalConv | undefined {
  return loadConvs().find(c => c.id === id);
}

export function saveConv(id: string, messages: StoredMessage[]) {
  const clean = messages.filter(m => (m.role === "user" || m.role === "assistant") && m.content).slice(-MAX_MESSAGES_PER_CONV);
  if (!clean.length) return;
  const firstQ = clean.find(m => m.role === "user")?.content || "Cuộc trò chuyện";
  const list = loadConvs().filter(c => c.id !== id);
  list.push({ id, title: firstQ.slice(0, 60), updatedAt: Date.now(), messages: clean });
  write(list);
}

export function deleteConv(id: string) {
  write(loadConvs().filter(c => c.id !== id));
}

export function newConvId(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; }
}
