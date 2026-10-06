// 2048: slide tiles, merge equal numbers. Swipe or use arrow keys. Local only, nothing sent anywhere.
// Tiles keep an id so they slide (CSS transform transition) and pop when they merge or appear.
import { useCallback, useEffect, useRef, useState } from 'react';

const N = 4;
const BEST_KEY = 'ct_2048_best';
const SLIDE_MS = 110;

interface Tile { id: number; v: number; r: number; c: number; isNew?: boolean; merged?: boolean; dying?: boolean }
type Dir = 'left' | 'right' | 'up' | 'down';

let nextId = 1;

function addTile(tiles: Tile[]): Tile[] {
  const taken = new Set(tiles.filter((t) => !t.dying).map((t) => t.r * N + t.c));
  const empty = Array.from({ length: N * N }, (_, i) => i).filter((i) => !taken.has(i));
  if (!empty.length) return tiles;
  const i = empty[Math.floor(Math.random() * empty.length)];
  return [...tiles, { id: nextId++, v: Math.random() < 0.9 ? 2 : 4, r: Math.floor(i / N), c: i % N, isNew: true }];
}

function newGame(): Tile[] {
  return addTile(addTile([]));
}

/** Cell (r, c) for position j along line k when sliding toward `dir`. */
function cellAt(dir: Dir, k: number, j: number): [number, number] {
  switch (dir) {
    case 'left': return [k, j];
    case 'right': return [k, N - 1 - j];
    case 'up': return [j, k];
    case 'down': return [N - 1 - j, k];
  }
}

function move(tiles: Tile[], dir: Dir): { tiles: Tile[]; gained: number; moved: boolean } {
  const live = tiles.filter((t) => !t.dying).map((t) => ({ ...t, isNew: false, merged: false }));
  const at = new Map(live.map((t) => [t.r * N + t.c, t]));
  const out: Tile[] = [];
  let gained = 0;
  let moved = false;
  for (let k = 0; k < N; k++) {
    let slot = 0;
    let prev: Tile | null = null;
    for (let j = 0; j < N; j++) {
      const [r, c] = cellAt(dir, k, j);
      const t = at.get(r * N + c);
      if (!t) continue;
      if (prev && prev.v === t.v && !prev.merged) {
        // t slides onto prev and disappears; prev doubles.
        prev.v *= 2;
        prev.merged = true;
        gained += prev.v;
        out.push({ ...t, r: prev.r, c: prev.c, dying: true });
        moved = true;
        continue;
      }
      const [nr, nc] = cellAt(dir, k, slot++);
      if (nr !== t.r || nc !== t.c) moved = true;
      t.r = nr;
      t.c = nc;
      out.push(t);
      prev = t;
    }
  }
  return { tiles: out, gained, moved };
}

function canMove(tiles: Tile[]): boolean {
  return (['left', 'right', 'up', 'down'] as Dir[]).some((d) => move(tiles, d).moved);
}

function loadBest(): number {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}

export function Game2048() {
  const [tiles, setTiles] = useState<Tile[]>(newGame);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(loadBest);
  const busy = useRef(false);
  const start = useRef<{ x: number; y: number } | null>(null);
  const live = tiles.filter((t) => !t.dying);
  const over = !busy.current && !canMove(live);
  const won = live.some((t) => t.v >= 2048);

  const go = useCallback((dir: Dir) => {
    if (busy.current) return;
    setTiles((cur) => {
      const r = move(cur, dir);
      if (!r.moved) return cur;
      busy.current = true;
      if (r.gained) {
        setScore((s) => {
          const ns = s + r.gained;
          setBest((b) => {
            const nb = Math.max(b, ns);
            try { localStorage.setItem(BEST_KEY, String(nb)); } catch { /* private mode */ }
            return nb;
          });
          return ns;
        });
      }
      // After the slide finishes: drop merged-away tiles and add a new one.
      window.setTimeout(() => {
        setTiles((after) => addTile(after.filter((t) => !t.dying)));
        busy.current = false;
      }, SLIDE_MS);
      return r.tiles;
    });
  }, []);

  useEffect(() => {
    const keys: Record<string, Dir> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    const onKey = (e: KeyboardEvent) => {
      const d = keys[e.key];
      if (!d || (e.target as HTMLElement)?.tagName === 'SELECT') return;
      e.preventDefault();
      go(d);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  const onDown = (e: React.PointerEvent) => { start.current = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x, dy = e.clientY - s.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
    go(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  };
  const restart = () => { setTiles(newGame()); setScore(0); };

  return (
    <div className="minigame g2048" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => { start.current = null; }}>
      <div className="g2048-head">
        <span className="score2048">✦ {score} <span className="muted small">· best {best}</span></span>
        <button className="tiny" onClick={restart}>New game</button>
      </div>
      <div className="g2048-board">
        {Array.from({ length: N * N }, (_, i) => <div key={i} className="cell2048" />)}
        <div className="tiles2048">
          {tiles.map((t) => (
            <div key={t.id} className={`tilepos${t.dying ? ' dying' : ''}`} style={{ transform: `translate(calc(${t.c} * (100% + var(--gap2048))), calc(${t.r} * (100% + var(--gap2048))))` }}>
              {/* Keyed by value so the pop animation replays on merge. */}
              <div key={t.v} className={`tile t${Math.min(t.v, 4096)}${t.isNew ? ' appear' : ''}${t.merged ? ' pop' : ''}`}>{t.v}</div>
            </div>
          ))}
        </div>
        {(over || won) && (
          <div className="g2048-over">
            <div>{won && !over ? 'You made 2048!' : 'No moves left'}</div>
            <button className="primary" onClick={restart}>{won && !over ? 'Start over' : 'Try again'}</button>
            {won && !over && <span className="muted small">or keep sliding</span>}
          </div>
        )}
      </div>
      <div className="hint">Swipe to slide the tiles</div>
    </div>
  );
}
