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
  const [showMenu, setShowMenu] = useState(false);
  const [mode, setMode] = useState<"chat" | "enhance">("chat");
  // enhance state
  const [enhanceImg, setEnhanceImg] = useState<string | null>(null);
  const [enhanceMime, setEnhanceMime] = useState("image/jpeg");
  const [enhancing, setEnhancing] = useState(false);
  const [enhanceData, setEnhanceData] = useState<any>(null);
  const [enhanceError, setEnhanceError] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
                const cp = [...prev]; cp[cp.length - 1] = { ...last, content: ai }; return cp;
              }
              return [...prev, { role: "assistant", content: ai }];
            });
          } else if (payload.type === "done") { setConv(payload.conversationId); setThinking(false); }
          else if (payload.type === "error") { setThinking(false); }
        } catch { }
      }
    }
  };

  const handleEnhanceFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setEnhanceMime(file.type);
    const reader = new FileReader();
    reader.onload = () => { setEnhanceImg((reader.result as string).split(",")[1]); setEnhanceData(null); };
    reader.readAsDataURL(file);
  };

  const runEnhance = async () => {
    if (!enhanceImg) return;
    setEnhancing(true); setEnhanceError("");
    try {
      const r = await fetch("/api/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: enhanceImg, mimeType: enhanceMime }),
      });
      const json = await r.json();
      if (json.success) setEnhanceData(json.data);
      else setEnhanceError("Không đọc được: " + (json.raw?.slice(0, 80) || "lỗi"));
    } catch { setEnhanceError("Lỗi kết nối"); }
    setEnhancing(false);
  };

  const downloadPNG = async () => {
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(resultRef.current!, { scale: 2, backgroundColor: "#fff" });
    const a = document.createElement("a"); a.download = "tailieu.png";
    a.href = canvas.toDataURL("image/png"); a.click();
  };

  const downloadPDF = async () => {
    const { default: html2canvas } = await import("html2canvas");
    const { jsPDF } = await import("jspdf");
    const canvas = await html2canvas(resultRef.current!, { scale: 2, backgroundColor: "#fff" });
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const w = pdf.internal.pageSize.getWidth();
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, w, (canvas.height * w) / canvas.width);
    pdf.save("tailieu.pdf");
  };

  return (
    <div className="space-y-3">
      <div className="border-b border-cyan-500/20 pb-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setMode("chat")}
            className={`text-sm font-medium ${mode === "chat" ? "text-cyan-300 border-b border-cyan-300" : "text-gray-500"}`}>
            VNAI Chat
          </button>
          {mode === "enhance" && (
            <button onClick={() => setMode("enhance")}
              className="text-sm font-medium text-cyan-300 border-b border-cyan-300">
              ✨ Làm rõ tài liệu
            </button>
          )}
        </div>
        <MatrixCanvas />
      </div>

      {/* CHAT MODE */}
      {mode === "chat" && (
        <>
          <div className="h-[60vh] overflow-y-auto space-y-3 pr-1">
            {messages.map((m, i) => <MessageBubble key={i} m={m} />)}
            <div ref={bottomRef} />
          </div>
          <div className="flex items-center gap-2 relative">
            {/* + menu */}
            <div ref={menuRef} className="relative">
              <button onClick={() => setShowMenu(v => !v)}
                className="w-9 h-9 rounded-full border border-cyan-500/40 flex items-center justify-center text-cyan-400 hover:bg-cyan-500/10 text-xl font-light">
                +
              </button>
              {showMenu && (
                <div className="absolute bottom-12 left-0 bg-gray-800 border border-cyan-500/30 rounded-lg shadow-xl w-52 z-50 overflow-hidden">
                  <button onClick={() => { setMode("enhance"); setShowMenu(false); }}
                    className="w-full px-4 py-3 text-left text-sm hover:bg-cyan-500/10 flex items-center gap-2">
                    <span>✨</span> Làm rõ tài liệu
                  </button>
                  <div className="px-4 py-2 text-xs text-gray-500 border-t border-gray-700">Thêm tính năng sắp ra mắt...</div>
                </div>
              )}
            </div>

            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
              className="flex-1 bg-gray-800 border border-cyan-500/30 rounded px-3 py-2 text-sm focus:outline-none focus:border-cyan-500"
              placeholder="Nhập tin nhắn..." disabled={thinking} />
            <Uploader onUploaded={urls => setAtt(prev => [...prev, ...urls])} />
            <button onClick={send} disabled={thinking}
              className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 rounded disabled:opacity-50 text-sm font-medium">
              {thinking ? "Đang tải..." : "Gửi"}
            </button>
          </div>
          {att.length > 0 && (
            <div className="text-xs text-cyan-300 flex flex-wrap gap-2">
              {att.map((u, i) => <span key={i} className="underline break-all">{u}</span>)}
            </div>
          )}
        </>
      )}

      {/* ENHANCE MODE */}
      {mode === "enhance" && (
        <div className="space-y-3">
          <button onClick={() => { setMode("chat"); setEnhanceImg(null); setEnhanceData(null); }}
            className="text-xs text-gray-400 hover:text-cyan-300">← Quay lại chat</button>

          <label className="block w-full border-2 border-dashed border-cyan-500/40 rounded-lg p-5 text-center cursor-pointer hover:border-cyan-400">
            <input type="file" accept="image/*" onChange={handleEnhanceFile} className="hidden" />
            {enhanceImg
              ? <span className="text-green-400 text-sm">✅ Ảnh đã chọn</span>
              : <span className="text-gray-400 text-sm">📷 Chọn ảnh tài liệu cần làm rõ</span>}
          </label>

          {enhanceImg && (
            <img src={`data:${enhanceMime};base64,${enhanceImg}`} className="w-full rounded opacity-60 max-h-48 object-contain" alt="gốc" />
          )}

          <button onClick={runEnhance} disabled={!enhanceImg || enhancing}
            className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded font-bold disabled:opacity-40 text-sm">
            {enhancing ? "⏳ Đang xử lý..." : "✨ Làm rõ tài liệu"}
          </button>

          {enhanceError && <p className="text-red-400 text-xs">{enhanceError}</p>}

          {enhanceData && (
            <>
              <div className="flex gap-2">
                <button onClick={downloadPNG} className="flex-1 py-2 bg-green-600 hover:bg-green-500 rounded text-sm font-medium">⬇ PNG</button>
                <button onClick={downloadPDF} className="flex-1 py-2 bg-red-600 hover:bg-red-500 rounded text-sm font-medium">⬇ PDF</button>
              </div>
              <div ref={resultRef} className="bg-white text-black p-5 rounded-lg text-xs font-sans">
                {enhanceData.company && <p className="font-bold text-xs mb-1">{enhanceData.company}</p>}
                {enhanceData.title && <h2 className="text-center font-bold text-sm mb-1">{enhanceData.title}</h2>}
                {enhanceData.metadata?.length > 0 && (
                  <div className="grid grid-cols-2 gap-x-3 mb-3">
                    {enhanceData.metadata.map((m: any, i: number) => (
                      <div key={i}><span className="font-semibold">{m.label}:</span> {m.value}</div>
                    ))}
                  </div>
                )}
                {enhanceData.table?.headers?.length > 0 && (
                  <table className="w-full border-collapse border border-gray-400 mb-3">
                    <thead><tr className="bg-gray-100">
                      {enhanceData.table.headers.map((h: string, i: number) => (
                        <th key={i} className="border border-gray-400 px-1 py-1 text-left">{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {enhanceData.table.rows.map((row: string[], i: number) => (
                        <tr key={i}>{row.map((c, j) => <td key={j} className="border border-gray-400 px-1 py-1">{c}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {enhanceData.summary?.length > 0 && (
                  <div className="flex justify-end gap-4 mb-2 font-semibold">
                    {enhanceData.summary.map((s: any, i: number) => <span key={i}>{s.label}: {s.value}</span>)}
                  </div>
                )}
                {enhanceData.footer_company && <p className="font-semibold mb-3">{enhanceData.footer_company}</p>}
                {enhanceData.signatures?.length > 0 && (
                  <div className="grid grid-cols-4 gap-2 text-center mt-3 pt-3 border-t border-gray-300">
                    {enhanceData.signatures.map((s: any, i: number) => (
                      <div key={i}><div className="font-semibold mb-5">{s.role}</div><div className="italic">{s.name || ""}</div></div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
