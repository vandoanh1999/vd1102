"use client";
import { useState } from "react";

export default function Uploader({ onUploaded }: { onUploaded: (urls: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs border border-cyan-500/40 px-2 py-1 rounded cursor-pointer hover:border-cyan-400 transition-colors">
        <input
          type="file"
          multiple
          hidden
          onChange={async e => {
            const files = e.target.files;
            if (!files?.length) return;
            setBusy(true);
            const fd = new FormData();
            Array.from(files).forEach(f => fd.append("files", f));
            const res = await fetch("/api/upload", { method: "POST", body: fd });
            const data = await res.json();
            setBusy(false);
            onUploaded(data.files || []);
            e.target.value = "";
          }}
        />
        {busy ? "Đang tải..." : "📎"}
      </label>
    </div>
  );
}
