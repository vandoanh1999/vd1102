"use client";
import { useState, useRef } from "react";

export default function EnhancePage() {
  const [image, setImage] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState("image/jpeg");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const resultRef = useRef<HTMLDivElement>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setMimeType(file.type);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      setImage(base64);
      setData(null);
    };
    reader.readAsDataURL(file);
  };

  const enhance = async () => {
    if (!image) return;
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: image, mimeType }),
      });
      const json = await r.json();
      if (json.success) setData(json.data);
      else setError("Không đọc được tài liệu: " + json.raw?.slice(0, 100));
    } catch { setError("Lỗi kết nối"); }
    setLoading(false);
  };

  const downloadPNG = async () => {
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(resultRef.current!, { scale: 2, backgroundColor: "#fff" });
    const a = document.createElement("a"); a.download = "tailieu-ro-net.png";
    a.href = canvas.toDataURL("image/png"); a.click();
  };

  const downloadPDF = async () => {
    const { default: html2canvas } = await import("html2canvas");
    const { jsPDF } = await import("jspdf");
    const canvas = await html2canvas(resultRef.current!, { scale: 2, backgroundColor: "#fff" });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const w = pdf.internal.pageSize.getWidth();
    const h = (canvas.height * w) / canvas.width;
    pdf.addImage(imgData, "PNG", 0, 0, w, h);
    pdf.save("tailieu-ro-net.pdf");
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white p-4 max-w-3xl mx-auto">
      <h1 className="text-xl font-bold text-cyan-400 mb-4">📄 Làm rõ tài liệu</h1>

      <label className="block w-full border-2 border-dashed border-cyan-500/40 rounded-lg p-6 text-center cursor-pointer hover:border-cyan-400 mb-4">
        <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
        {image ? <span className="text-green-400">✅ Ảnh đã chọn — nhấn Xử lý</span>
          : <span className="text-gray-400">📷 Chọn hoặc chụp ảnh tài liệu</span>}
      </label>

      {image && (
        <img src={`data:${mimeType};base64,${image}`} className="w-full rounded mb-4 opacity-60" alt="gốc" />
      )}

      <button onClick={enhance} disabled={!image || loading}
        className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-600 rounded font-bold disabled:opacity-40 mb-4">
        {loading ? "⏳ Đang xử lý..." : "✨ Làm rõ tài liệu"}
      </button>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      {data && (
        <>
          <div className="flex gap-2 mb-4">
            <button onClick={downloadPNG} className="flex-1 py-2 bg-green-600 hover:bg-green-500 rounded font-medium">
              ⬇ Tải PNG
            </button>
            <button onClick={downloadPDF} className="flex-1 py-2 bg-red-600 hover:bg-red-500 rounded font-medium">
              ⬇ Tải PDF
            </button>
          </div>

          <div ref={resultRef} className="bg-white text-black p-6 rounded-lg font-sans text-sm">
            {data.company && <p className="font-bold text-xs mb-1">{data.company}</p>}
            {data.title && <h2 className="text-center font-bold text-base mb-1">{data.title}</h2>}
            {data.subtitle && <p className="text-center text-xs mb-3">{data.subtitle}</p>}

            {data.metadata?.length > 0 && (
              <div className="grid grid-cols-2 gap-x-4 mb-3 text-xs">
                {data.metadata.map((m: any, i: number) => (
                  <div key={i}><span className="font-semibold">{m.label}:</span> {m.value}</div>
                ))}
              </div>
            )}

            {data.table?.headers?.length > 0 && (
              <table className="w-full border-collapse border border-gray-400 text-xs mb-3">
                <thead>
                  <tr className="bg-gray-100">
                    {data.table.headers.map((h: string, i: number) => (
                      <th key={i} className="border border-gray-400 px-2 py-1 text-left">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.table.rows.map((row: string[], i: number) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j} className="border border-gray-400 px-2 py-1">{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {data.summary?.length > 0 && (
              <div className="flex justify-end gap-6 text-xs mb-3 font-semibold">
                {data.summary.map((s: any, i: number) => (
                  <span key={i}>{s.label}: {s.value}</span>
                ))}
              </div>
            )}

            {data.ref && <p className="text-xs mb-3">Ref SO: {data.ref}</p>}
            {data.footer_company && <p className="text-xs font-semibold mb-4">{data.footer_company}</p>}

            {data.signatures?.length > 0 && (
              <div className="grid grid-cols-4 gap-2 text-xs text-center mt-4 pt-4 border-t border-gray-300">
                {data.signatures.map((s: any, i: number) => (
                  <div key={i}>
                    <div className="font-semibold mb-6">{s.role}</div>
                    <div className="italic">{s.name || ""}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
