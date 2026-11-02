"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import MessageBubble, { type ChatMessage } from "@/components/MessageBubble";
import MatrixCanvas from "@/components/MatrixCanvas";
import { LEVELS, type Level } from "@/lib/persona";
import { shareRoast } from "@/lib/shareCard";
import {
  VoiceRecorder, transcribe, speak, stopSpeaking, unlockSpeech, hasVietnameseVoice, voiceSupported,
} from "@/lib/voice";

type Phase = "idle" | "listening" | "transcribing" | "thinking" | "speaking";

const NO_VI_VOICE =
  "Máy bạn chưa có giọng đọc tiếng Việt nên AI sẽ đọc lơ lớ. Android: vào Cài đặt → Chuyển văn bản sang lời nói → " +
  "chọn công cụ của Google → tải giọng Tiếng Việt. iPhone: Cài đặt → Trợ năng → Nội dung được đọc → Giọng nói → Tiếng Việt.";

const SUGGESTIONS = [
  "1 + 1 bằng mấy?",
  "Trái đất hình gì vậy?",
  "Viết code Python in ra Hello World",
  "Làm sao để giàu nhanh?",
  "Giải thích blockchain cho tôi",
];

// localStorage có thể bị chặn (ẩn danh) → luôn bọc try/catch.
const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* bỏ qua */ } },
};

export default function ChatBox() {
  const [conversationId, setConvState] = useState<string | undefined>();
  // Bản sao dạng ref: vòng lặp chế độ gọi chạy lâu, không được đọc giá trị cũ của state.
  const convRef = useRef<string | undefined>(undefined);
  const adultRef = useRef(false);
  const setConv = (id: string | undefined) => { convRef.current = id; setConvState(id); };
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [level, setLevel] = useState<Level>("khia");
  const [adult, setAdult] = useState(false);
  const [askAdult, setAskAdult] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [sharingIdx, setSharingIdx] = useState<number | null>(null);
  const [showMenu, setShowMenu] = useState(false);
  const [mode, setMode] = useState<"chat" | "enhance">("chat");
  // giọng nói
  const [phase, setPhase] = useState<Phase>("idle");
  const [micLevel, setMicLevel] = useState(0);
  const [speakOn, setSpeakOn] = useState(false);
  const [callMode, setCallMode] = useState(false);
  const [canVoice, setCanVoice] = useState(false);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const callRef = useRef(false);
  const speakOnRef = useRef(false);
  const levelRef = useRef<Level>("khia");
  useEffect(() => { speakOnRef.current = speakOn; }, [speakOn]);
  useEffect(() => { levelRef.current = level; }, [level]);
  useEffect(() => { adultRef.current = adult; }, [adult]);
  // enhance state
  const [enhanceImg, setEnhanceImg] = useState<string | null>(null);
  const [enhanceMime, setEnhanceMime] = useState("image/jpeg");
  const [enhancing, setEnhancing] = useState(false);
  const [enhanceData, setEnhanceData] = useState<any>(null);
  const [enhanceError, setEnhanceError] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Nhớ cấp độ và xác nhận 18+ của người dùng trên máy này.
  useEffect(() => {
    const isAdult = store.get("vnai.adult") === "1";
    setAdult(isAdult);
    const saved = store.get("vnai.level") as Level | null;
    if (saved && saved in LEVELS && (!LEVELS[saved].adult || isAdult)) setLevel(saved);
    setSpeakOn(store.get("vnai.speak") === "1");
    setCanVoice(voiceSupported());
    recorderRef.current = new VoiceRecorder();
    return () => { recorderRef.current?.release(); stopSpeaking(); callRef.current = false; };
  }, []);

  const openConversation = useCallback(async (id: string) => {
    const r = await fetch(`/api/messages?conversationId=${encodeURIComponent(id)}`);
    if (!r.ok) return;
    const list = await r.json();
    setConv(id);
    setMessages(list.filter((m: any) => m.role === "user" || m.role === "assistant")
      .map((m: any) => ({ role: m.role, content: m.content })));
  }, []);

  // Mở cuộc gần nhất khi vào trang; nghe Sidebar bấm chọn cuộc khác.
  useEffect(() => {
    (async () => {
      const r = await fetch("/api/conversations");
      if (r.ok) {
        const list = await r.json();
        if (list[0]) await openConversation(list[0].id);
      }
    })();
    const onOpen = (e: Event) => {
      const id = (e as CustomEvent<string | null>).detail;
      if (id) openConversation(id); else { setConv(undefined); setMessages([]); }
    };
    window.addEventListener("vnai:open", onOpen);
    return () => window.removeEventListener("vnai:open", onOpen);
  }, [openConversation]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setShowMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const pickLevel = (l: Level) => {
    if (LEVELS[l].adult && !adult) { setAskAdult(true); return; }
    setLevel(l); store.set("vnai.level", l);
  };

  const confirmAdult = () => {
    setAdult(true); store.set("vnai.adult", "1");
    setLevel("gat"); store.set("vnai.level", "gat");
    setAskAdult(false);
  };

  const newConversation = () => {
    setConv(undefined); setMessages([]);
    window.dispatchEvent(new CustomEvent("vnai:refresh"));
  };

  /** Gửi câu hỏi, stream câu trả lời lên màn hình; trả về toàn văn câu trả lời ("" nếu lỗi). */
  const send = async (text?: string): Promise<string> => {
    const prompt = (text ?? input).trim();
    if (!prompt || thinking) return "";
    setThinking(true);
    let ai = "";
    let ok = false;
    setMessages(prev => [...prev, { role: "user", content: prompt }]);
    setInput("");

    const fail = (msg: string) => setMessages(prev => [...prev, { role: "error", content: msg }]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convRef.current, prompt, level: levelRef.current, adult: adultRef.current }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        if (data.limit) setRemaining(0);
        fail(data.error || `Lỗi máy chủ (${res.status}). Thử lại sau.`);
        return "";
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        // Sự kiện SSE ngăn cách bằng dòng trống; giữ phần dở dang cho lần đọc sau.
        const events = buf.split("\n\n");
        buf = events.pop() || "";
        for (const ev of events) {
          const line = ev.split("\n").find(l => l.startsWith("data:"));
          if (!line) continue;
          let payload: any;
          try { payload = JSON.parse(line.slice(5)); } catch { continue; }
          if (payload.type === "token") {
            ai += payload.token;
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                const cp = [...prev]; cp[cp.length - 1] = { ...last, content: ai }; return cp;
              }
              return [...prev, { role: "assistant", content: ai }];
            });
          } else if (payload.type === "done") {
            ok = true;
            setConv(payload.conversationId);
            if (typeof payload.remaining === "number" && payload.remaining >= 0) setRemaining(payload.remaining);
            if (payload.crisis) setMessages(prev => {
              const cp = [...prev]; const last = cp[cp.length - 1];
              if (last?.role === "assistant") cp[cp.length - 1] = { ...last, crisis: true };
              return cp;
            });
            window.dispatchEvent(new CustomEvent("vnai:refresh"));
          } else if (payload.type === "error") {
            if (payload.conversationId) setConv(payload.conversationId);
            fail(payload.message || "Có lỗi khi gọi AI.");
          }
        }
      }
    } catch {
      fail("Mất kết nối. Kiểm tra mạng rồi thử lại.");
    } finally {
      setThinking(false);
    }
    return ok ? ai : "";
  };

  /* ───────────── Giọng nói ───────────── */

  const fail = (msg: string) => setMessages(prev => [...prev, { role: "error", content: msg }]);

  const speakAnswer = async (text: string) => {
    setPhase("speaking");
    await speak(text, { rate: levelRef.current === "gat" ? 1.12 : 1.05 });
    setPhase("idle");
  };

  /** Nghe một lượt. Trả về: chuỗi = đã nghe được; "" = nghe không rõ; null = không ai nói / lỗi micro. */
  const listenOnce = async (): Promise<string | null> => {
    const recorder = recorderRef.current;
    if (!recorder) return null;
    setPhase("listening");
    let rec;
    try {
      rec = await recorder.start({ noSpeechMs: callRef.current ? 15_000 : 10_000, onLevel: setMicLevel });
    } catch {
      setPhase("idle");
      fail("Không mở được micro. Cho phép trang này dùng micro trong cài đặt trình duyệt rồi thử lại.");
      callRef.current = false;
      return null;
    }
    setMicLevel(0);
    if (!rec) { setPhase("idle"); return null; }
    setPhase("transcribing");
    const { text, error } = await transcribe(rec);
    setPhase("idle");
    if (error) { fail(error); return ""; }
    return text;
  };

  /** Bấm micro: nói một câu, tự dừng khi im lặng (bấm lần nữa để dừng sớm). */
  const micTap = async () => {
    if (phase === "listening") { recorderRef.current?.stop(); return; }
    if (thinking || phase !== "idle") return;
    stopSpeaking();
    if (speakOnRef.current) unlockSpeech();
    const text = await listenOnce();
    recorderRef.current?.release(); // tắt đèn micro sau khi nói xong
    if (!text) return;
    const ans = await send(text);
    if (ans && speakOnRef.current) await speakAnswer(ans);
  };

  /** Gõ phím rồi gửi; nếu đang bật "Đọc to" thì đọc luôn câu trả lời. */
  const sendTyped = async (text?: string) => {
    if (speakOnRef.current) unlockSpeech(); // iOS: phải mở khoá trong lúc bấm
    const ans = await send(text);
    if (ans && speakOnRef.current) await speakAnswer(ans);
  };

  const toggleSpeak = async () => {
    const next = !speakOn;
    setSpeakOn(next); store.set("vnai.speak", next ? "1" : "0");
    if (next) { unlockSpeech(); if (!(await hasVietnameseVoice())) fail(NO_VI_VOICE); }
    else stopSpeaking();
  };

  const endCall = () => {
    callRef.current = false;
    setCallMode(false);
    recorderRef.current?.release();
    stopSpeaking();
    setPhase("idle");
    setMicLevel(0);
  };

  /** Chế độ gọi rảnh tay: nghe → trả lời → đọc to → nghe tiếp, đến khi bấm Kết thúc. */
  const startCall = async () => {
    if (callRef.current || thinking) return;
    unlockSpeech();
    stopSpeaking();
    callRef.current = true;
    setCallMode(true);
    if (!(await hasVietnameseVoice())) fail(NO_VI_VOICE);
    let silent = 0, unclear = 0;
    while (callRef.current) {
      const text = await listenOnce();
      if (!callRef.current) break;
      if (text === null) { if (++silent >= 2) { fail("Im lặng lâu quá, VNAI cúp máy đây."); break; } continue; }
      if (!text) { if (++unclear >= 3) break; continue; }
      silent = 0; unclear = 0;
      setPhase("thinking");
      const ans = await send(text);
      if (!callRef.current) break;
      if (ans) await speakAnswer(ans); else setPhase("idle");
    }
    endCall();
  };

  const share = async (i: number) => {
    const answer = messages[i];
    const question = [...messages.slice(0, i)].reverse().find(m => m.role === "user");
    if (!answer || !question) return;
    setSharingIdx(i);
    try { await shareRoast(question.content, answer.content); }
    catch { setMessages(prev => [...prev, { role: "error", content: "Không tạo được ảnh. Thử lại nhé." }]); }
    finally { setSharingIdx(null); }
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
      <div className="border-b border-cyan-500/20 pb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => setMode("chat")}
            className={`text-sm font-medium whitespace-nowrap ${mode === "chat" ? "text-rose-300 border-b border-rose-300" : "text-gray-500"}`}>
            🤬 VNAI mỏ hỗn
          </button>
          {mode === "chat" && messages.length > 0 && (
            <button onClick={newConversation} className="text-xs text-gray-400 hover:text-cyan-300 whitespace-nowrap">
              ＋ Cuộc mới
            </button>
          )}
          {mode === "enhance" && (
            <button onClick={() => setMode("enhance")}
              className="text-sm font-medium text-cyan-300 border-b border-cyan-300">
              ✨ Làm rõ tài liệu
            </button>
          )}
        </div>
        <div className="hidden sm:block"><MatrixCanvas /></div>
      </div>

      {/* CHAT MODE */}
      {mode === "chat" && (
        <>
          <div className="h-[58dvh] overflow-y-auto space-y-3 pr-1">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center gap-4 px-2">
                <div className="text-5xl">🤬</div>
                <div className="text-lg font-semibold text-rose-200">AI giả đần, mồm láo, nhưng biết tuốt.</div>
                <div className="text-sm text-gray-400 max-w-md">
                  Hỏi gì cũng trả lời đúng. Hỏi ngu thì ăn chửi. Chọn mức độ bên dưới rồi hỏi thử đi, đừng sợ.
                </div>
                <div className="flex flex-wrap justify-center gap-2 max-w-lg">
                  {SUGGESTIONS.map(s => (
                    <button key={s} onClick={() => sendTyped(s)} disabled={thinking || callMode}
                      className="text-xs px-3 py-1.5 rounded-full border border-cyan-500/30 text-cyan-200 hover:bg-cyan-500/10">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <MessageBubble key={i} m={m}
                onShare={m.role === "assistant" ? () => share(i) : undefined}
                onSpeak={m.role === "assistant" ? () => { unlockSpeech(); speakAnswer(m.content); } : undefined}
                sharing={sharingIdx === i} />
            ))}
            {thinking && messages[messages.length - 1]?.role === "user" && (
              <div className="text-xs text-gray-400 animate-pulse">VNAI đang nghĩ câu chửi...</div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Chọn mức độ chửi */}
          <div className="flex items-center gap-2 flex-wrap">
            {(Object.keys(LEVELS) as Level[]).map(l => (
              <button key={l} onClick={() => pickLevel(l)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${level === l
                  ? "border-rose-400 bg-rose-500/20 text-rose-100"
                  : "border-gray-600 text-gray-400 hover:border-gray-400"}`}>
                {LEVELS[l].emoji} {LEVELS[l].label}{LEVELS[l].adult ? " 18+" : ""}
              </button>
            ))}
            <button onClick={toggleSpeak}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${speakOn
                ? "border-cyan-400 bg-cyan-500/20 text-cyan-100"
                : "border-gray-600 text-gray-400 hover:border-gray-400"}`}>
              {speakOn ? "🔊 Đọc to" : "🔇 Đọc to"}
            </button>
            {remaining !== null && (
              <span className="text-xs text-gray-500 ml-auto">Còn {remaining} câu hôm nay</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* + menu */}
            <div ref={menuRef} className="relative shrink-0">
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
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendTyped()}
              className="flex-1 min-w-0 bg-gray-800 border border-cyan-500/30 rounded px-3 py-2 text-sm focus:outline-none focus:border-rose-400"
              placeholder={phase === "listening" ? "Đang nghe..." : phase === "transcribing" ? "Đang chép lời..." : "Hỏi đi, tao đang chờ..."}
              disabled={thinking || phase !== "idle"} maxLength={4000} />
            {canVoice && !input.trim() ? (
              <>
                <button onClick={micTap} disabled={thinking || callMode || (phase !== "idle" && phase !== "listening")}
                  title="Bấm để nói (tự dừng khi bạn im lặng)"
                  className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg disabled:opacity-50 ${phase === "listening" && !callMode
                    ? "bg-rose-600 animate-pulse" : "bg-gray-800 border border-rose-400/50"}`}
                  style={phase === "listening" && !callMode ? { boxShadow: `0 0 0 ${4 + micLevel * 14}px rgba(244,63,94,0.25)` } : undefined}>
                  {phase === "transcribing" && !callMode ? "…" : "🎙️"}
                </button>
                <button onClick={startCall} disabled={thinking || callMode || phase !== "idle"} title="Gọi rảnh tay"
                  className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg bg-gradient-to-r from-rose-500 to-fuchsia-600 disabled:opacity-50">
                  📞
                </button>
              </>
            ) : (
              <button onClick={() => sendTyped()} disabled={thinking || !input.trim()}
                className="shrink-0 px-4 py-2 bg-gradient-to-r from-rose-500 to-fuchsia-600 rounded disabled:opacity-50 text-sm font-medium">
                {thinking ? "..." : "Gửi"}
              </button>
            )}
          </div>
          <p className="text-[11px] text-gray-500 text-center">
            VNAI chửi cho vui, không nhằm xúc phạm ai. Đang buồn thật thì cứ nói thật, nó sẽ thôi diễn.
          </p>

          {/* Màn hình chế độ gọi */}
          {callMode && (
            <div className="fixed inset-0 z-40 bg-gray-950/95 flex flex-col items-center justify-between p-6">
              <div className="text-center pt-6 space-y-1">
                <div className="text-rose-300 font-semibold">📞 Đang gọi VNAI mỏ hỗn</div>
                <div className="text-xs text-gray-400">{LEVELS[level].emoji} {LEVELS[level].label} · nói xong im 1 giây là nó tự trả lời</div>
              </div>
              <div className="flex flex-col items-center gap-6">
                <div className="rounded-full bg-gradient-to-br from-rose-500 to-fuchsia-700 grid place-items-center text-6xl transition-transform duration-100"
                  style={{ width: 160, height: 160, transform: `scale(${phase === "listening" ? 1 + micLevel * 0.35 : phase === "speaking" ? 1.08 : 1})` }}>
                  {phase === "speaking" ? "🤬" : phase === "thinking" || phase === "transcribing" ? "🤔" : "👂"}
                </div>
                <div className="text-lg text-gray-200 h-7">
                  {phase === "listening" ? "Đang nghe mày nói..." : phase === "transcribing" ? "Đang nghe lại..." :
                    phase === "thinking" || thinking ? "Đang nghĩ câu chửi..." : phase === "speaking" ? "Đang chửi..." : "..."}
                </div>
                {messages.length > 0 && (
                  <div className="max-w-md text-sm text-gray-400 text-center line-clamp-4 px-2">
                    {messages[messages.length - 1].content}
                  </div>
                )}
              </div>
              <div className="flex gap-3 pb-6">
                {phase === "speaking" && (
                  <button onClick={() => stopSpeaking()} className="px-5 py-3 rounded-full border border-gray-500 text-gray-200">
                    ⏭ Ngắt lời
                  </button>
                )}
                <button onClick={endCall} className="px-6 py-3 rounded-full bg-red-600 font-semibold">
                  Kết thúc
                </button>
              </div>
            </div>
          )}

          {/* Hộp xác nhận 18+ */}
          {askAdult && (
            <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4">
              <div className="w-full max-w-sm rounded-xl border border-rose-500/40 bg-gray-900 p-5 space-y-3">
                <div className="text-lg font-semibold text-rose-200">🤬 Chế độ Mất dạy (18+)</div>
                <p className="text-sm text-gray-300">
                  AI sẽ xưng mày – tao và chửi rất gắt. Nó vẫn không đụng tới vùng miền, tôn giáo, giới tính,
                  ngoại hình hay chuyện riêng tư của bạn.
                </p>
                <p className="text-sm text-gray-300">Bạn xác nhận đã đủ 18 tuổi và tự nguyện ăn chửi?</p>
                <div className="flex gap-2 pt-1">
                  <button onClick={confirmAdult}
                    className="flex-1 py-2 rounded bg-gradient-to-r from-rose-500 to-fuchsia-600 text-sm font-medium">
                    Tôi đủ 18, chửi đi
                  </button>
                  <button onClick={() => setAskAdult(false)}
                    className="flex-1 py-2 rounded border border-gray-600 text-sm text-gray-300">
                    Thôi, sợ rồi
                  </button>
                </div>
              </div>
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
