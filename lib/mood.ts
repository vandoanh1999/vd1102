/**
 * mood.ts — Tâm trạng "sống" của NYC, mô hình bằng phương trình vi phân ngẫu nhiên (SDE).
 *
 * Chuyển từ NeuralSDE.forward trong dự án hypernet-sde-learner (vandoanh1999):
 *     dW = randn * sqrt(dt)
 *     z  = z + drift(z) * dt + diffusion(z) * dW          (Euler–Maruyama)
 *
 * Ở đây z là vector tâm trạng 3 chiều [giận, thương, chán] ∈ [0,1]:
 *   - drift(z)     = θ ⊙ (μ − z)          → tự nguôi dần về mức nền (quá trình Ornstein–Uhlenbeck)
 *   - diffusion(z) = σ ⊙ z ⊙ (1 − z)      → dao động ngẫu nhiên nhỏ, tắt dần ở hai biên 0 và 1
 *   - jump(e)      = bước nhảy khi người dùng nhắn tin (jump-diffusion)
 *
 * Giai đoạn 2 (khi có dữ liệu 👍/👎): thay drift/diffusion cố định bằng 2 mạng MLP Tanh
 * huấn luyện từ class NeuralSDE gốc, xuất trọng số ra JSON và chạy ở hàm driftNet() bên dưới.
 */

export type MoodVec = [anger: number, affection: number, boredom: number];
export type MoodState = { z: MoodVec; t: number };   // t: thời điểm cập nhật cuối (ms)

export type MoodEvent = "pointless" | "insult" | "argue" | "sweet" | "serious" | "repeat" | "neutral" | "crisis";

/** Mức nền NYC lúc "bình thường": vẫn hơi cay, ít thương, hơi chán. */
const MU: MoodVec = [0.35, 0.15, 0.3];
/** Tốc độ nguôi (1/giây): giận nguôi một nửa sau ~10 phút, thương ~30 phút, chán ~5 phút. */
const LN2 = Math.log(2);
const THETA: MoodVec = [LN2 / 600, LN2 / 1800, LN2 / 300];
/** Độ "thất thường" (cường độ nhiễu). */
const SIGMA: MoodVec = [0.06, 0.03, 0.06];

/** Bước nhảy theo loại tin nhắn: [giận, thương, chán]. */
const JUMPS: Record<MoodEvent, MoodVec> = {
  pointless: [+0.15, -0.02, +0.15],
  insult:    [+0.25, -0.05,  0.00],
  argue:     [+0.10,  0.00, -0.05],
  sweet:     [-0.25, +0.15, -0.05],
  serious:   [-0.05,  0.00, -0.08],
  repeat:    [+0.10, -0.02, +0.20],
  neutral:   [ 0.00,  0.00, +0.03],
  crisis:    [ 0.00,  0.00,  0.00], // xử lý riêng: đặt lại hẳn
};

const MAX_GAP_S = 4 * 3600;   // vắng quá 4 tiếng coi như đã nguôi hẳn
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/** Số ngẫu nhiên phân phối chuẩn N(0,1) (Box–Muller). */
function gauss(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function initialMood(now = Date.now()): MoodState {
  return { z: [...MU] as MoodVec, t: now };
}

/** Kiểm tra dữ liệu tâm trạng trình duyệt gửi lên; sai dạng thì bắt đầu lại từ mức nền. */
export function parseMood(raw: unknown, now = Date.now()): MoodState {
  const m = raw as Partial<MoodState> | null;
  const ok = m && Array.isArray(m.z) && m.z.length === 3 && m.z.every(x => typeof x === "number" && x >= 0 && x <= 1)
    && typeof m.t === "number" && m.t <= now + 60_000 && m.t > now - 30 * 86400_000;
  return ok ? { z: [m!.z![0], m!.z![1], m!.z![2]] as MoodVec, t: m!.t! } : initialMood(now);
}

/** drift f(z). Giai đoạn 1: OU cố định. (Giai đoạn 2: thay bằng MLP học được.) */
function drift(z: MoodVec): MoodVec {
  return z.map((zi, i) => THETA[i] * (MU[i] - zi)) as MoodVec;
}

/** diffusion g(z): nhiễu lớn nhất ở giữa, bằng 0 ở hai biên → không bao giờ vọt ra ngoài [0,1] quá xa. */
function diffusion(z: MoodVec): MoodVec {
  return z.map((zi, i) => SIGMA[i] * Math.sqrt(THETA[i]) * 4 * zi * (1 - zi)) as MoodVec;
}

/**
 * Tiến hoá tâm trạng qua khoảng thời gian `seconds` — đúng vòng lặp Euler–Maruyama của NeuralSDE.forward.
 * Số bước tự tăng theo độ dài khoảng thời gian để bước nhảy θ·dt luôn nhỏ (ổn định số học).
 */
export function evolve(z: MoodVec, seconds: number, minSteps = 10): MoodVec {
  const T = Math.min(Math.max(0, seconds), MAX_GAP_S);
  if (T === 0) return z;
  const maxTheta = Math.max(...THETA);
  const steps = Math.min(400, Math.max(minSteps, Math.ceil((maxTheta * T) / 0.05)));
  const dt = T / steps;
  let cur = z;
  for (let k = 0; k < steps; k++) {
    const f = drift(cur);
    const g = diffusion(cur);
    cur = cur.map((zi, i) => clamp01(zi + f[i] * dt + g[i] * gauss() * Math.sqrt(dt))) as MoodVec;
  }
  return cur;
}

/** Bước nhảy khi nhận tin nhắn mới. */
export function jump(z: MoodVec, e: MoodEvent): MoodVec {
  if (e === "crisis") return [0, 0.6, 0];
  const j = JUMPS[e];
  return z.map((zi, i) => clamp01(zi + j[i])) as MoodVec;
}

/** Một lượt đầy đủ: nguôi theo thời gian vắng mặt → nhảy theo tin nhắn mới. */
export function step(prev: MoodState, e: MoodEvent, now = Date.now()): MoodState {
  const z = jump(evolve(prev.z, (now - prev.t) / 1000), e);
  return { z, t: now };
}

/** Xác suất NYC "seen không rep" — tăng theo độ giận và độ chán. Câu nghiêm túc / khủng hoảng không bao giờ bị seen. */
export function seenProbability(z: MoodVec, e: MoodEvent): number {
  const [anger, , boredom] = z;
  if (e === "serious" || e === "crisis") return 0;
  if (e === "pointless" || e === "repeat") return clamp01(0.2 + 0.7 * anger + 0.3 * boredom);
  if (anger > 0.85) return Math.min(0.45, (anger - 0.85) * 3);
  return 0;
}

/** Chỉ dẫn giọng điệu cho AI theo tâm trạng hiện tại (chèn vào lệnh hệ thống). */
export function moodInstruction(z: MoodVec): string {
  const [anger, affection, boredom] = z;
  const pct = (x: number) => Math.round(x * 100);
  const lines = [`TÂM TRẠNG HIỆN TẠI CỦA NYC: giận ${pct(anger)}/100 · còn thương ${pct(affection)}/100 · chán ${pct(boredom)}/100.`];
  if (anger < 0.3) lines.push("→ Đang dịu: cà khịa nhẹ, ít văng tục, thậm chí hơi tử tế (nhưng chối là không phải).");
  else if (anger < 0.6) lines.push("→ Bình thường: cãi, cà khịa, tục vừa phải.");
  else if (anger < 0.85) lines.push("→ Đang gắt: câu ngắn cộc lốc, văng tục nhiều hơn, cãi cay hơn.");
  else lines.push("→ Đang giận thật: trả lời cực cụt, đúng 1 câu, lạnh tanh; câu nào nhảm thì chỉ trả mã đã xem.");
  if (boredom > 0.6) lines.push("→ Đang chán người dùng: trả lời uể oải, kiểu 'ừ', 'rồi sao', 'thế à'.");
  if (affection > 0.5) lines.push("→ Lộ ra chút còn thương: thỉnh thoảng quan tâm một câu rồi chữa ngượng ngay.");
  return lines.join("\n");
}

/* ─────────── Phân loại tin nhắn thành sự kiện tâm trạng ─────────── */

function fold(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d");
}

const SWEET = ["xin lỗi", "xin loi", "sorry", "thương", "yêu", "nhớ mày", "nhớ em", "nhớ anh", "dễ thương", "đáng yêu", "giỏi quá", "đỉnh quá", "hay quá", "cảm ơn", "cám ơn", "tha lỗi", "làm lành"];
const ARGUE = ["không phải", "sai rồi", "mày sai", "đéo phải", "deo phai", "cãi", "vô lý", "nói sai", "nhảm", "xạo", "điêu", "bịa"];
const QUESTION = ["là gì", "như thế nào", "thế nào", "tại sao", "vì sao", "cách", "bao nhiêu", "ở đâu", "khi nào", "làm sao", "có nên", "giải thích", "hướng dẫn", "viết", "tính", "dịch"];

/**
 * Phân loại thô bằng từ khoá (giai đoạn 1). Các hàm nhận dạng tục / nhảm / khủng hoảng
 * được truyền vào từ persona.ts để dùng chung một chỗ.
 */
export function classifyMessage(
  text: string,
  previousUser: string | undefined,
  helpers: { isPointless: (s: string) => boolean; isHot: (s: string) => boolean; isCrisis: (s: string) => boolean },
): MoodEvent {
  if (helpers.isCrisis(text)) return "crisis";
  const lower = text.normalize("NFC").toLowerCase().trim();
  if (previousUser && fold(previousUser).trim() === fold(lower)) return "repeat";
  if (helpers.isPointless(text)) return "pointless";
  if (helpers.isHot(text)) return "insult";
  if (SWEET.some(w => lower.includes(w))) return "sweet";
  if (ARGUE.some(w => lower.includes(w))) return "argue";
  if (lower.includes("?") || QUESTION.some(w => lower.includes(w))) return lower.length >= 8 ? "serious" : "pointless";
  if (lower.length <= 4) return "pointless";
  return "neutral";
}
