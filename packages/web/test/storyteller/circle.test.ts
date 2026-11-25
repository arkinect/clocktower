import { describe, expect, it } from 'vitest';
import { seatPlace, seatSize } from '../../src/storyteller/circle';

const ROOM = 0.0001;

describe('the circle of seats', () => {
  it('puts seat 1 at the top and goes clockwise', () => {
    const [top, right] = [seatPlace(0, 4), seatPlace(1, 4)];
    expect(top.left + top.size / 2).toBeCloseTo(50);
    expect(top.top).toBeCloseTo(0);
    expect(right.left + right.size).toBeCloseTo(100);
    expect(right.top + right.size / 2).toBeCloseTo(50);
  });

  it('fits 2 to 30 seats with no two overlapping', () => {
    for (let n = 2; n <= 30; n++) {
      const places = Array.from({ length: n }, (_, i) => seatPlace(i, n));
      for (const p of places) {
        expect(p.left, `${n} seats`).toBeGreaterThanOrEqual(-ROOM);
        expect(p.top, `${n} seats`).toBeGreaterThanOrEqual(-ROOM);
        expect(p.left + p.size, `${n} seats`).toBeLessThanOrEqual(100 + ROOM);
        expect(p.top + p.size, `${n} seats`).toBeLessThanOrEqual(100 + ROOM);
      }
      places.forEach((a, i) => {
        for (const b of places.slice(i + 1)) {
          const apart = Math.max(Math.abs(a.left - b.left), Math.abs(a.top - b.top));
          expect(apart, `${n} seats`).toBeGreaterThanOrEqual(a.size * 0.7);
        }
      });
      expect(seatSize(n)).toBeGreaterThan(0);
    }
  });
});
