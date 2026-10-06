// "Night Flight": an original tap-to-flap idle game. A bat flies between clock-tower spires.
// Plain Canvas 2D, no assets, no network, nothing sent anywhere.
import { useEffect, useRef, useState } from 'react';

interface Spire { x: number; gapY: number; passed: boolean }

export function FlapGame() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);

  useEffect(() => {
    const canvas = ref.current!;
    const ctx = canvas.getContext('2d')!;
    let w = 0, h = 0;
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    // Tuned relative to the play-field height so it feels the same on any phone.
    const G = () => h * 2.2;           // gravity, px/s²
    const FLAP = () => -h * 0.62;      // flap velocity
    const SPEED = () => Math.max(110, w * 0.42);
    const GAP = () => Math.max(120, h * 0.3);
    const SPIRE_W = 54;

    let state: 'ready' | 'flying' | 'crashed' = 'ready';
    let y = 0, vy = 0, t = 0, local = 0, crashedAt = 0;
    let spires: Spire[] = [];
    const batX = () => w * 0.28;
    const R = 13;

    const reset = () => {
      y = h * 0.45; vy = 0; spires = []; local = 0; setScore(0); state = 'ready';
    };
    reset();

    const addSpire = (x: number) => {
      const margin = h * 0.12;
      spires.push({ x, gapY: margin + Math.random() * (h - 2 * margin - GAP()) + GAP() / 2, passed: false });
    };

    const flap = () => {
      if (state === 'crashed') {
        if (performance.now() - crashedAt < 500) return; // avoid instant restart from a frantic tap
        reset();
      }
      if (state === 'ready') { state = 'flying'; addSpire(w + 40); }
      vy = FLAP();
    };
    const onDown = (e: PointerEvent) => { e.preventDefault(); flap(); };
    canvas.addEventListener('pointerdown', onDown);

    const crash = () => {
      state = 'crashed';
      crashedAt = performance.now();
      setBest((b) => Math.max(b, local));
    };

    const drawSpire = (x: number, top: number, bottom: number) => {
      const grad = ctx.createLinearGradient(x, 0, x + SPIRE_W, 0);
      grad.addColorStop(0, '#2c2547'); grad.addColorStop(0.5, '#463b70'); grad.addColorStop(1, '#2c2547');
      ctx.fillStyle = grad;
      // upper tower hanging down, with a pointed tip
      ctx.fillRect(x, 0, SPIRE_W, top - 14);
      ctx.beginPath(); ctx.moveTo(x, top - 14); ctx.lineTo(x + SPIRE_W / 2, top); ctx.lineTo(x + SPIRE_W, top - 14); ctx.fill();
      // lower tower with a spire roof
      ctx.beginPath(); ctx.moveTo(x, bottom + 22); ctx.lineTo(x + SPIRE_W / 2, bottom); ctx.lineTo(x + SPIRE_W, bottom + 22); ctx.fill();
      ctx.fillRect(x, bottom + 22, SPIRE_W, h - bottom);
      // a lit window
      ctx.fillStyle = '#e8b04a55';
      ctx.fillRect(x + SPIRE_W / 2 - 5, bottom + 40, 10, 14);
    };

    const drawBat = (x: number, yy: number, flapPhase: number) => {
      ctx.save();
      ctx.translate(x, yy);
      ctx.rotate(Math.max(-0.5, Math.min(0.9, vy / (h * 1.2))));
      ctx.fillStyle = state === 'crashed' ? '#d9534f' : '#e8b04a';
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 10;
      const wing = Math.sin(flapPhase) * 9;
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.quadraticCurveTo(-14, -10 - wing, -24, -2 - wing); ctx.quadraticCurveTo(-14, 2, -6, 6); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 0); ctx.quadraticCurveTo(14, -10 - wing, 24, -2 - wing); ctx.quadraticCurveTo(14, 2, 6, 6); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 2, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#14111f'; ctx.shadowBlur = 0;
      ctx.fillRect(-3, 0, 2, 2); ctx.fillRect(2, 0, 2, 2);
      ctx.restore();
    };

    let last = performance.now();
    let raf = 0;
    const frame = (now: number) => {
      const dt = Math.min(0.04, (now - last) / 1000);
      last = now;
      t += dt;
      ctx.clearRect(0, 0, w, h);
      // moon
      ctx.fillStyle = '#f3e9c622';
      ctx.beginPath(); ctx.arc(w * 0.8, h * 0.18, 26, 0, Math.PI * 2); ctx.fill();

      if (state === 'flying') {
        vy += G() * dt;
        y += vy * dt;
        for (const s of spires) s.x -= SPEED() * dt;
        if (spires.length && spires[spires.length - 1].x < w - Math.max(200, w * 0.55)) addSpire(w + 20);
        spires = spires.filter((s) => s.x > -SPIRE_W - 10);
        for (const s of spires) {
          if (!s.passed && s.x + SPIRE_W < batX() - R) { s.passed = true; local++; setScore(local); }
          const inX = batX() + R > s.x && batX() - R < s.x + SPIRE_W;
          if (inX && (y - R < s.gapY - GAP() / 2 || y + R > s.gapY + GAP() / 2)) crash();
        }
        if (y + R > h || y - R < 0) crash();
      } else if (state === 'ready') {
        y = h * 0.45 + Math.sin(t * 3) * 8;
      } else if (y + R < h) {
        vy += G() * dt; y = Math.min(h - R, y + vy * dt);
      }

      for (const s of spires) drawSpire(s.x, s.gapY - GAP() / 2, s.gapY + GAP() / 2);
      drawBat(batX(), y, state === 'crashed' ? 0 : t * (vy < 0 ? 28 : 12));

      if (state !== 'flying') {
        ctx.fillStyle = '#ffffffaa';
        ctx.font = '600 18px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(state === 'ready' ? 'Tap to fly' : 'Tap to try again', w / 2, h * 0.7);
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', onDown);
    };
  }, []);

  return (
    <div className="minigame">
      <div className="score">✦ {score}{best > 0 ? <span className="muted small"> · best {best}</span> : null}</div>
      <canvas ref={ref} />
      <div className="hint">Tap to flap between the spires</div>
    </div>
  );
}
