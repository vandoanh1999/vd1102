"use client";
import Markdown from "@/components/Markdown";

export type ChatMessage = {
  role: "user" | "assistant" | "error";
  content: string;
  crisis?: boolean;
};

export default function MessageBubble({
  m, onShare, onSpeak, sharing,
}: { m: ChatMessage; onShare?: () => void; onSpeak?: () => void; sharing?: boolean }) {
  if (m.role === "error") {
    return (
      <div className="flex justify-start">
        <div className="max-w-[90%] md:max-w-[75%] rounded-xl p-3 border border-red-500/40 bg-red-950/40 text-red-200 text-sm">
          ⚠️ {m.content}
        </div>
      </div>
    );
  }

  const isUser = m.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[90%] md:max-w-[75%] rounded-xl p-3 border ${isUser
        ? "bg-blue-600 text-white border-blue-400/40"
        : "bg-gray-800 text-cyan-100 border-cyan-400/20"}`}>
        <Markdown text={m.content || ""} />
        {(onShare || onSpeak) && m.content && (
          <div className="mt-2 flex justify-end gap-2">
            {onSpeak && (
              <button onClick={onSpeak}
                className="text-xs px-2 py-1 rounded border border-cyan-400/40 text-cyan-200 hover:bg-cyan-500/10">
                🔊 Nghe
              </button>
            )}
            {onShare && !m.crisis && (
            <button onClick={onShare} disabled={sharing}
              className="text-xs px-2 py-1 rounded border border-rose-400/40 text-rose-200 hover:bg-rose-500/10 disabled:opacity-50">
              {sharing ? "Đang vẽ..." : "📸 Khoe bị chửi"}
            </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
