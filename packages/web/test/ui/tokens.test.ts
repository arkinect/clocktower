import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(path.resolve(__dirname, '../../src/ui/tokens.css'), 'utf8');
const tokens = (block: string) =>
  Object.fromEntries([...block.matchAll(/--([a-z0-9-]+): (#[0-9a-f]{6});/g)].map((m) => [m[1], m[2]]));

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const t = tokens(css);

describe('the theme', () => {
  it('every text colour is readable on its background', () => {
    const text = ['text', 'muted', 'gold', 'error', 'townsfolk', 'outsider', 'minion', 'demon'];
    const pairs = text.flatMap((key) => [
      [key, 'bg'],
      [key, 'card'],
    ]);
    for (const [key, bg] of [...pairs, ['on-gold', 'gold']] as [string, string][]) {
      expect(contrast(t[key] as string, t[bg] as string), `${key} on ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('is dark only', () => {
    expect(css).not.toContain('prefers-color-scheme');
  });
});
