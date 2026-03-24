"use client";
import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hue: number;
  alpha: number;
  phase: number;        // quantum phase angle
  spin: number;         // +0.5 or -0.5
  entangled: number;    // index of entangled partner (-1 = none)
  trail: { x: number; y: number; a: number }[];
  superposed: boolean;  // in superposition state → renders ghost copy
  tunneling: boolean;   // tunneling through barrier
  tunnelTimer: number;
}

interface Props {
  active: boolean;      // true = AI is thinking → particles converge
  onDone?: () => void;
}

const W = 220;
const H = 220;
const N = 28;           // particle count
const CENTER = { x: W / 2, y: H / 2 };

function randBetween(a: number, b: number) { return a + Math.random() * (b - a); }

export default function QuantumLoader({ active }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stateRef = useRef<{
    particles: Particle[];
    time: number;
    convergence: number; // 0..1
    wavePhase: number;
    decohere: number;    // 0..1 burst on done
  }>({ particles: [], time: 0, convergence: 0, wavePhase: 0, decohere: 0 });
  const rafRef = useRef<number>(0);
  const activeRef = useRef(active);

  useEffect(() => { activeRef.current = active; }, [active]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    canvas.width = W;
    canvas.height = H;

    // ── Init particles ──────────────────────────────────────────────────
    const particles: Particle[] = [];
    for (let i = 0; i < N; i++) {
      const angle = (i / N) * Math.PI * 2;
      const r = randBetween(60, 95);
      particles.push({
        x: CENTER.x + Math.cos(angle) * r,
        y: CENTER.y + Math.sin(angle) * r,
        vx: randBetween(-0.4, 0.4),
        vy: randBetween(-0.4, 0.4),
        radius: randBetween(1.5, 3.5),
        hue: randBetween(160, 220),   // cyan → blue spectrum
        alpha: randBetween(0.5, 1),
        phase: angle,
        spin: Math.random() > 0.5 ? 0.5 : -0.5,
        entangled: i % 2 === 0 ? i + 1 : i - 1,
        trail: [],
        superposed: Math.random() > 0.7,
        tunneling: false,
        tunnelTimer: 0,
      });
    }
    stateRef.current.particles = particles;

    // ── Draw helpers ────────────────────────────────────────────────────
    const drawWaveRing = (t: number, conv: number) => {
      const rings = 3;
      for (let r = 0; r < rings; r++) {
        const baseR = 80 - conv * 55 + r * 18;
        const segments = 120;
        ctx.beginPath();
        for (let i = 0; i <= segments; i++) {
          const a = (i / segments) * Math.PI * 2;
          const wobble = Math.sin(a * 6 + t * 2 + r * 1.3) * (4 - conv * 3);
          const pr = baseR + wobble;
          const px = CENTER.x + Math.cos(a) * pr;
          const py = CENTER.y + Math.sin(a) * pr;
          i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.closePath();
        const alpha = 0.08 + conv * 0.12;
        ctx.strokeStyle = `hsla(${185 + r * 15}, 100%, 65%, ${alpha})`;
        ctx.lineWidth = 0.8;
        ctx.stroke();
      }
    };

    const drawProbabilityCloud = (conv: number) => {
      // Draw gaussian haze at center
      if (conv < 0.1) return;
      const grad = ctx.createRadialGradient(CENTER.x, CENTER.y, 0, CENTER.x, CENTER.y, 45 * conv);
      grad.addColorStop(0, `hsla(180, 100%, 70%, ${0.06 * conv})`);
      grad.addColorStop(0.5, `hsla(200, 100%, 60%, ${0.03 * conv})`);
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(CENTER.x, CENTER.y, 45 * conv, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawEntanglement = (p: Particle, partner: Particle, t: number, conv: number) => {
      if (p.entangled < 0) return;
      // Sinusoidal entanglement beam
      const steps = 30;
      ctx.beginPath();
      for (let i = 0; i <= steps; i++) {
        const frac = i / steps;
        const ix = p.x + (partner.x - p.x) * frac;
        const iy = p.y + (partner.y - p.y) * frac;
        const perp = Math.sin(frac * Math.PI * 3 + t * 4) * (3 - conv * 2);
        const dx = -(partner.y - p.y); const dy = (partner.x - p.x);
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        const nx = dx / len; const ny = dy / len;
        const fx = ix + nx * perp;
        const fy = iy + ny * perp;
        i === 0 ? ctx.moveTo(fx, fy) : ctx.lineTo(fx, fy);
      }
      ctx.strokeStyle = `hsla(${(p.hue + partner.hue) / 2}, 100%, 70%, 0.12)`;
      ctx.lineWidth = 0.6;
      ctx.stroke();
    };

    const drawParticle = (p: Particle, t: number, conv: number) => {
      // Trail
      p.trail.forEach((tr, i) => {
        const a = tr.a * (i / p.trail.length);
        ctx.beginPath();
        ctx.arc(tr.x, tr.y, p.radius * 0.5 * (i / p.trail.length), 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 100%, 70%, ${a * 0.4})`;
        ctx.fill();
      });

      // Superposition ghost
      if (p.superposed) {
        const ghostOffset = Math.sin(t * 3 + p.phase) * 8 * (1 - conv);
        const gx = p.x + Math.cos(p.phase + Math.PI / 2) * ghostOffset;
        const gy = p.y + Math.sin(p.phase + Math.PI / 2) * ghostOffset;
        const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, p.radius * 3);
        grad.addColorStop(0, `hsla(${p.hue + 40}, 100%, 80%, 0.15)`);
        grad.addColorStop(1, "transparent");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(gx, gy, p.radius * 3, 0, Math.PI * 2);
        ctx.fill();
      }

      // Core glow
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 4);
      glow.addColorStop(0, `hsla(${p.hue}, 100%, 90%, ${p.alpha})`);
      glow.addColorStop(0.4, `hsla(${p.hue}, 100%, 65%, ${p.alpha * 0.5})`);
      glow.addColorStop(1, "transparent");
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * 4, 0, Math.PI * 2);
      ctx.fill();

      // Solid core
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `hsla(${p.hue}, 100%, 95%, ${p.alpha})`;
      ctx.fill();

      // Spin indicator ring
      const spinR = p.radius + 3;
      const spinAngle = t * 5 * p.spin + p.phase;
      ctx.beginPath();
      ctx.arc(p.x, p.y, spinR, spinAngle, spinAngle + Math.PI * 1.2);
      ctx.strokeStyle = `hsla(${p.hue + 30}, 100%, 80%, 0.35)`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    };

    const drawDecohereExplosion = (decohere: number) => {
      if (decohere <= 0) return;
      const rays = 16;
      for (let i = 0; i < rays; i++) {
        const a = (i / rays) * Math.PI * 2;
        const len = decohere * 60;
        ctx.beginPath();
        ctx.moveTo(CENTER.x, CENTER.y);
        ctx.lineTo(CENTER.x + Math.cos(a) * len, CENTER.y + Math.sin(a) * len);
        ctx.strokeStyle = `hsla(${180 + i * 8}, 100%, 70%, ${(1 - decohere) * 0.6})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      // Shockwave ring
      ctx.beginPath();
      ctx.arc(CENTER.x, CENTER.y, decohere * 80, 0, Math.PI * 2);
      ctx.strokeStyle = `hsla(180, 100%, 80%, ${(1 - decohere) * 0.8})`;
      ctx.lineWidth = 2 - decohere * 1.5;
      ctx.stroke();
    };

    const drawCenterOrb = (conv: number, t: number) => {
      if (conv < 0.2) return;
      const r = conv * 14;
      const pulse = 1 + Math.sin(t * 8) * 0.15 * conv;
      const grad = ctx.createRadialGradient(CENTER.x, CENTER.y, 0, CENTER.x, CENTER.y, r * pulse * 2.5);
      grad.addColorStop(0, `hsla(185, 100%, 95%, ${conv * 0.9})`);
      grad.addColorStop(0.3, `hsla(190, 100%, 70%, ${conv * 0.6})`);
      grad.addColorStop(0.7, `hsla(200, 100%, 50%, ${conv * 0.2})`);
      grad.addColorStop(1, "transparent");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(CENTER.x, CENTER.y, r * pulse * 2.5, 0, Math.PI * 2);
      ctx.fill();
    };

    // ── Main loop ───────────────────────────────────────────────────────
    let prevActive = false;

    const loop = () => {
      const s = stateRef.current;
      s.time += 0.016;
      s.wavePhase += 0.025;

      const isActive = activeRef.current;

      // Convergence easing
      if (isActive) {
        s.convergence = Math.min(1, s.convergence + 0.018);
      } else {
        s.convergence = Math.max(0, s.convergence - 0.025);
      }

      // Decoherence burst when AI finishes
      if (prevActive && !isActive) {
        s.decohere = 1;
      }
      if (s.decohere > 0) s.decohere = Math.max(0, s.decohere - 0.03);
      prevActive = isActive;

      const conv = s.convergence;

      // Update particles
      s.particles.forEach((p, idx) => {
        // Save trail
        p.trail.push({ x: p.x, y: p.y, a: p.alpha });
        if (p.trail.length > 12) p.trail.shift();

        // Heisenberg uncertainty jitter
        const jitter = (1 - conv * 0.7) * 0.3;
        p.vx += (Math.random() - 0.5) * jitter;
        p.vy += (Math.random() - 0.5) * jitter;

        // Orbital tendency (when not converging)
        const dx = p.x - CENTER.x;
        const dy = p.y - CENTER.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const targetR = 78 * (1 - conv * 0.85);
        const radialForce = ((dist - targetR) * -0.003) * (1 - conv * 0.6);
        p.vx += (dx / dist) * radialForce;
        p.vy += (dy / dist) * radialForce;

        // Orbital tangential force
        p.vx += (-dy / dist) * 0.012 * p.spin;
        p.vy += (dx / dist) * 0.012 * p.spin;

        // Quantum tunneling: random teleport
        if (!p.tunneling && Math.random() < 0.001 * (1 - conv)) {
          p.tunneling = true;
          p.tunnelTimer = 15;
        }
        if (p.tunneling) {
          p.tunnelTimer--;
          p.alpha = Math.sin((15 - p.tunnelTimer) / 15 * Math.PI) * 0.3;
          if (p.tunnelTimer <= 0) {
            // Rematerialize at new position
            const newAngle = Math.random() * Math.PI * 2;
            const newR = randBetween(50, 90) * (1 - conv * 0.8);
            p.x = CENTER.x + Math.cos(newAngle) * newR;
            p.y = CENTER.y + Math.sin(newAngle) * newR;
            p.alpha = 0.8;
            p.tunneling = false;
            p.trail = [];
          }
        }

        // Convergence force
        if (conv > 0) {
          p.vx += (-dx / dist) * conv * 0.08;
          p.vy += (-dy / dist) * conv * 0.08;
        }

        // Friction
        p.vx *= 0.92;
        p.vy *= 0.92;

        if (!p.tunneling) {
          p.x += p.vx;
          p.y += p.vy;
        }

        // Phase evolution
        p.phase += 0.04 * p.spin;

        // Pulsing alpha
        if (!p.tunneling) {
          p.alpha = 0.65 + Math.sin(s.time * 3 + p.phase) * 0.35;
        }

        // Hue drift
        p.hue += 0.08 * p.spin;
        if (p.hue > 230) p.hue = 160;
        if (p.hue < 160) p.hue = 230;
      });

      // ── Render ─────────────────────────────────────────────────────
      ctx.clearRect(0, 0, W, H);

      // Background vignette
      const vignette = ctx.createRadialGradient(CENTER.x, CENTER.y, 30, CENTER.x, CENTER.y, W * 0.7);
      vignette.addColorStop(0, "rgba(0,20,30,0)");
      vignette.addColorStop(1, "rgba(0,5,15,0.5)");
      ctx.fillStyle = vignette;
      ctx.fillRect(0, 0, W, H);

      // Wave rings
      drawWaveRing(s.time, conv);

      // Probability cloud
      drawProbabilityCloud(conv);

      // Entanglement lines (only even particles to avoid drawing twice)
      s.particles.forEach((p, i) => {
        if (i % 2 === 0 && p.entangled >= 0 && p.entangled < s.particles.length) {
          drawEntanglement(p, s.particles[p.entangled], s.time, conv);
        }
      });

      // Particles
      s.particles.forEach(p => drawParticle(p, s.time, conv));

      // Center orb
      drawCenterOrb(conv, s.time);

      // Decoherence burst
      drawDecohereExplosion(s.decohere);

      // Status text
      if (conv > 0.3) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, (conv - 0.3) / 0.4);
        ctx.font = `bold ${10 + conv * 2}px 'Courier New', monospace`;
        ctx.textAlign = "center";
        ctx.fillStyle = `hsla(185, 100%, 80%, 0.9)`;
        ctx.shadowColor = "cyan";
        ctx.shadowBlur = 8;
        // Typewriter dots
        const dots = ".".repeat(Math.floor(s.time * 2) % 4);
        ctx.fillText(`Đang phân tích${dots}`, CENTER.x, H - 18);
        ctx.restore();
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className="relative flex items-center justify-center">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={{
          width: W / 2,
          height: H / 2,
          imageRendering: "pixelated",
          filter: "drop-shadow(0 0 8px rgba(0,255,255,0.3))",
        }}
      />
    </div>
  );
}
