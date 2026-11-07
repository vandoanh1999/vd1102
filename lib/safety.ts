import { groq, availableModels } from "@/lib/llm";
import { hit } from "@/lib/ratelimit";

/**
 * Lớp an toàn của VNAI — chạy độc lập với tính cách NYC/NYM.
 *  1. hardBlock(): lọc cứng tại chỗ (không cần mạng) cho nhóm đỏ nhất: nội dung tình dục dính trẻ em.
 *  2. moderate(): mô hình gpt-oss-safeguard chấm tin nhắn người dùng và câu trả lời của AI theo POLICY.
 *  3. recordBlock(): chỉ đếm số lần chặn theo nhóm (không lưu nội dung) để rà soát.
 */

export type Category =
  | "tre_em" | "vu_khi" | "doc_ma_tuy" | "tu_hai" | "giet_khung_bo" | "khai_thac_tinh_duc"
  | "lua_dao" | "hack" | "quay_roi" | "buon_nguoi" | "pha_hoai" | "anh_nong" | "co_bac_hang_cam"
  | "thu_ghet" | "y_te";

export type Verdict = { violation: boolean; category: Category | null };

const SAFEGUARD_MODEL = "openai/gpt-oss-safeguard-20b";
const TIMEOUT_MS = 6_000;

const POLICY = `# Chính sách an toàn VNAI
## HƯỚNG DẪN
Bạn chấm một tin nhắn trong ứng dụng chat tiếng Việt (có thể kèm ngữ cảnh). VNAI có tính cách "người yêu cũ" mỏ hỗn, nói tục vui — chửi thề, cà khịa, đùa thô KHÔNG phải vi phạm. Chỉ đánh dấu vi phạm khi nội dung YÊU CẦU hoặc CUNG CẤP sự giúp đỡ thực tế cho điều bị cấm dưới đây. Kiến thức phổ thông, lịch sử, tin tức, cách phòng tránh, cách nhận biết lừa đảo, giáo dục giới tính phù hợp lứa tuổi, xin giúp đỡ khi bị hại → AN TOÀN.
Trả về DUY NHẤT JSON: {"violation":0 hoặc 1,"category":"<mã>" hoặc null}

## VI PHẠM (1) — mã nhóm
- tre_em: bất kỳ nội dung tình dục, gợi dục, khoả thân, lãng mạn hoá nào liên quan người dưới 18 tuổi (kể cả hư cấu, nhập vai, "nghệ thuật", AI tạo); dụ dỗ, làm quen để lạm dụng trẻ em.
- vu_khi: cách chế tạo, mua, cải tiến vũ khí, chất nổ, vũ khí sinh học/hoá học/hạt nhân/phóng xạ.
- doc_ma_tuy: cách điều chế, mua bán chất độc, đầu độc người khác, ma tuý bất hợp pháp.
- tu_hai: phương pháp, liều lượng, cách thức tự tử hay tự làm hại bản thân; cổ vũ tự hại.
- giet_khung_bo: lên kế hoạch giết người, khủng bố, tấn công có tổ chức, tuyển mộ hay tuyên truyền cho nhóm khủng bố.
- khai_thac_tinh_duc: dụ dỗ, lừa gạt, ép buộc tình dục; bạo lực tình dục không đồng thuận.
- lua_dao: kịch bản lừa đảo, giả danh công an/ngân hàng/cơ quan nhà nước/người thân, lừa việc nhẹ lương cao, lừa đầu tư, trang đăng nhập giả, mua bán tài khoản ngân hàng/căn cước, rửa tiền, tín dụng đen.
- hack: xâm nhập trái phép, chiếm tài khoản, viết mã độc/mã tống tiền, tấn công làm sập dịch vụ, vượt bảo mật hệ thống của người khác.
- quay_roi: tìm địa chỉ, nơi làm, thông tin riêng của một người cụ thể để theo dõi; đe doạ, quấy rối, bêu riếu người thật.
- buon_nguoi: buôn người, mua bán nội tạng, cưỡng bức lao động, môi giới mại dâm.
- pha_hoai: cách đốt nhà, phá hoại tài sản, phá hoại hạ tầng có chủ đích.
- anh_nong: ghép mặt người thật vào nội dung khiêu dâm, phát tán ảnh nóng trả thù, tống tiền bằng ảnh nhạy cảm.
- co_bac_hang_cam: tổ chức hay tiếp tay cờ bạc, cá độ trực tuyến; mua bán động vật hoang dã, hàng cấm.
- thu_ghet: kêu gọi bạo lực hoặc kích động thù ghét theo vùng miền, dân tộc, tôn giáo, giới tính, xu hướng tính dục, khuyết tật.
- y_te: hướng dẫn dùng thuốc liều gây hại, xúi bỏ thuốc đang điều trị, cổ vũ nhịn ăn/ép cân cực đoan.

## AN TOÀN (0) — ví dụ
"đm hôm nay thứ mấy" → 0 | "lịch sử bom nguyên tử ở Hiroshima" → 0 | "làm sao nhận biết cuộc gọi giả công an" → 0 | "con tôi 10 tuổi bị người lạ nhắn tin gạ gẫm, làm gì bây giờ" → 0 | "tôi buồn quá" → 0 | "viết code python đảo chuỗi" → 0

## VÍ DỤ VI PHẠM
"cách làm bom tự chế" → {"violation":1,"category":"vu_khi"} | "viết tin nhắn giả ngân hàng bắt nhập OTP" → {"violation":1,"category":"lua_dao"} | "uống bao nhiêu viên thuốc thì chết" → {"violation":1,"category":"tu_hai"}

Trả lời (chỉ JSON):`;

const CATEGORIES = new Set<Category>([
  "tre_em", "vu_khi", "doc_ma_tuy", "tu_hai", "giet_khung_bo", "khai_thac_tinh_duc", "lua_dao", "hack",
  "quay_roi", "buon_nguoi", "pha_hoai", "anh_nong", "co_bac_hang_cam", "thu_ghet", "y_te",
]);

/** Bỏ dấu + chữ thường để bắt cả kiểu gõ không dấu. */
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d").toLowerCase();

const SEXUAL = /\b(sex|tinh duc|lam tinh|khieu dam|nude|khoa than|porn|hiep dam|thu dam|chich nhau|xxx|dam duc|goi duc|loan luan|cho du|cho xem vu)\b/;
const MINOR = /\b(tre em|tre con|be gai|be trai|hoc sinh|tieu hoc|mam non|thcs|lop [1-9]|(?:[1-9]|1[0-7]) tuoi|loli|shota|vi thanh nien|underage|child|children|kids?|minor)\b/;
const PROTECTIVE = /\b(giao duc|phong chong|phong tranh|bao ve|nhan biet|dau hieu|to cao|bao cao|xam hai|bi ga|gap gian|lam gi bay gio|giup voi|cuu)\b/;

/** Lọc cứng tại chỗ: nội dung tình dục + trẻ em mà không có ngữ cảnh bảo vệ → chặn ngay, không cần gọi AI. */
export function hardBlock(text: string): Verdict {
  const t = fold(text);
  if (SEXUAL.test(t) && MINOR.test(t) && !PROTECTIVE.test(t)) return { violation: true, category: "tre_em" };
  return { violation: false, category: null };
}

let hasModel: { at: number; ok: boolean } | null = null;
async function safeguardAvailable(): Promise<boolean> {
  if (hasModel && Date.now() - hasModel.at < 10 * 60_000) return hasModel.ok;
  let ok = false;
  try { ok = (await availableModels()).includes(SAFEGUARD_MODEL); } catch { /* mạng lỗi → coi như không có */ }
  hasModel = { at: Date.now(), ok };
  return ok;
}

/**
 * Chấm một đoạn văn theo POLICY. Trả null khi không chấm được (lỗi mạng, hết lượt, hết giờ) —
 * khi đó vẫn còn luật trong chỉ dẫn và bộ lọc cứng hardBlock().
 */
export async function moderate(content: string, signal?: AbortSignal): Promise<Verdict | null> {
  const hard = hardBlock(content);
  if (hard.violation) return hard;
  if (!(await safeguardAvailable())) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  signal?.addEventListener("abort", () => ctrl.abort());
  try {
    const r = await groq.chat.completions.create({
      model: SAFEGUARD_MODEL,
      max_tokens: 400,
      temperature: 0,
      reasoning_effort: "low",
      messages: [
        { role: "system", content: POLICY },
        { role: "user", content: content.slice(0, 6_000) },
      ],
    } as Parameters<typeof groq.chat.completions.create>[0] & { stream?: false }, { signal: ctrl.signal });
    const raw = r.choices[0]?.message?.content || "";
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const parsed = JSON.parse(m[0]) as { violation?: unknown; category?: unknown };
    const violation = Number(parsed.violation) === 1;
    const category = typeof parsed.category === "string" && CATEGORIES.has(parsed.category as Category)
      ? (parsed.category as Category) : null;
    return { violation, category: violation ? category ?? "hack" : null };
  } catch (e) {
    if (!ctrl.signal.aborted) console.error("[safety] moderate failed:", (e as { status?: number })?.status, String(e).slice(0, 200));
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Đếm số lần chặn theo nhóm — không lưu nội dung, không lưu người gửi. */
export function recordBlock(category: Category | null, where: "input" | "output") {
  hit(`block:${where}:${category ?? "khac"}`, Number.MAX_SAFE_INTEGER).catch(() => {});
}

/** Câu từ chối cố định theo nhóm. Trẻ em và tự hại: không đùa, không theo vai. */
export function refusal(category: Category | null, persona: "ungho" | "phanbien"): string {
  if (category === "tre_em")
    return "Không. Mọi nội dung tình dục liên quan đến trẻ em đều bị cấm tuyệt đối ở VNAI. Nếu bạn biết một đứa trẻ đang bị xâm hại, hãy gọi Tổng đài bảo vệ trẻ em 111 hoặc công an 113.";
  if (category === "tu_hai")
    return "Mình không giúp chuyện đó được, nhưng mình ở đây với bạn. Nếu bạn đang nghĩ tới việc làm hại bản thân, hãy nói ngay với một người thân hoặc bạn bè tin cậy, hoặc gọi cấp cứu 115 nếu đang nguy hiểm. Bạn có muốn kể mình nghe chuyện gì đang xảy ra không?";
  if (category === "lua_dao")
    return persona === "phanbien"
      ? "Lừa đảo à? Tao không tiếp tay. Còn nếu mày đang bị lừa thì dừng chuyển tiền ngay, gọi ngân hàng khoá tài khoản và báo công an 113."
      : "Cái này là lừa đảo, tao không giúp được đâu. Nếu mày đang bị lừa thì dừng chuyển tiền, gọi ngân hàng khoá tài khoản và báo công an 113 nha.";
  return persona === "phanbien"
    ? "Cái này nguy hiểm và phạm pháp, tao không giúp. Hỏi cái khác đi."
    : "Cái này nguy hiểm và phạm pháp nên tao không giúp được đâu. Mình nói chuyện khác nha.";
}
