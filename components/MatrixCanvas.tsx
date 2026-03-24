"use client";
import { useEffect, useRef } from "react";

export default function MatrixCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    canvas.width = 120;
    canvas.height = 32;

    const chars = "01アイウエオカキクケコ量子";
    const cols = Math.floor(canvas.width / 10);
    const drops = Array(cols).fill(1);

    const draw = () => {
      ctx.fillStyle = "rgba(0,0,0,0.15)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#0ff";
      ctx.font = "10px monospace";
      drops.forEach((y, i) => {
        const char = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(char, i * 10, y * 10);
        if (y * 10 > canvas.height && Math.random() > 0.95) drops[i] = 0;
        drops[i]++;
      });
    };

    const id = setInterval(draw, 60);
    return () => clearInterval(id);
  }, []);

  return <canvas ref={canvasRef} className="rounded opacity-80" />;
}
