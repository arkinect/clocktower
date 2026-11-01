// The ended screens show why an app update ended the game (design.md section 5.5).
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PlayerView } from '@ct/shared';
import { EndedReason } from '../src/common';
import { GameOver } from '../src/player/PlayerApp';

const view = (endedReason?: PlayerView['endedReason']) =>
  ({ kind: 'player', phase: 'ENDED', endedReason, me: { name: 'Ada', messages: [] } }) as unknown as PlayerView;

describe('ended screen', () => {
  it('shows the update message', () => {
    expect(renderToStaticMarkup(<GameOver view={view('update')} />)).toContain('This game was ended by an app update.');
  });

  it('shows the abandoned message', () => {
    expect(renderToStaticMarkup(<GameOver view={view('abandoned')} />))
      .toContain('This game was ended for an app update after 4 hours without progress.');
  });

  it('shows nothing extra when the Storyteller ended the game, or an older server sends no reason', () => {
    for (const r of [null, undefined]) {
      const html = renderToStaticMarkup(<GameOver view={view(r)} />);
      expect(html).toContain('Game over');
      expect(html).not.toContain('app update');
    }
    expect(renderToStaticMarkup(<EndedReason reason={null} />)).toBe('');
  });
});
