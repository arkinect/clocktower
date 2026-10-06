// "Lantern Slice": an original idle swipe game. Plain Canvas 2D, no assets, no network, nothing sent anywhere.
import { useEffect, useRef, useState } from 'react';

type Kind = 'circle' | 'square' | 'triangle' | 'diamond' | 'star';
interface Shape { x: number; y: number; vx: number; vy: number; r: number; rot: number; vr: number; kind: Kind; color: string; sliced: boolean; half?: -1 | 1; life: number }
interface Point { x: number; y: number; t: number }

const COLORS = ['#e8b04a', '#d9534f', '#5bc0de', '#8e7cc3', '#5cb85c', '#f08a5d', '#e06c9f'];
const KINDS: Kind[] = ['circle', 'square', 'triangle', 'diamond', 'star'];

function drawShape(ctx: CanvasRenderingContext2D, s: Shape) {
  ctx.save();
  ctx.translate(s.x, s.y);
  ctx.rotate(s.rot);
  if (s.half) {
    ctx.beginPath();
    ctx.rect(s.half < 0 ? -s.r * 1.5 : 0, -s.r * 1.5, s.r * 1.5, s.r * 3);
    ctx.clip();
  }
  ctx.fillStyle = s.color;
  ctx.shadowColor = s.color;
  ctx.shadowBlur = 14;
  ctx.globalAlpha = Math.min(1, s.life);
  ctx.beginPath();
  const r = s.r;
  switch (s.kind) {
    case 'circle': ctx.arc(0, 0, r, 0, Math.PI * 2); break;
    case 'square': ctx.rect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6); break;
    case 'triangle': ctx.moveTo(0, -r); ctx.lineTo(r * 0.9, r * 0.7); ctx.lineTo(-r * 0.9, r * 0.7); ctx.closePath(); break;
    case 'diamond': ctx.moveTo(0, -r); ctx.lineTo(r * 0.75, 0); ctx.lineTo(0, r); ctx.lineTo(-r * 0.75, 0); ctx.closePath(); break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = (i * Math.PI) / 5 - Math.PI / 2;
        const rr = i % 2 ? r * 0.45 : r;
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      break;
  }
  ctx.fill();
  ctx.restore();
}

function segHitsCircle(a: Point, b: Point, cx: number, cy: number, r: number) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((cx - a.x) * dx + (cy - a.y) * dy) / len2));
  const px = a.x + t * dx - cx, py = a.y + t * dy - cy;
  return px * px + py * py <= r * r;
}

export function SliceGame() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let w = 0, h = 0, dpr = 1;
    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const shapes: Shape[] = [];
    let trail: Point[] = [];
    let down = false;
    let last = performance.now();
    let spawnIn = 0;
    let raf = 0;
    let localScore = 0;

    const spawn = () => {
      const r = 16 + Math.random() * 14;
      const x = w * (0.15 + Math.random() * 0.7);
      shapes.push({
        x, y: h + r, vx: (w / 2 - x) * (0.4 + Math.random() * 0.6) / 1.2, vy: -(h * (1.05 + Math.random() * 0.35)),
        r, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 4, kind: KINDS[Math.floor(Math.random() * KINDS.length)],
        color: COLORS[Math.floor(Math.random() * COLORS.length)], sliced: false, life: 1,
      });
    };

    const pos = (e: PointerEvent): Point => {
      const rect = canvas.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top, t: performance.now() };
    };
    const onDown = (e: PointerEvent) => { down = true; trail = [pos(e)]; canvas.setPointerCapture(e.pointerId); };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      const p = pos(e);
      const prev = trail[trail.length - 1];
      trail.push(p);
      if (!prev) return;
      for (const s of shapes) {
        if (s.sliced || !segHitsCircle(prev, p, s.x, s.y, s.r)) continue;
        s.sliced = true;
        s.life = 1;
        const ang = Math.atan2(p.y - prev.y, p.x - prev.x);
        const left: Shape = { ...s, half: -1, vx: s.vx - 60 + Math.sin(ang) * 40, vy: s.vy * 0.3, rot: ang + Math.PI / 2, vr: -3 };
        const right: Shape = { ...s, half: 1, vx: s.vx + 60 - Math.sin(ang) * 40, vy: s.vy * 0.3, rot: ang + Math.PI / 2, vr: 3 };
        shapes.push(left, right);
        s.life = 0;
        localScore += s.kind === 'star' ? 3 : 1;
        setScore(localScore);
      }
    };
    const onUp = () => { down = false; };
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    const g = () => h * 0.9;
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      spawnIn -= dt;
      if (spawnIn <= 0) {
        spawn();
        if (Math.random() < 0.3) spawn();
        spawnIn = 0.6 + Math.random() * 0.9;
      }
      ctx.clearRect(0, 0, w, h);
      for (let i = shapes.length - 1; i >= 0; i--) {
        const s = shapes[i];
        s.vy += g() * dt;
        s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
        if (s.half) s.life -= dt * 0.8;
        if (s.y > h + 60 || s.life <= 0) { shapes.splice(i, 1); continue; }
        drawShape(ctx, s);
      }
      const now = performance.now();
      trail = trail.filter((p) => now - p.t < 160);
      if (trail.length > 1) {
        ctx.strokeStyle = 'rgba(255,240,200,0.85)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        trail.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
    };
  }, []);

  return (
    <div className="minigame">
      <div className="score">✦ {score}</div>
      <canvas ref={ref} />
      <div className="hint">Swipe to slice the lanterns</div>
    </div>
  );
}
