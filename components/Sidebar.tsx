"use client";
import { useEffect, useState } from "react";

type Conv = { id: string; title: string };

export default function Sidebar() {
  const [convs, setConvs] = useState<Conv[]>([]);

  // Chỉ tải lại khi có cuộc mới/tin mới, không hỏi DB mỗi 5 giây nữa (để Neon được ngủ, đỡ tốn).
  useEffect(() => {
    const load = () => fetch("/api/conversations").then(r => (r.ok ? r.json() : [])).then(setConvs).catch(() => {});
    load();
    window.addEventListener("vnai:refresh", load);
    return () => window.removeEventListener("vnai:refresh", load);
  }, []);

  const open = (id: string | null) => window.dispatchEvent(new CustomEvent("vnai:open", { detail: id }));

  return (
    <aside className="w-64 border-r border-cyan-500/20 p-3 hidden md:block">
      <button onClick={() => open(null)}
        className="w-full mb-3 text-sm px-2 py-2 rounded border border-rose-400/40 text-rose-200 hover:bg-rose-500/10">
        ＋ Cuộc mới
      </button>
      <div className="text-xs text-cyan-400 mb-2 font-semibold uppercase tracking-wide">Lịch sử ăn chửi</div>
      <div className="space-y-1">
        {convs.map(c => (
          <button key={c.id} onClick={() => open(c.id)}
            className="w-full text-left text-sm truncate px-2 py-1 rounded bg-gray-800/70 border border-cyan-500/20 hover:border-cyan-500/50">
            {c.title || "Không tên"}
          </button>
        ))}
      </div>
    </aside>
  );
}
