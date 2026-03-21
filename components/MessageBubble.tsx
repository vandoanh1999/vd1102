"use client";
import Markdown from "@/components/Markdown";

export default function MessageBubble({ m }: { m: any }) {
  const isUser = m.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={`max-w-[75%] rounded-xl p-3 border ${isUser ? "bg-blue-600 text-white border-blue-400/40" : "bg-gray-800 text-cyan-100 border-cyan-400/20"}`}>
        <Markdown text={m.content || ""} />
        {Array.isArray(m.attachments) && m.attachments.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {m.attachments.map((u: string) => (
              <a key={u} href={u} target="_blank" rel="noreferrer" className="text-xs underline break-all">{u}</a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
