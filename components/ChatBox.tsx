"use client";
import { useEffect, useRef, useState } from "react";
import Uploader from "@/components/Uploader";
import MessageBubble from "@/components/MessageBubble";
import MatrixCanvas from "@/components/MatrixCanvas";

export default function ChatBox() {
  const [conversationId, setConv] = useState<string | undefined>();
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState("");
  const [att, setAtt] = useState<string[]>([]);
  const [thinking, setThinking] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch("/api/conversations");
      if (r.ok) {
        const list = await r.json();
        if (list[0]) {
          setConv(list[0].id);
          const m = await fetch(`/api/messages?conversationId=${list[0].id}`);
          setMessages(await m.json());
        }
      }
    })();
  }, []);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const send = async () => {
    if (!input.trim() || thinking) return;
    setThinking(true);
    const userMsg = { role: "user", content: input, attachments: att };
    setMessages(prev => [...prev, userMsg]);
    setInput(""); setAtt([]);

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId, prompt: input }),
    });

    const reader = res.body?.getReader();
    const dec = new TextDecoder();
    let ai = "";

    while (reader) {
      const { value, done } = await reader.read();
      if (done) break;
      const lines = dec.decode(value).split("\n").filter(l => l.startsWith("data:"));
      for (const l of lines) {
        try {
          const payload = JSON.parse(l.slice(5));
          if (payload.type === "token") {
            ai += payload.token;
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                const cp = [...prev];
                cp[cp.length - 1] = { ...last, content: ai };
                return cp;
              }
              return [...prev, { role: "assistant", content: ai }];
            });
          } else if (payload.type === "done") {
            setConv(payload.conversationId);
            setThinking(false);
          } else if (payload.type === "error") {
            setThinking(false);
          }
        } catch { /* ignore malformed chunk */ }
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className="border-b border-cyan-500/20 pb-2 flex items-center justify-between">
        <div className="text-sm text-cyan-300">VNAI Chat</div>
        <MatrixCanvas />
      </div>
      <div className="h-[60vh] overflow-y-auto space-y-3 pr-1">
        {messages.map((m, i) => <MessageBubble key={i} m={m} />)}
        <div ref={bottomRef} />
      </div>
      <div className="flex items-center gap-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
          className="flex-1 bg-gray-800 border border-cyan-500/30 rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
          placeholder="Nhập tin nhắn..."
          disabled={thinking}
        />
        <Uploader onUploaded={urls => setAtt(prev => [...prev, ...urls])} />
        <button
          onClick={send}
          disabled={thinking}
          className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 rounded disabled:opacity-50 text-sm font-medium"
        >
          {thinking ? "..." : "Gửi"}
        </button>
      </div>
      {att.length > 0 && (
        <div className="text-xs text-cyan-300 flex flex-wrap gap-2">
          {att.map((u, i) => <span key={i} className="underline break-all">{u}</span>)}
        </div>
      )}
    </div>
  );
}
