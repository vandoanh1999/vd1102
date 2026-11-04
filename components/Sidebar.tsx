"use client";
import { useEffect, useState } from "react";
import { loadConvs, deleteConv, CHANGED_EVENT, type LocalConv } from "@/lib/localConvs";

const CONTACT_EMAIL = "phamvandoanh9@gmail.com";

/**
 * Cột lịch sử: các cuộc trò chuyện gần đây (lưu trên máy người dùng) + mục Ủng hộ.
 * Máy tính: luôn hiện bên trái. Điện thoại: trượt ra như ngăn kéo.
 */
export default function Sidebar({ open, onClose, currentId }: { open: boolean; onClose: () => void; currentId: string }) {
  const [convs, setConvs] = useState<LocalConv[]>([]);
  const [donate, setDonate] = useState(false);

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
        <div className="h-14 px-4 flex items-center">
          <span className="text-lg font-semibold tracking-tight">VNAI</span>
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
        <div className="p-3">
          <button onClick={() => setDonate(true)}
            className="w-full h-10 px-3 rounded-xl flex items-center gap-2 text-sm hover:bg-white/5 border border-white/10">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4 3 5.5l7 7Z" /></svg>
            Ủng hộ
          </button>
        </div>
      </aside>

      {/* Hộp Ủng hộ: mã QR chuyển khoản + email liên hệ */}
      {donate && (
        <div className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm grid place-items-center p-4" onClick={() => setDonate(false)}>
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#1f1d1b] p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <div className="text-lg font-semibold">Ủng hộ VNAI</div>
              <button onClick={() => setDonate(false)} aria-label="Đóng" className="w-8 h-8 grid place-items-center rounded-lg hover:bg-white/5">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-sm text-[#cfc9c0] leading-6">
              VNAI đang miễn phí cho tất cả mọi người. Nếu thấy vui, bạn có thể ủng hộ để duy trì máy chủ.
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/donate-qr.png" alt="Mã QR chuyển khoản ACB — PHAM VAN DOANH — 213035099"
              className="w-full rounded-2xl bg-white" />
            <div className="flex gap-2">
              <a href="/donate-qr.png" download="vnai-ung-ho-qr.png"
                className="flex-1 h-10 rounded-full border border-white/15 text-sm grid place-items-center hover:bg-white/5">
                Lưu ảnh QR
              </a>
              <a href={`mailto:${CONTACT_EMAIL}`}
                className="flex-1 h-10 rounded-full text-black text-sm font-medium grid place-items-center" style={{ background: "var(--accent)" }}>
                Gửi email
              </a>
            </div>
            <div className="text-xs text-[#8a857d] text-center">
              Liên hệ: <a href={`mailto:${CONTACT_EMAIL}`} className="underline">{CONTACT_EMAIL}</a>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
