"use client";
import { useEffect, useState } from "react";
import { loadConvs, deleteConv, CHANGED_EVENT, MAX_CONVS, type LocalConv } from "@/lib/localConvs";

/** Cột lịch sử trên máy tính: 5 cuộc trò chuyện gần nhất, lưu ngay trên máy người dùng. */
export default function Sidebar() {
  const [convs, setConvs] = useState<LocalConv[]>([]);

  useEffect(() => {
    const refresh = () => setConvs(loadConvs());
    refresh();
    window.addEventListener(CHANGED_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(CHANGED_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const open = (id: string | null) => window.dispatchEvent(new CustomEvent("vnai:open", { detail: id }));

  return (
    <aside className="w-64 border-r border-cyan-500/20 p-3 hidden md:block">
      <button onClick={() => open(null)}
        className="w-full mb-3 text-sm px-2 py-2 rounded border border-rose-400/40 text-rose-200 hover:bg-rose-500/10">
        ＋ Cuộc mới
      </button>
      <div className="text-xs text-cyan-400 mb-1 font-semibold uppercase tracking-wide">Lịch sử ăn chửi</div>
      <div className="text-[11px] text-gray-500 mb-2">{MAX_CONVS} cuộc gần nhất, chỉ lưu trên máy này</div>
      <div className="space-y-1">
        {convs.length === 0 && <div className="text-xs text-gray-600">Chưa có gì. Hỏi một câu đi.</div>}
        {convs.map(c => (
          <div key={c.id} className="group flex items-center gap-1">
            <button onClick={() => open(c.id)}
              className="flex-1 min-w-0 text-left text-sm truncate px-2 py-1 rounded bg-gray-800/70 border border-cyan-500/20 hover:border-cyan-500/50">
              {c.title}
            </button>
            <button onClick={() => deleteConv(c.id)} title="Xoá"
              className="shrink-0 px-1 text-gray-600 opacity-0 group-hover:opacity-100 hover:text-red-400">✕</button>
          </div>
        ))}
      </div>
    </aside>
  );
}
