// The Storyteller console: tabs are URLs, and every panel renders only what StorytellerView carries.
import { useEffect, useRef } from 'react';
import type { StorytellerView } from '@ct/protocol';
import { navigate } from '../app/router';
import { useGame } from '../app/store';
import { NightOrder, RoleList } from '../player/parts';
import { Card } from '../ui/ui';
import { Day } from './Day';
import { Grimoire } from './Grimoire';
import { Lobby } from './Lobby';
import { Night } from './Night';
import { Review } from './Review';
import { Setup } from './Setup';
import { Log, Story } from './Story';
import { phaseText } from './common';
import styles from './console.module.css';

const TABS = [
  ['lobby', 'Lobby'],
  ['setup', 'Setup'],
  ['night', 'Night'],
  ['review', 'Review'],
  ['day', 'Day'],
  ['grimoire', 'Grimoire'],
  ['story', 'Story'],
  ['log', 'Log'],
  ['reference', 'Reference'],
] as const;

type Tab = (typeof TABS)[number][0];

function phaseTab(view: StorytellerView): Tab {
  const { kind, stage } = view.phase;
  if (kind === 'night') return stage === 'review' ? 'review' : 'night';
  if (kind === 'ended') return 'grimoire';
  return kind;
}

export default function Console({ view, tab }: { view: StorytellerView; tab: string | null }) {
  const { catalog, jinxes } = useGame();
  const live = phaseTab(view);
  const current = (TABS.some(([t]) => t === tab) ? tab : live) as Tab;
  const base = `/g/${encodeURIComponent(view.code)}/storyteller`;

  // Follow the game when its phase moves on. Reading an older tab stays possible in between.
  const was = useRef(live);
  useEffect(() => {
    if (was.current !== live) navigate(`${base}/${live}`);
    was.current = live;
  }, [live, base]);

  // The console is always dark, as it was before 0.5.0. Player phones keep following their own setting.
  useEffect(() => {
    document.documentElement.dataset['theme'] = 'dark';
    return () => {
      delete document.documentElement.dataset['theme'];
    };
  }, []);

  const seated = view.players.filter((p) => p.seat !== null).length;
  const online = view.players.filter((p) => p.connected).length;

  return (
    <div className={styles['console']}>
      <header className={styles['head']}>
        <b>Storyteller</b> <span className={styles['phase']}>{phaseText(view)}</span>
        <span className="muted small">
          {seated} seated, {online} online
        </span>
      </header>
      <nav className={styles['tabs']} aria-label="Console sections">
        {TABS.map(([t, label]) => (
          <a
            key={t}
            href={`${base}/${t}`}
            aria-current={t === current ? 'page' : undefined}
            className={t === current ? styles['tabOn'] : t === live ? styles['tabLive'] : ''}
            onClick={(e) => {
              e.preventDefault();
              navigate(`${base}/${t}`);
            }}
          >
            {label}
          </a>
        ))}
      </nav>
      <main className={styles['main']}>
        {view.phase.kind === 'ended' && (
          <Card tone="notice">
            {view.phase.winner ? `The game is over: ${view.phase.winner} wins.` : 'The game is over.'}
          </Card>
        )}
        {current === 'lobby' && <Lobby view={view} />}
        {current === 'setup' && <Setup view={view} />}
        {current === 'night' && <Night view={view} />}
        {current === 'review' && <Review view={view} />}
        {current === 'day' && <Day view={view} />}
        {current === 'grimoire' && <Grimoire view={view} />}
        {current === 'story' && <Story view={view} />}
        {current === 'log' && <Log view={view} />}
        {current === 'reference' && (
          <div className={styles['columns']}>
            <div>
              <h2>Roles on the script</h2>
              <RoleList script={view.script} catalog={catalog} jinxes={jinxes} />
            </div>
            <div>
              <h2>Night order</h2>
              <NightOrder script={view.script} catalog={catalog} />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
