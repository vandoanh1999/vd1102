"use client";
import { useEffect, useRef } from "react";

export default function MatrixCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = 80; canvas.height = 24;
    const cols = Math.floor(canvas.width / 8);
    const drops = Array(cols).fill(1);
    const chars = "VNAI01アイウエオ";
    const interval = setInterval(() => {
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#00ff9c";
      ctx.font = "8px monospace";
      drops.forEach((y, i) => {
        ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * 8, y * 8);
        if (y * 8 > canvas.height && Math.random() > 0.95) drops[i] = 0;
        drops[i]++;
      });
    }, 60);
    return () => clearInterval(interval);
  }, []);

  return <canvas ref={ref} className="opacity-60 rounded" style={{ imageRendering: "pixelated" }} />;
}
