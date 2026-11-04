"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import MessageBubble, { type ChatMessage } from "@/components/MessageBubble";
import Sidebar from "@/components/Sidebar";
import type { Activity, Mood } from "@/components/MoodFace";
import { detectTone, PERSONAS, SEEN_MARK, type Level, type Persona } from "@/lib/persona";
import { getConv, saveConv, newConvId, type StoredMessage, type StoredMood } from "@/lib/localConvs";
import {
  VoiceRecorder, transcribe, speak, stopSpeaking, unlockSpeech, hasVietnameseVoice, voiceSupported,
} from "@/lib/voice";

// Gương mặt 3D chỉ chạy trên trình duyệt (WebGL), tải riêng để trang hiện nhanh.
const MoodFace = dynamic(() => import("@/components/MoodFace"), { ssr: false });

type Phase = "idle" | "listening" | "transcribing" | "thinking" | "speaking";

const NO_VI_VOICE =
  "Máy bạn chưa có giọng đọc tiếng Việt nên AI sẽ đọc lơ lớ. Android: Cài đặt → Chuyển văn bản sang lời nói → " +
  "công cụ của Google → tải giọng Tiếng Việt. iPhone: Cài đặt → Trợ năng → Nội dung được đọc → Giọng nói → Tiếng Việt.";

/** Màu nền theo tâm trạng — khớp với nền của gương mặt 3D. */
const MOOD_BG: Record<Mood, string> = { hien: "#211f1d", khia: "#201c19", gat: "#0d0707", care: "#1b1f24" };
const MOOD_ACCENT: Record<Mood, string> = { hien: "#ffd27a", khia: "#ffad4d", gat: "#ff3b3b", care: "#9fd0ff" };

const GREETING: Record<Persona, { title: string; sub: string }> = {
  ungho: { title: "Người yêu mới", sub: "Cái gì cũng chiều, nói gì cũng khen." },
  phanbien: { title: "Người yêu cũ", sub: "Cái gì cũng cãi. Hỏi nhảm là bị seen." },
};

const SUGGESTIONS: Record<Persona, string[]> = {
  ungho: [
    "Hôm nay tao mệt quá",
    "Tao định nghỉ việc mở quán cà phê",
    "Tao muốn học lập trình ở tuổi 30",
    "Tao định cắt tóc kiểu mới",
  ],
  phanbien: [
    "Alo",
    "Tao định quay lại với mày",
    "Tao định nghỉ việc mở quán cà phê",
    "Mày giúp tao được không",
  ],
};

// localStorage có thể bị chặn (ẩn danh) → luôn bọc try/catch.
const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* bỏ qua */ } },
};

export default function ChatBox() {
  // Dạng ref: vòng lặp chế độ gọi chạy lâu, không được đọc giá trị cũ của state.
  const convRef = useRef<string>("");
  // Tâm trạng SDE của NYC trong cuộc hiện tại (máy chủ tính, trình duyệt giữ hộ).
  const moodRef = useRef<StoredMood | undefined>(undefined);
  const [anger, setAnger] = useState<number | null>(null);
  const [debug, setDebug] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  // null = chưa đọc xong bộ nhớ máy (tránh hộp xác nhận nháy lên rồi tắt)
  const [adult, setAdult] = useState<boolean | null>(null);
  const [declined, setDeclined] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [persona, setPersona] = useState<Persona>("ungho");
  const personaRef = useRef<Persona>("ungho");
  const [drawer, setDrawer] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);

  // giọng nói
  const [phase, setPhase] = useState<Phase>("idle");
  const [micLevel, setMicLevel] = useState(0);
  const [speakOn, setSpeakOn] = useState(false);
  const [callMode, setCallMode] = useState(false);
  const [canVoice, setCanVoice] = useState(false);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const callRef = useRef(false);
  const speakOnRef = useRef(false);
  const toneRef = useRef<Level>("khia");
  const adultRef = useRef(false);
  useEffect(() => { speakOnRef.current = speakOn; }, [speakOn]);
  useEffect(() => { adultRef.current = adult === true; }, [adult]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Nhớ cấp độ, xác nhận 18+ và "Đọc to" của người dùng trên máy này.
  useEffect(() => {
    setAdult(store.get("vnai.adult") === "1");
    try { setDebug(new URLSearchParams(window.location.search).has("debug")); } catch { /* bỏ qua */ }
    const p = store.get("vnai.persona");
    if (p === "ungho" || p === "phanbien") { setPersona(p); personaRef.current = p; }
    setSpeakOn(store.get("vnai.speak") === "1");
    setCanVoice(voiceSupported());
    recorderRef.current = new VoiceRecorder();
    return () => { recorderRef.current?.release(); stopSpeaking(); callRef.current = false; };
  }, []);

  const openConversation = useCallback((id: string | null) => {
    stopSpeaking();
    const c = id ? getConv(id) : undefined;
    convRef.current = c ? c.id : newConvId();
    moodRef.current = c?.mood;
    setAnger(c?.mood ? c.mood.z[0] : null);
    setMessages(c ? c.messages : []);
    setDrawer(false);
  }, []);

  // Mỗi lần mở trang là một cuộc mới; 5 cuộc gần nhất vẫn nằm trong Lịch sử trên máy này.
  useEffect(() => {
    openConversation(null);
    const onOpen = (e: Event) => openConversation((e as CustomEvent<string | null>).detail);
    window.addEventListener("vnai:open", onOpen);
    return () => window.removeEventListener("vnai:open", onOpen);
  }, [openConversation]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages]);

  // Ô nhập tự giãn theo nội dung
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, [input]);

  /** Đổi nhân cách: bắt đầu cuộc mới để AI không lẫn giọng giữa hai nhân cách. */
  const pickPersona = (p: Persona) => {
    if (p === personaRef.current) return;
    setPersona(p); personaRef.current = p; store.set("vnai.persona", p);
    if (messagesRef.current.length) openConversation(null);
  };

  const confirmAdult = () => { setAdult(true); store.set("vnai.adult", "1"); };

  const fail = (msg: string) => setMessages(prev => [...prev, { role: "error", content: msg }]);

  /** Gửi câu hỏi, stream câu trả lời lên màn hình; trả về toàn văn câu trả lời ("" nếu lỗi). */
  const send = async (text?: string): Promise<string> => {
    const prompt = (text ?? input).trim();
    if (!prompt || thinking) return "";
    setThinking(true);
    let ai = "";
    let ok = false;
    let crisis = false;
    let seen = false;
    // Lịch sử cuộc hiện tại (chỉ câu hỏi/trả lời) gửi kèm để AI nhớ ngữ cảnh.
    const past: StoredMessage[] = messagesRef.current
      .filter((m): m is StoredMessage => m.role === "user" || m.role === "assistant")
      .map(m => ({ role: m.role, content: m.content, ...(m.crisis ? { crisis: true } : {}), ...(m.seen ? { seen: true } : {}) }));
    const convId = convRef.current;
    setMessages(prev => [...prev, { role: "user", content: prompt }]);
    setInput("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          // Lượt NYC "đã xem" gửi kèm dưới dạng mã seen để AI nhớ là nó từng lờ đi.
          history: past.flatMap(m => m.seen
            ? [{ role: m.role, content: m.content }, { role: "assistant", content: SEEN_MARK }]
            : [{ role: m.role, content: m.content }]).slice(-20),
          adult: adultRef.current,
          persona: personaRef.current,
          mood: moodRef.current,
        }),
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
          } else if (payload.type === "seen") {
            seen = true;
            setMessages(prev => {
              const cp = [...prev];
              for (let k = cp.length - 1; k >= 0; k--) if (cp[k].role === "user") { cp[k] = { ...cp[k], seen: true }; break; }
              return cp;
            });
          } else if (payload.type === "done") {
            ok = true;
            if (payload.mood) { moodRef.current = payload.mood; setAnger(payload.mood.z[0]); }
            crisis = !!payload.crisis;
            if (typeof payload.remaining === "number" && payload.remaining >= 0) setRemaining(payload.remaining);
            if (crisis) setMessages(prev => {
              const cp = [...prev]; const last = cp[cp.length - 1];
              if (last?.role === "assistant") cp[cp.length - 1] = { ...last, crisis: true };
              return cp;
            });
          } else if (payload.type === "error") {
            if (payload.mood) { moodRef.current = payload.mood; setAnger(payload.mood.z[0]); }
            fail(payload.message || "Có lỗi khi gọi AI.");
          }
        }
      }
    } catch {
      fail("Mất kết nối. Kiểm tra mạng rồi thử lại.");
    } finally {
      setThinking(false);
      // Lưu cuộc trò chuyện xuống máy (kể cả khi lỗi, để không mất câu hỏi).
      saveConv(convId, [
        ...past,
        { role: "user", content: prompt, ...(seen ? { seen: true } : {}) },
        ...(ai ? [{ role: "assistant" as const, content: ai, ...(crisis ? { crisis: true } : {}) }] : []),
      ], moodRef.current);
    }
    return ok ? ai : "";
  };

  /* ───────────── Giọng nói ───────────── */

  const speakAnswer = async (text: string) => {
    setPhase("speaking");
    await speak(text, { rate: toneRef.current === "gat" ? 1.12 : 1.05 });
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

  const copy = async (i: number) => {
    try { await navigator.clipboard.writeText(messages[i].content); setCopied(i); setTimeout(() => setCopied(null), 1500); }
    catch { /* trình duyệt chặn clipboard */ }
  };

  /* ───────────── Gương mặt: tâm trạng + hành động ───────────── */

  const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
  // Không khí tự đoán từ lời người dùng: lịch sự → mặt cười, bình thường → nhếch mép, chửi bậy → mắt đỏ.
  const tone: Level = useMemo(() => {
    const said = messages.filter(m => m.role === "user").map(m => m.content);
    return said.length ? detectTone(said[said.length - 1], said.slice(0, -1)) : "khia";
  }, [messages]);
  toneRef.current = tone;
  // Ủng hộ → luôn mặt cười; Phản biện → nhếch mép, bị chửi lại thì mắt đỏ.
  const mood: Mood = lastAssistant?.crisis ? "care"
    : persona === "ungho" ? "hien"
      : anger !== null ? (anger >= 0.6 ? "gat" : "khia")
        : tone === "gat" ? "gat" : "khia";
  // Độ giận liên tục 0..1 cho mặt 3D (chỉ NYC): nội suy dần từ nhếch mép sang mắt đỏ.
  const faceAnger = persona === "phanbien" && !lastAssistant?.crisis ? (anger ?? (tone === "gat" ? 0.8 : 0.35)) : null;
  const streaming = thinking && messages[messages.length - 1]?.role === "assistant";
  const activity: Activity =
    phase === "listening" ? "listening"
      : phase === "speaking" || streaming ? "speaking"
        : phase === "transcribing" || phase === "thinking" || thinking ? "thinking"
          : "idle";
  const empty = messages.length === 0;
  const bg = MOOD_BG[mood];
  const accent = MOOD_ACCENT[mood];
  const greet = GREETING[persona];
  const hasText = !!input.trim();

  return (
    <div className="relative h-dvh flex overflow-hidden text-[#ece8e1] transition-colors duration-700"
      style={{ background: bg, ["--accent" as any]: accent }}>
      <Sidebar open={drawer} onClose={() => setDrawer(false)} currentId={convRef.current} />

      <main className="relative flex-1 min-w-0 flex flex-col">
        {/* Gương mặt 3D phía sau */}
        <div className="absolute inset-0 z-0 pointer-events-none">
          <MoodFace mood={mood} activity={activity} level={micLevel} prominent={empty || callMode} anger={faceAnger} />
        </div>
        {/* Lớp mờ để chữ dễ đọc khi đang trò chuyện */}
        <div className="absolute inset-0 z-0 pointer-events-none transition-opacity duration-700"
          style={{
            opacity: empty || callMode ? 0 : 1,
            background: `linear-gradient(to bottom, ${bg}99 0%, ${bg}d9 40%, ${bg}f2 100%)`,
          }} />

        {/* Thanh trên */}
        <header className="relative z-10 h-14 shrink-0 flex items-center gap-2 px-3">
          <button onClick={() => setDrawer(true)} className="md:hidden w-9 h-9 grid place-items-center rounded-lg hover:bg-white/5" aria-label="Mở lịch sử">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h10" /></svg>
          </button>
          <div className="flex-1 flex justify-center">
            <div className="inline-flex p-1 rounded-full bg-black/30 border border-white/10 backdrop-blur" role="tablist" aria-label="Chọn nhân cách">
              {(Object.keys(PERSONAS) as Persona[]).map(p => (
                <button key={p} role="tab" aria-selected={persona === p} title={PERSONAS[p].desc}
                  onClick={() => pickPersona(p)}
                  className={`h-8 px-4 rounded-full text-[13px] transition-colors ${persona === p ? "text-black font-medium" : "text-[#cfc9c0] hover:text-white"}`}
                  style={persona === p ? { background: accent } : undefined}>
                  {PERSONAS[p].label}
                </button>
              ))}
            </div>
          </div>
          {!empty && (
            <button onClick={() => openConversation(null)} title="Cuộc mới"
              className="w-9 h-9 grid place-items-center rounded-lg hover:bg-white/5" aria-label="Cuộc mới">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            </button>
          )}
        </header>

        {/* Nội dung */}
        <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto">
          {empty ? (
            <div className="h-full flex flex-col items-center justify-end pb-6 px-4 text-center">
              <h1 className="font-serif text-[28px] sm:text-4xl leading-tight mb-2" style={{ textShadow: "0 2px 18px rgba(0,0,0,.6)" }}>
                {greet.title}
              </h1>
              <p className="text-sm text-[#a39e96] mb-5">{greet.sub}</p>
              <div className="flex flex-wrap justify-center gap-2 max-w-xl">
                {SUGGESTIONS[persona].map((s, i) => (
                  <button key={s} onClick={() => sendTyped(s)} disabled={thinking}
                    className={`${i >= 3 ? "hidden sm:inline-block" : ""} text-[13px] px-3.5 py-2 rounded-xl border border-white/10 bg-black/30 backdrop-blur hover:bg-white/10 transition-colors`}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-4 space-y-6">
              {messages.map((m, i) => (
                <MessageBubble key={i} m={m}
                  onSpeak={m.role === "assistant" ? () => { unlockSpeech(); speakAnswer(m.content); } : undefined}
                  onCopy={m.role === "assistant" ? () => copy(i) : undefined}
                  copied={copied === i}
                  streaming={streaming && i === messages.length - 1} />
              ))}
              {thinking && messages[messages.length - 1]?.role === "user" && (
                <div className="flex items-center gap-3 text-sm text-[#a39e96]">
                  <span className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ background: accent }} />
                  Đang nghĩ...
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Khung soạn tin */}
        <div className="relative z-10 shrink-0 px-3 pb-3 pt-1">
          <div className="max-w-3xl mx-auto">
            <div className="rounded-3xl border border-white/10 bg-[#2b2926]/90 backdrop-blur-md shadow-[0_8px_30px_rgba(0,0,0,.35)] focus-within:border-white/20 transition-colors">
              <textarea ref={inputRef} value={input} rows={1}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (hasText) sendTyped(); }
                }}
                placeholder={phase === "listening" ? "Đang nghe..." : phase === "transcribing" ? "Đang chép lời..." : "Hỏi VNAI bất cứ điều gì..."}
                disabled={thinking || phase !== "idle"} maxLength={4000}
                className="w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-6 placeholder:text-[#8a857d] focus:outline-none disabled:opacity-60" />
              <div className="flex items-center gap-1.5 px-2.5 pb-2.5">
                <button onClick={toggleSpeak} title={speakOn ? "Tắt đọc to" : "Bật đọc to câu trả lời"}
                  className={`w-8 h-8 grid place-items-center rounded-full border transition-colors ${speakOn ? "border-[var(--accent)] text-[var(--accent)]" : "border-white/10 text-[#a39e96] hover:bg-white/5"}`}>
                  {speakOn
                    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 5 6 9H2v6h4l5 4z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" /></svg>
                    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M11 5 6 9H2v6h4l5 4z" /><path d="m22 9-6 6M16 9l6 6" /></svg>}
                </button>

                <div className="flex-1" />

                {canVoice && (
                  <button onClick={micTap} disabled={thinking || callMode || (phase !== "idle" && phase !== "listening")}
                    title="Bấm để nói (tự dừng khi bạn im lặng)" aria-label="Nói"
                    className={`w-9 h-9 grid place-items-center rounded-full transition-all disabled:opacity-40 ${phase === "listening" && !callMode ? "text-black" : "hover:bg-white/5"}`}
                    style={phase === "listening" && !callMode ? { background: accent, boxShadow: `0 0 0 ${3 + micLevel * 12}px ${accent}40` } : undefined}>
                    {phase === "transcribing" && !callMode
                      ? <span className="w-4 h-4 rounded-full border-2 border-current border-t-transparent animate-spin" />
                      : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>}
                  </button>
                )}

                {hasText || !canVoice ? (
                  <button onClick={() => sendTyped()} disabled={thinking || !hasText} aria-label="Gửi"
                    className="w-9 h-9 grid place-items-center rounded-full text-black disabled:opacity-30 transition-opacity"
                    style={{ background: accent }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
                  </button>
                ) : (
                  <button onClick={startCall} disabled={thinking || callMode || phase !== "idle"} title="Gọi rảnh tay" aria-label="Gọi"
                    className="h-9 px-3 rounded-full flex items-center gap-1.5 text-black text-[13px] font-medium disabled:opacity-40"
                    style={{ background: accent }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M2 12h2M6 8v8M10 5v14M14 8v8M18 10v4M22 12h0" /></svg>
                    Gọi
                  </button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-[#8a857d] text-center mt-2">
              VNAI có thể sai, thông tin quan trọng hãy kiểm tra lại.
              {remaining !== null && <> · Còn {remaining} câu hôm nay</>}
              {debug && persona === "phanbien" && moodRef.current && (
                <> · giận {Math.round(moodRef.current.z[0] * 100)} · thương {Math.round(moodRef.current.z[1] * 100)} · chán {Math.round(moodRef.current.z[2] * 100)}</>
              )}
            </p>
          </div>
        </div>

        {/* Chế độ gọi: mặt to giữa màn hình, chỉ còn trạng thái + nút */}
        {callMode && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-end pb-10 gap-6" style={{ background: "transparent" }}>
            <div className="text-center" style={{ textShadow: "0 2px 16px rgba(0,0,0,.8)" }}>
              <div className="text-xl font-medium">
                {activity === "listening" ? "Đang nghe..." : activity === "thinking" ? "Đang nghĩ câu chửi..." :
                  activity === "speaking" ? "Đang chửi..." : "..."}
              </div>
              <div className="text-xs text-[#a39e96] mt-1">Nói xong im khoảng 1 giây là nó tự trả lời</div>
            </div>
            <div className="flex gap-3">
              {phase === "speaking" && (
                <button onClick={() => stopSpeaking()} className="h-12 px-5 rounded-full border border-white/20 bg-black/40 backdrop-blur">
                  Ngắt lời
                </button>
              )}
              <button onClick={endCall} className="h-12 px-6 rounded-full bg-red-600 font-semibold">Kết thúc</button>
            </div>
          </div>
        )}
      </main>

      {/* Xác nhận độ tuổi — hiện một lần trên mỗi máy */}
      {adult === false && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm grid place-items-center p-4">
          <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-[#1f1d1b] p-6 space-y-3">
            {declined ? (
              <>
                <div className="text-lg font-semibold">Hẹn gặp lại</div>
                <p className="text-sm text-[#cfc9c0]">VNAI chỉ dành cho người từ 18 tuổi trở lên.</p>
              </>
            ) : (
              <>
                <div className="text-lg font-semibold">Trước khi bắt đầu</div>
                <p className="text-sm text-[#cfc9c0] leading-6">
                  VNAI nói chuyện thẳng, xưng mày – tao, cà khịa và có thể văng tục. Nó không xúc phạm vùng miền,
                  tôn giáo, giới tính hay ngoại hình của bất kỳ ai.
                </p>
                <p className="text-sm text-[#cfc9c0]">Dịch vụ chỉ dành cho người từ 18 tuổi trở lên.</p>
                <div className="flex gap-2 pt-2">
                  <button onClick={confirmAdult} className="flex-1 h-11 rounded-full text-black text-sm font-medium" style={{ background: accent }}>
                    Tôi đủ 18 tuổi
                  </button>
                  <button onClick={() => setDeclined(true)} className="flex-1 h-11 rounded-full border border-white/15 text-sm">
                    Rời đi
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
