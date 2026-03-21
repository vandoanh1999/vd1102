"use client";
import { useEffect, useState } from "react";

export default function Sidebar() {
  const [convs, setConvs] = useState<any[]>([]);

  useEffect(() => {
    const load = () => fetch("/api/conversations").then(r => r.json()).then(setConvs).catch(() => {});
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <aside className="w-64 border-r border-cyan-500/20 p-3 hidden md:block">
      <div className="text-xs text-cyan-400 mb-2 font-semibold uppercase tracking-wide">Conversations</div>
      <div className="space-y-1">
        {convs.map((c: any) => (
          <div key={c.id} className="text-sm truncate px-2 py-1 rounded bg-gray-800/70 border border-cyan-500/20 hover:border-cyan-500/50 cursor-pointer">
            {c.title || c.id}
          </div>
        ))}
      </div>
    </aside>
  );
}
