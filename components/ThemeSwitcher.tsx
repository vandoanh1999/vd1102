"use client";
import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "matrix";

export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<Theme>("dark");

  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    if (saved) setTheme(saved);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("theme", theme);
  }, [theme]);

  return (
    <div className="flex gap-1 text-xs">
      {(["light", "dark", "matrix"] as Theme[]).map(t => (
        <button
          key={t}
          onClick={() => setTheme(t)}
          className={`px-2 py-1 rounded border transition-colors ${theme === t ? "border-cyan-400 text-cyan-300" : "border-gray-700 text-gray-400"}`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
