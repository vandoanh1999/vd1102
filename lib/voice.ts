"use client";

/* ───────────────────────── GHI ÂM + TỰ DỪNG KHI IM LẶNG ───────────────────────── */

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

function pickMime(): { mime: string; ext: string } {
  if (typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function") {
    for (const m of MIME_CANDIDATES) {
      if (MediaRecorder.isTypeSupported(m)) return { mime: m, ext: m.includes("mp4") ? "mp4" : m.includes("ogg") ? "ogg" : "webm" };
    }
  }
  return { mime: "", ext: "webm" };
}

export function voiceSupported(): boolean {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

export type RecordOptions = {
  /** Dừng tối đa sau bao lâu (ms). */
  maxMs?: number;
  /** Không nghe thấy tiếng nói trong khoảng này thì huỷ (ms). */
  noSpeechMs?: number;
  /** Im lặng bao lâu sau khi đã nói thì tự dừng (ms). */
  silenceMs?: number;
  /** Báo mức âm lượng 0..1 để vẽ hiệu ứng. */
  onLevel?: (v: number) => void;
};

export type Recording = { blob: Blob; filename: string };

/**
 * Ghi âm một lượt nói. Giữ micro mở giữa các lượt (chế độ gọi) để khỏi hỏi quyền liên tục;
 * gọi release() khi xong hẳn.
 */
export class VoiceRecorder {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  /** Lượt ghi đang chạy: mỗi lượt giữ cờ huỷ riêng để lượt cũ không "đè" lượt mới. */
  private session: { stop: () => void; cancel: () => void } | null = null;

  async start(opts: RecordOptions = {}): Promise<Recording | null> {
    const { maxMs = 60_000, noSpeechMs = 12_000, silenceMs = 1_300, onLevel } = opts;
    this.cancel();

    if (!this.stream || this.stream.getTracks().every(t => t.readyState === "ended")) {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    }
    const stream = this.stream;
    const { mime, ext } = pickMime();
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    const chunks: Blob[] = [];
    let cancelled = false;

    // Đo âm lượng để biết người dùng đã nói xong chưa.
    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!this.ctx || this.ctx.state === "closed") this.ctx = new AC();
    if (this.ctx.state === "suspended") await this.ctx.resume().catch(() => {});
    const source = this.ctx.createMediaStreamSource(stream);
    const analyser = this.ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const buf = new Uint8Array(analyser.fftSize);

    const startedAt = performance.now();
    let noise = 0, noiseSamples = 0;
    let spoke = false;
    let lastVoiceAt = 0;
    let timer: ReturnType<typeof setInterval> | undefined;

    const session = {
      stop: () => { if (rec.state === "recording") rec.stop(); },
      cancel: () => { cancelled = true; if (rec.state === "recording") rec.stop(); },
    };
    this.session = session;

    const result = new Promise<Recording | null>(resolve => {
      rec.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
      rec.onstop = () => {
        clearInterval(timer);
        try { source.disconnect(); } catch { /* đã ngắt */ }
        if (this.session === session) this.session = null;
        if (cancelled || !spoke || chunks.length === 0) { resolve(null); return; }
        const type = rec.mimeType || mime || "audio/webm";
        resolve({ blob: new Blob(chunks, { type }), filename: `voice.${ext}` });
      };
    });

    const tick = () => {
      if (rec.state !== "recording") { clearInterval(timer); return; }
      analyser.getByteTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / buf.length);
      const now = performance.now();
      const elapsed = now - startedAt;

      // 300ms đầu: đo tiếng ồn nền để đặt ngưỡng phù hợp từng phòng.
      if (elapsed < 300) { noise += rms; noiseSamples++; }
      const threshold = Math.max(0.02, (noiseSamples ? noise / noiseSamples : 0.01) * 2.5);

      if (rms > threshold && elapsed >= 300) { spoke = true; lastVoiceAt = now; }
      onLevel?.(Math.min(1, rms / (threshold * 3)));

      const silentTooLong = spoke && now - lastVoiceAt > silenceMs;
      const neverSpoke = !spoke && elapsed > noSpeechMs;
      if (silentTooLong || neverSpoke || elapsed > maxMs) { clearInterval(timer); rec.stop(); }
    };

    rec.start(250);
    // setInterval thay vì requestAnimationFrame: vẫn chạy khi màn hình điện thoại tối/khác tab.
    timer = setInterval(tick, 50);
    return result;
  }

  /** Dừng và lấy đoạn đã ghi (người dùng bấm dừng tay). */
  stop() { this.session?.stop(); }

  /** Huỷ lượt đang ghi, bỏ dữ liệu. */
  cancel() { this.session?.cancel(); this.session = null; }

  /** Tắt micro hẳn (đèn ghi âm trên điện thoại tắt). */
  release() {
    this.cancel();
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}

export async function transcribe(rec: Recording): Promise<{ text: string; error?: string }> {
  const fd = new FormData();
  fd.append("audio", rec.blob, rec.filename);
  try {
    const r = await fetch("/api/stt", { method: "POST", body: fd });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { text: "", error: data.error || "Không nhận dạng được giọng nói." };
    if (data.unclear || !data.text) return { text: "", error: "Không nghe rõ, nói lại to hơn chút." };
    return { text: data.text };
  } catch {
    return { text: "", error: "Mất kết nối khi gửi giọng nói." };
  }
}

/* ───────────────────────── ĐỌC TO BẰNG GIỌNG CÓ SẴN TRONG MÁY ───────────────────────── */

function synth(): SpeechSynthesis | null {
  return typeof window !== "undefined" && "speechSynthesis" in window ? window.speechSynthesis : null;
}

async function voices(): Promise<SpeechSynthesisVoice[]> {
  const s = synth();
  if (!s) return [];
  const now = s.getVoices();
  if (now.length) return now;
  // Một số trình duyệt nạp danh sách giọng chậm.
  return new Promise(resolve => {
    const done = () => resolve(s.getVoices());
    s.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, 1_200);
  });
}

async function vietnameseVoice(): Promise<SpeechSynthesisVoice | null> {
  const list = await voices();
  const vi = list.filter(v => v.lang?.toLowerCase().replace("_", "-").startsWith("vi"));
  // Ưu tiên giọng online (thường tự nhiên hơn) rồi đến giọng Google/Microsoft.
  return vi.find(v => !v.localService) || vi.find(v => /google|microsoft|linh|an/i.test(v.name)) || vi[0] || null;
}

export async function hasVietnameseVoice(): Promise<boolean> {
  return !!(await vietnameseVoice());
}

/** iOS chỉ cho đọc khi được kích hoạt bởi một lần chạm → gọi hàm này ngay trong sự kiện bấm nút. */
export function unlockSpeech() {
  const s = synth();
  if (!s) return;
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  s.speak(u);
}

/** Bỏ markdown, link, emoji để máy đọc tự nhiên. */
export function toSpeakable(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " (đoạn code, xem trên màn hình) ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_#>|~]/g, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Cắt thành đoạn ngắn: Chrome hay tự ngắt khi một câu đọc quá ~15 giây. */
function chunks(text: string, max = 180): string[] {
  const parts = text.match(/[^.!?…;:\n]+[.!?…;:\n]*/g) || [text];
  const out: string[] = [];
  let cur = "";
  for (const p of parts) {
    if ((cur + p).length > max && cur) { out.push(cur.trim()); cur = ""; }
    if (p.length > max) {
      for (let i = 0; i < p.length; i += max) out.push(p.slice(i, i + max).trim());
    } else cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}

let speakToken = 0;

export function stopSpeaking() {
  speakToken++;
  synth()?.cancel();
}

/** Đọc to văn bản; trả về khi đọc xong (hoặc bị dừng). */
export async function speak(md: string, opts: { rate?: number; pitch?: number } = {}): Promise<void> {
  const s = synth();
  const text = toSpeakable(md);
  if (!s || !text) return;
  stopSpeaking();
  const token = speakToken;
  const voice = await vietnameseVoice();
  for (const part of chunks(text)) {
    if (token !== speakToken) return;
    await new Promise<void>(resolve => {
      const u = new SpeechSynthesisUtterance(part);
      u.lang = "vi-VN";
      if (voice) u.voice = voice;
      u.rate = opts.rate ?? 1.05;
      u.pitch = opts.pitch ?? 1;
      u.onend = () => resolve();
      u.onerror = () => resolve();
      s.speak(u);
    });
  }
}
