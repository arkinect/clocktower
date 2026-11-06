// Where each seat sits on the Grimoire, as percentages of the circle. Seat 1 is at the top; seats go clockwise.

const LARGEST = 24;

export interface SeatPlace {
  left: number;
  top: number;
  size: number;
}

/** The largest square seat that fits: neighbours just miss each other, and none crosses the edge of the circle. */
export function seatSize(n: number): number {
  if (n < 3) return LARGEST;
  const s = Math.sin(Math.PI / n);
  return Math.min(LARGEST, (100 * s) / (1 + s));
}

export function seatPlace(i: number, n: number): SeatPlace {
  const size = seatSize(n);
  const radius = 50 - size / 2;
  const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
  return {
    left: 50 + radius * Math.cos(angle) - size / 2,
    top: 50 + radius * Math.sin(angle) - size / 2,
    size,
  };
}
