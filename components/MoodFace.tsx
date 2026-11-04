"use client";
/**
 * MoodFace — gương mặt 3D sống phía sau khung chat.
 *
 *  hien  : mặt cười "^ ^", ánh vàng ấm
 *  khia  : mắt lim dim, nhếch mép, nhướng một bên mày, ánh cam
 *  gat   : nền tối sầm, hai mắt đỏ rực phát sáng, mày chau
 *  care  : (khi người dùng buồn thật) mắt tròn dịu, ánh xanh
 *
 * Hoạt động: nghe → mắt to theo âm lượng; nghĩ → mắt đảo; nói → miệng nhép.
 * Mọi thông số được nội suy mượt mỗi khung hình nên đổi chế độ là "biến hình" chứ không giật.
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

export type Mood = "hien" | "khia" | "gat" | "care";
export type Activity = "idle" | "listening" | "thinking" | "speaking";

type Look = {
  eye: string; bg: string; head: string; rim: string;
  eyeOpen: number;   // 0 nhắm .. 1 tròn
  eyeArc: number;    // 0 mắt tròn .. 1 mắt cười "^"
  eyeSlant: number;  // độ xếch mắt (rad)
  browL: number; browR: number;       // góc xoay mày trái/phải (rad, dương = ngược chiều kim đồng hồ)
  browLy: number; browRy: number;     // độ cao mày
  brows: number;     // 0 ẩn .. 1 hiện
  smile: number;     // >0 cười, <0 mếu
  tilt: number;      // nghiêng miệng (nhếch mép)
  mouthW: number; mouth: number;      // độ rộng, độ hiện
  glow: number;      // độ loé sáng (bloom)
  key: number; rimI: number; front: number; // độ sáng đèn chính / đèn viền / đèn hắt từ mắt
};

const LOOKS: Record<Mood, Look> = {
  hien: { eye: "#ffd27a", bg: "#211f1d", head: "#2b2926", rim: "#ffb85c", eyeOpen: 1, eyeArc: 1, eyeSlant: 0,
    browL: 0, browR: 0, browLy: 0, browRy: 0, brows: 0, smile: 0.32, tilt: 0, mouthW: 0.62, mouth: 1, glow: 0.55, key: 1.0, rimI: 9, front: 1 },
  khia: { eye: "#ffad4d", bg: "#201c19", head: "#2a2522", rim: "#ff8a3d", eyeOpen: 0.42, eyeArc: 0, eyeSlant: 0.06,
    browL: 0.05, browR: -0.18, browLy: 0, browRy: 0.14, brows: 1, smile: 0.12, tilt: 0.22, mouthW: 0.5, mouth: 1, glow: 0.7, key: 0.9, rimI: 9, front: 1 },
  gat: { eye: "#ff2020", bg: "#070404", head: "#0b0808", rim: "#ff1f1f", eyeOpen: 0.62, eyeArc: 0, eyeSlant: 0.32,
    browL: -0.62, browR: 0.62, browLy: -0.02, browRy: -0.02, brows: 0.85, smile: -0.12, tilt: 0, mouthW: 0.38, mouth: 0.22,
    glow: 1.25, key: 0.08, rimI: 2.5, front: 0.15 },
  care: { eye: "#9fd0ff", bg: "#1b1f24", head: "#262a30", rim: "#7fb6ff", eyeOpen: 0.9, eyeArc: 0.35, eyeSlant: -0.08,
    browL: 0.18, browR: -0.18, browLy: 0.05, browRy: 0.05, brows: 0.6, smile: 0.12, tilt: 0, mouthW: 0.4, mouth: 1, glow: 0.45, key: 0.9, rimI: 7, front: 0.8 },
};

const MOUTH_BEADS = 22;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Trộn hai biểu cảm theo tỉ lệ s (chỉ các thông số số; màu trộn riêng). */
function mixLook(a: Look, b: Look, s: number): Look {
  const out = { ...a };
  (Object.keys(a) as (keyof Look)[]).forEach(k => {
    if (typeof a[k] === "number") (out as any)[k] = (a[k] as number) * (1 - s) + (b[k] as number) * s;
  });
  return out;
}

function webglOk(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch { return false; }
}

export default function MoodFace({
  mood, activity, level = 0, prominent = true, anger = null,
}: { mood: Mood; activity: Activity; level?: number; prominent?: boolean; anger?: number | null }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const live = useRef({ mood, activity, level, prominent, anger });
  live.current = { mood, activity, level, prominent, anger };

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !webglOk()) return;

    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const small = Math.min(window.innerWidth, window.innerHeight) < 700;

    /* ── Khung cảnh ── */
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, small ? 1.5 : 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(renderer.domElement);
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    renderer.domElement.style.display = "block";

    const scene = new THREE.Scene();
    const bg = new THREE.Color(LOOKS.hien.bg);
    scene.background = bg;
    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    camera.position.set(0, 0, 9);

    scene.add(new THREE.AmbientLight(0xffffff, 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(-3, 4, 6);
    scene.add(key);
    const rim = new THREE.PointLight(0xffb85c, 9, 20);
    rim.position.set(3, 2, -3.5);
    scene.add(rim);
    const front = new THREE.PointLight(0xffd27a, 4, 8);
    front.position.set(0, 0, 3.2);
    scene.add(front);

    /* ── Cái đầu: khối cầu bóng tối màu ── */
    const face = new THREE.Group();
    scene.add(face);
    const headMat = new THREE.MeshStandardMaterial({ color: LOOKS.hien.head, roughness: 0.55, metalness: 0.25 });
    const head = new THREE.Mesh(new THREE.SphereGeometry(1.6, 64, 64), headMat);
    face.add(head);

    const glowMat = new THREE.MeshBasicMaterial({ color: LOOKS.hien.eye, toneMapped: false });
    const R = 1.6;
    const onSurface = (x: number, y: number) => Math.sqrt(Math.max(0, R * R - x * x - y * y)) + 0.02;

    /* Mắt: mỗi bên có mắt tròn (dẹt dần khi lim dim) và mắt cười hình vòm "^" */
    const makeEye = (side: -1 | 1) => {
      const g = new THREE.Group();
      const x = 0.52 * side, y = 0.28;
      g.position.set(x, y, onSurface(x, y));
      g.lookAt(new THREE.Vector3(x * 2, y * 2, onSurface(x, y) * 2));
      const round = new THREE.Mesh(new THREE.SphereGeometry(0.2, 32, 16), glowMat);
      round.scale.set(1, 1, 0.35);
      const arc = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.045, 12, 40, Math.PI), glowMat);
      arc.position.y = -0.06;
      g.add(round, arc);
      face.add(g);
      return { g, round, arc, side };
    };
    const eyes = [makeEye(-1), makeEye(1)];

    /* Lông mày */
    const browMat = new THREE.MeshBasicMaterial({ color: LOOKS.hien.eye, toneMapped: false });
    const makeBrow = (side: -1 | 1) => {
      const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.028, 0.3, 4, 8), browMat);
      m.rotation.z = Math.PI / 2;
      const pivot = new THREE.Group();
      pivot.add(m);
      face.add(pivot);
      return { pivot, side };
    };
    const brows = [makeBrow(-1), makeBrow(1)];

    /* Miệng: chuỗi hạt sáng vẽ theo đường cong → cười / mếu / nhếch / há miệng đều được */
    const beadGeo = new THREE.SphereGeometry(0.042, 10, 8);
    const mouth = new THREE.InstancedMesh(beadGeo, glowMat, MOUTH_BEADS * 2);
    face.add(mouth);
    const tmp = new THREE.Object3D();

    /* ── Hậu kỳ: phát sáng (bloom) cho mắt ── */
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.6, 0.5);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    let portrait = false;
    const resize = () => {
      const w = host.clientWidth || window.innerWidth;
      const h = host.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      composer.setSize(w, h);
      bloom.resolution.set(w / 2, h / 2);
      camera.aspect = w / h;
      // Màn hình dọc (điện thoại): lùi camera để mặt không bị tràn, đặt mặt ở nửa trên.
      portrait = camera.aspect < 0.8;
      camera.position.z = portrait ? 12.5 : 11;
      camera.updateProjectionMatrix();
    };
    resize();
    window.addEventListener("resize", resize);

    /* Mặt nhìn theo con trỏ / ngón tay */
    const pointer = { x: 0, y: 0 };
    const onMove = (e: PointerEvent) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    /* ── Trạng thái nội suy ── */
    const cur: Look & { eyeC: THREE.Color; bgC: THREE.Color; headC: THREE.Color; rimC: THREE.Color } = {
      ...LOOKS.hien,
      eyeC: new THREE.Color(LOOKS.hien.eye), bgC: new THREE.Color(LOOKS.hien.bg),
      headC: new THREE.Color(LOOKS.hien.head), rimC: new THREE.Color(LOOKS.hien.rim),
    };
    const tgtColors = { eye: new THREE.Color(), bg: new THREE.Color(), head: new THREE.Color(), rim: new THREE.Color() };
    let open = 0, faceY = 0, scale = 1, lvl = 0, mouthOpen = 0;
    let nextBlink = 2 + Math.random() * 3, blink = 0;
    const lookAround = { x: 0, y: 0 };

    const clock = new THREE.Clock();
    let raf = 0;
    let running = true;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      if (!running) return;
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.elapsedTime;
      const { mood: m, activity: a, level: inLvl, prominent: big, anger: ang } = live.current;
      // Có độ giận liên tục (tâm trạng SDE của NYC) → trộn dần giữa mặt nhếch mép và mặt mắt đỏ.
      const blend = typeof ang === "number" && m !== "care" && m !== "hien";
      const s = blend ? smoothstep(0.35, 0.9, ang as number) : 0;
      const L: Look = blend ? mixLook(LOOKS.khia, LOOKS.gat, s) : LOOKS[m];
      const k = 1 - Math.pow(0.0015, dt); // tốc độ nội suy ~ 0.25s

      // Nội suy các thông số hình học
      (Object.keys(L) as (keyof Look)[]).forEach(p => {
        if (typeof L[p] === "number") (cur as any)[p] += ((L[p] as number) - (cur as any)[p]) * k;
      });
      if (blend) {
        tgtColors.eye.set(LOOKS.khia.eye).lerp(new THREE.Color(LOOKS.gat.eye), s);
        tgtColors.bg.set(LOOKS.khia.bg).lerp(new THREE.Color(LOOKS.gat.bg), s);
        tgtColors.head.set(LOOKS.khia.head).lerp(new THREE.Color(LOOKS.gat.head), s);
        tgtColors.rim.set(LOOKS.khia.rim).lerp(new THREE.Color(LOOKS.gat.rim), s);
      } else {
        tgtColors.eye.set(L.eye); tgtColors.bg.set(L.bg); tgtColors.head.set(L.head); tgtColors.rim.set(L.rim);
      }
      cur.eyeC.lerp(tgtColors.eye, k); cur.bgC.lerp(tgtColors.bg, k);
      cur.headC.lerp(tgtColors.head, k); cur.rimC.lerp(tgtColors.rim, k);

      // Mắt/miệng sáng hơn mức 1.0 (HDR) để hiệu ứng toả sáng bắt được, kể cả màu đỏ vốn tối.
      const hdr = 2.1;
      glowMat.color.copy(cur.eyeC).multiplyScalar(hdr);
      browMat.color.copy(cur.eyeC).multiplyScalar(hdr * 0.8);
      bg.copy(cur.bgC);
      headMat.color.copy(cur.headC);
      rim.color.copy(cur.rimC);
      front.color.copy(cur.eyeC);
      front.intensity = (2 + cur.glow * 3) * cur.front;
      key.intensity = cur.key;
      rim.intensity = cur.rimI;

      // Âm lượng micro (mượt)
      lvl += ((a === "listening" ? inLvl : 0) - lvl) * Math.min(1, dt * 12);

      // Chớp mắt
      if (t > nextBlink) { blink = 1; nextBlink = t + 2.5 + Math.random() * 3.5; }
      blink = Math.max(0, blink - dt * 7);
      const blinkMul = 1 - Math.sin(Math.min(1, blink) * Math.PI) * 0.92;

      // Mắt đảo khi đang nghĩ
      const think = a === "thinking";
      lookAround.x += ((think ? Math.sin(t * 2.1) * 0.12 : pointer.x * 0.05) - lookAround.x) * k;
      lookAround.y += ((think ? 0.08 + Math.cos(t * 1.6) * 0.05 : -pointer.y * 0.04) - lookAround.y) * k;

      const listenBoost = a === "listening" ? 1.1 + lvl * 0.45 : 1;
      eyes.forEach(e => {
        const openY = Math.max(0.06, cur.eyeOpen * blinkMul * listenBoost);
        const roundVis = 1 - cur.eyeArc;
        e.round.scale.set(listenBoost * 1.02 * roundVis + 0.0001, openY * roundVis + 0.0001, 0.35);
        e.arc.scale.setScalar(cur.eyeArc * (0.75 + 0.25 * blinkMul) + 0.0001);
        e.g.rotation.z = e.side * cur.eyeSlant; // mắt xếch: đầu trong cụp xuống
        e.g.position.x = 0.52 * e.side + lookAround.x;
        e.g.position.y = 0.28 + lookAround.y;
        e.g.position.z = onSurface(e.g.position.x, e.g.position.y);
      });

      // Lông mày (rung nhẹ khi đang chửi ở chế độ gắt)
      const rage = m === "gat" && a === "speaking" ? Math.sin(t * 30) * 0.03 : 0;
      brows.forEach(b => {
        const x = 0.52 * b.side + lookAround.x * 0.6;
        const y = 0.66 + (b.side < 0 ? cur.browLy : cur.browRy) + lookAround.y * 0.5 + rage;
        b.pivot.position.set(x, y, onSurface(x, y) + 0.01);
        b.pivot.rotation.z = b.side < 0 ? cur.browL : cur.browR;
        b.pivot.scale.setScalar(Math.max(0.0001, cur.brows));
      });

      // Miệng: há theo nhịp khi đang nói/đang stream chữ
      const talk = a === "speaking"
        ? 0.07 + Math.abs(Math.sin(t * 13) * Math.sin(t * 7.3)) * 0.16
        : a === "listening" ? 0.02 : 0;
      mouthOpen += (talk - mouthOpen) * Math.min(1, dt * 18);
      const w = cur.mouthW;
      for (let i = 0; i < MOUTH_BEADS; i++) {
        const u = (i / (MOUTH_BEADS - 1)) * 2 - 1; // -1..1
        const x = u * w;
        const curve = cur.smile * (1 - u * u);       // parabol: cười cong lên, mếu cong xuống
        const yBase = -0.42 - curve + u * cur.tilt * 0.35;
        for (let lip = 0; lip < 2; lip++) {
          const y = yBase + (lip === 0 ? mouthOpen : -mouthOpen) * (1 - u * u);
          tmp.position.set(x, y, onSurface(x, y));
          tmp.scale.setScalar(Math.max(0.0001, cur.mouth));
          tmp.updateMatrix();
          mouth.setMatrixAt(i * 2 + lip, tmp.matrix);
        }
      }
      mouth.instanceMatrix.needsUpdate = true;

      // Chuyển động cả khối đầu
      const bob = reduceMotion ? 0 : Math.sin(t * 1.3) * 0.08;
      const targetY = big ? (portrait ? 1.45 : 0.95) : (portrait ? 1.2 : 0.6);
      faceY += (targetY - faceY) * k;
      const targetScale = big ? 1 : 1.25;
      scale += (targetScale - scale) * k;
      face.position.y = faceY + bob;
      face.scale.setScalar(scale * (1 + lvl * 0.04));
      const shake = m === "gat" && a === "speaking" && !reduceMotion ? Math.sin(t * 40) * 0.012 : 0;
      face.rotation.y += ((think ? Math.sin(t * 0.8) * 0.25 : pointer.x * 0.35) - face.rotation.y) * k + shake;
      face.rotation.x += ((pointer.y * 0.2 + (a === "listening" ? -0.05 : 0)) - face.rotation.x) * k;

      // Mắt đỏ "thở" sáng mờ ở chế độ gắt
      const pulse = m === "gat" ? 0.25 * Math.sin(t * 2.4) + (a === "speaking" ? 0.5 : 0) : 0;
      bloom.strength = (cur.glow + pulse + lvl * 0.4) * 0.8;
      bloom.radius = 0.55;

      open = Math.min(1, open + dt * 1.5);
      renderer.domElement.style.opacity = String(open);
      composer.render();
    };
    frame();

    const onVis = () => { running = !document.hidden; clock.getDelta(); };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      composer.dispose();
      renderer.dispose();
      scene.traverse(o => {
        const mesh = o as THREE.Mesh;
        mesh.geometry?.dispose?.();
      });
      headMat.dispose(); glowMat.dispose(); browMat.dispose();
      renderer.domElement.remove();
    };
  }, []);

  return <div ref={hostRef} aria-hidden className="absolute inset-0" />;
}
