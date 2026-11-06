// Phase and role-type wording, and the input sheet that replaces the browser prompt.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { GameState } from '@ct/shared';
import { CirclePanel } from '../src/admin/Circle';
import { phaseName, type AdminCtx } from '../src/admin/AdminApp';
import { InputSheet, typeName } from '../src/common';

const state = (phase: GameState['phase']) => ({ phase, nightNumber: 1, dayNumber: 2, setup: { demonBluffs: [] }, assignments: {}, effects: [] }) as unknown as GameState;

describe('phase names', () => {
  it('the Circle centre shows the phase name, not the raw phase', () => {
    const ctx = { s: state('SETUP'), view: { impairment: {}, presence: {} }, seated: ['p1'], names: { p1: 'Ada' }, isDead: () => false } as unknown as AdminCtx;
    const html = renderToStaticMarkup(<CirclePanel ctx={ctx} />);
    expect(html).toContain('<b>Setup</b>');
    expect(html).not.toContain('SETUP');
  });

  it('night phases say "Night" once', () => {
    expect(phaseName(state('NIGHT_COLLECTING'))).toBe('Night 1 — collecting');
    expect(phaseName(state('NIGHT_RESOLVING'))).toBe('Night 1 — review');
    expect(phaseName(state('DAY'))).toBe('Day 2');
    expect(phaseName(state('ENDED'))).toBe('Game over');
  });
});

describe('typeName', () => {
  it('is the capitalised singular', () => {
    expect(['townsfolk', 'outsider', 'minion', 'demon'].map((t) => typeName(t as 'demon'))).toEqual(['Townsfolk', 'Outsider', 'Minion', 'Demon']);
  });
});

describe('InputSheet', () => {
  it('shows a labelled, prefilled input with Cancel before Save', () => {
    const html = renderToStaticMarkup(<InputSheet title="Rename Ada" label="New name" initial="Ada" onSave={async () => ({ ok: true })} onClose={() => {}} />);
    expect(html).toContain('<span>New name</span>');
    expect(html).toContain('value="Ada"');
    expect(html.indexOf('Cancel')).toBeLessThan(html.indexOf('Save'));
  });
});
