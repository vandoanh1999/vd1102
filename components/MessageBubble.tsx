"use client";
import Markdown from "@/components/Markdown";

export type ChatMessage = {
  role: "user" | "assistant" | "error";
  content: string;
  crisis?: boolean;
};

const Icon = ({ d }: { d: string }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
);

export default function MessageBubble({
  m, onShare, onSpeak, onCopy, copied, sharing, streaming,
}: {
  m: ChatMessage;
  onShare?: () => void; onSpeak?: () => void; onCopy?: () => void;
  copied?: boolean; sharing?: boolean; streaming?: boolean;
}) {
  if (m.role === "error") {
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-950/40 px-4 py-3 text-sm text-red-200">
        ⚠️ {m.content}
      </div>
    );
  }

  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-3xl bg-[#3a3734]/90 backdrop-blur px-4 py-2.5 text-[15px] leading-6 whitespace-pre-wrap break-words">
          {m.content}
        </div>
      </div>
    );
  }

  // Câu trả lời của AI: không đóng khung, chữ thoáng như các ứng dụng chat quen thuộc.
  return (
    <div className="group flex gap-3">
      <div className="shrink-0 mt-1 w-7 h-7 rounded-full grid place-items-center text-[13px]"
        style={{ background: "color-mix(in srgb, var(--accent) 22%, transparent)", boxShadow: "0 0 14px color-mix(in srgb, var(--accent) 45%, transparent)" }}>
        {m.crisis ? "🤍" : "🤬"}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] leading-7">
          <Markdown text={m.content || ""} />
          {streaming && <span className="inline-block w-2 h-4 align-middle ml-0.5 animate-pulse" style={{ background: "var(--accent)" }} />}
        </div>
        {!streaming && m.content && (
          <div className="mt-1.5 flex items-center gap-1 text-[#a39e96] opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
            {onCopy && (
              <button onClick={onCopy} title="Chép" className="h-8 px-2 rounded-lg hover:bg-white/5 flex items-center gap-1 text-xs">
                <Icon d={copied ? "M20 6 9 17l-5-5" : "M9 9h11v11H9zM5 15H4V4h11v1"} />{copied ? "Đã chép" : ""}
              </button>
            )}
            {onSpeak && (
              <button onClick={onSpeak} title="Nghe" className="h-8 px-2 rounded-lg hover:bg-white/5 flex items-center">
                <Icon d="M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7" />
              </button>
            )}
            {onShare && !m.crisis && (
              <button onClick={onShare} disabled={sharing} title="Xuất ảnh để khoe"
                className="h-8 px-2 rounded-lg hover:bg-white/5 flex items-center gap-1.5 text-xs disabled:opacity-50">
                <Icon d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v13" />
                {sharing ? "Đang vẽ..." : "Khoe bị chửi"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
