"use client";

/** Bỏ ký hiệu markdown để thẻ ảnh dễ đọc. */
function plain(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/[*_#>]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function clip(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s;
}

function el(tag: string, style: Partial<CSSStyleDeclaration>, text?: string): HTMLElement {
  const e = document.createElement(tag);
  Object.assign(e.style, style);
  if (text !== undefined) e.textContent = text; // textContent: không chèn HTML → an toàn
  return e;
}

/**
 * Vẽ câu hỏi + câu chửi thành ảnh vuông có gắn thương hiệu vina-ai.com,
 * rồi mở bảng chia sẻ của điện thoại (hoặc tải về nếu trình duyệt không hỗ trợ).
 */
export async function shareRoast(question: string, answer: string): Promise<"shared" | "downloaded"> {
  const card = el("div", {
    position: "fixed", left: "-10000px", top: "0", width: "1080px", padding: "72px",
    boxSizing: "border-box", background: "linear-gradient(135deg,#0b1020 0%,#1a0b2e 55%,#3b0a1e 100%)",
    color: "#f1f5f9", fontFamily: "system-ui,-apple-system,Segoe UI,Roboto,sans-serif",
    display: "flex", flexDirection: "column", gap: "36px",
  });

  const head = el("div", { display: "flex", alignItems: "center", gap: "18px" });
  head.append(
    el("div", { width: "26px", height: "26px", borderRadius: "50%", background: "#ff3b3b", boxShadow: "0 0 24px #ff3b3b" }),
    el("div", { fontSize: "44px", fontWeight: "800", letterSpacing: "1px", color: "#f1f5f9" }, "VNAI"),
  );

  const q = el("div", {
    alignSelf: "flex-end", maxWidth: "85%", background: "#2563eb", color: "#fff",
    padding: "26px 32px", borderRadius: "28px 28px 6px 28px", fontSize: "38px", lineHeight: "1.4",
    whiteSpace: "pre-wrap", wordBreak: "break-word",
  }, clip(plain(question), 220));

  const a = el("div", {
    alignSelf: "flex-start", maxWidth: "92%", background: "rgba(255,255,255,0.08)",
    border: "2px solid rgba(251,113,133,0.45)", padding: "28px 34px",
    borderRadius: "28px 28px 28px 6px", fontSize: "36px", lineHeight: "1.5",
    whiteSpace: "pre-wrap", wordBreak: "break-word",
  }, clip(plain(answer), 700));

  const foot = el("div", {
    marginTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center",
    fontSize: "30px", color: "#cbd5e1",
  });
  foot.append(el("span", {}, "Hỏi ngu là ăn chửi"), el("span", { fontWeight: "700", color: "#fda4af" }, "vina-ai.com"));

  card.append(head, q, a, foot);
  document.body.appendChild(card);

  try {
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(card, { scale: 1, backgroundColor: "#0b1020", logging: false });
    const blob: Blob = await new Promise((res, rej) =>
      canvas.toBlob(b => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png")
    );
    const file = new File([blob], "vnai-chui.png", { type: "image/png" });

    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.share && nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: "Bị AI chửi", text: "Hỏi thử đi rồi biết: vina-ai.com" });
        return "shared";
      } catch (e) {
        if ((e as Error)?.name === "AbortError") return "shared"; // người dùng tự huỷ
      }
    }
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "vnai-chui.png";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5_000);
    return "downloaded";
  } finally {
    card.remove();
  }
}
