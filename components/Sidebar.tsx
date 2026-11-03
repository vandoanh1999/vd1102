"use client";
import { useEffect, useState } from "react";
import { loadConvs, deleteConv, CHANGED_EVENT, MAX_CONVS, type LocalConv } from "@/lib/localConvs";

/**
 * Cột lịch sử: 5 cuộc trò chuyện gần nhất, lưu ngay trên máy người dùng.
 * Máy tính: luôn hiện bên trái. Điện thoại: trượt ra như ngăn kéo.
 */
export default function Sidebar({ open, onClose, currentId }: { open: boolean; onClose: () => void; currentId: string }) {
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

  const go = (id: string | null) => { window.dispatchEvent(new CustomEvent("vnai:open", { detail: id })); onClose(); };

  return (
    <>
      {open && <div className="md:hidden fixed inset-0 z-40 bg-black/60" onClick={onClose} />}
      <aside className={`fixed md:static inset-y-0 left-0 z-50 w-72 md:w-64 shrink-0 flex flex-col
        bg-[#1a1918] md:bg-black/25 border-r border-white/5 backdrop-blur
        transition-transform duration-300 ${open ? "translate-x-0" : "-translate-x-full"} md:translate-x-0`}>
        <div className="h-14 px-4 flex items-center gap-2">
          <span className="text-lg font-semibold tracking-tight">VNAI</span>
          <span className="text-xs text-[#a39e96]">AI mỏ hỗn</span>
        </div>
        <div className="px-3">
          <button onClick={() => go(null)}
            className="w-full h-10 px-3 rounded-xl flex items-center gap-2 text-sm hover:bg-white/5 border border-white/10">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            Cuộc trò chuyện mới
          </button>
        </div>
        <div className="px-4 mt-5 mb-1 text-xs text-[#8a857d]">Gần đây</div>
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
          {convs.length === 0 && <div className="px-2 py-1 text-xs text-[#6f6a63]">Chưa có gì. Hỏi một câu đi.</div>}
          {convs.map(c => (
            <div key={c.id} className={`group flex items-center rounded-lg ${c.id === currentId ? "bg-white/10" : "hover:bg-white/5"}`}>
              <button onClick={() => go(c.id)} className="flex-1 min-w-0 text-left text-sm truncate px-2.5 py-2">
                {c.title}
              </button>
              <button onClick={() => deleteConv(c.id)} title="Xoá" aria-label="Xoá"
                className="shrink-0 w-8 h-8 grid place-items-center text-[#8a857d] hover:text-red-400 md:opacity-0 md:group-hover:opacity-100">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
          ))}
        </div>
        <div className="p-4 text-[11px] leading-5 text-[#6f6a63]">
          Chỉ giữ {MAX_CONVS} cuộc gần nhất, lưu trên máy này. Không cần tài khoản.
        </div>
      </aside>
    </>
  );
}
