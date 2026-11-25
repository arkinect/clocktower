// The steward's console: they run an autoplay game and play in it. Every panel renders only what StewardView carries,
// which is what the table knows. Their own character and results are on My role, and what they are asked on Actions,
// so that running the game never looks different.
import { useEffect, useRef } from 'react';
import type { StewardView } from '@ct/protocol';
import { navigate } from '../app/router';
import { useCommand, useGame } from '../app/store';
import { NightOrder, RoleList } from '../player/parts';
import { Log } from '../storyteller/Story';
import styles from '../storyteller/console.module.css';
import { Button, Card, HoldButton } from '../ui/ui';
import { Actions, asked } from './Actions';
import { phaseText } from './common';
import { Day } from './Day';
import { Lobby } from './Lobby';
import { MyRole } from './MyRole';
import { Night } from './Night';
import { Setup } from './Setup';
import { Story } from './Story';
import { Table } from './Table';

const TABS = [
  ['lobby', 'Lobby'],
  ['setup', 'Setup'],
  ['night', 'Night'],
  ['day', 'Day'],
  ['table', 'Table'],
  ['actions', 'Actions'],
  ['role', 'My role'],
  ['story', 'Story'],
  ['log', 'Log'],
  ['reference', 'Reference'],
] as const;

type Tab = (typeof TABS)[number][0];

const phaseTab = (view: StewardView): Tab => (view.phase.kind === 'ended' ? 'story' : view.phase.kind);

/** The log replays the whole game, so it opens once the game has ended. The server refuses it until then. */
const shownTabs = (view: StewardView) => TABS.filter(([t]) => t !== 'log' || view.phase.kind === 'ended');

export default function Console({ view, tab }: { view: StewardView; tab: string | null }) {
  const { catalog, jinxes } = useGame();
  const tabs = shownTabs(view);
  const live = phaseTab(view);
  const current = (tabs.some(([t]) => t === tab) ? tab : live) as Tab;
  const base = `/g/${encodeURIComponent(view.code)}/steward`;
  const was = useRef(live);
  useEffect(() => {
    if (was.current !== live) navigate(`${base}/${live}`);
    was.current = live;
  }, [live, base]);
  const seated = view.players.filter((p) => p.seat !== null).length;
  const online = view.players.filter((p) => p.connected).length;
  const seat = view.players.find((p) => p.id === view.meId)?.seat ?? null;
  const lit = (t: Tab) => t === live || (t === 'actions' && asked(view.me));
  return (
    <div className={styles['console']}>
      <header className={styles['head']}>
        <b>Autoplay</b> <span className={styles['phase']}>{phaseText(view)}</span>
        <span className="muted small">
          {seat !== null && `You are in seat ${seat + 1}. `}
          {seated} seated, {online} online
        </span>
      </header>
      <div className={styles['tabbar']}>
        <nav className={styles['tabs']} aria-label="Console sections">
          {tabs.map(([t, label]) => (
            <a
              key={t}
              href={`${base}/${t}`}
              aria-current={t === current ? 'page' : undefined}
              className={t === current ? styles['tabOn'] : lit(t) ? styles['tabLive'] : ''}
              onClick={(e) => {
                e.preventDefault();
                navigate(`${base}/${t}`);
              }}
            >
              {label}
            </a>
          ))}
        </nav>
      </div>
      <main className={styles['main']}>
        {view.over && view.phase.kind !== 'ended' && <Over winner={view.over.winner} />}
        {view.phase.kind === 'ended' && <Ended winner={view.phase.winner} />}
        {current === 'lobby' && <Lobby view={view} />}
        {current === 'setup' && <Setup view={view} />}
        {current === 'night' && <Night view={view} />}
        {current === 'day' && <Day view={view} />}
        {current === 'table' && <Table view={view} />}
        {current === 'actions' && <Actions view={view.me} />}
        {current === 'role' && <MyRole view={view} />}
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

const wins = (winner: 'good' | 'evil' | null) =>
  winner === 'good' ? 'Good wins.' : winner === 'evil' ? 'Evil wins.' : 'Nobody wins.';

/** Decided: nothing else can be pressed, and phones end with the press. */
function Over({ winner }: { winner: 'good' | 'evil' | null }) {
  const { run, pending } = useCommand();
  return (
    <Card tone="notice">
      <h2>The game is over: {wins(winner)}</h2>
      <HoldButton big variant="primary" disabled={pending} onConfirm={() => void run({ type: 'announce_end' })}>
        Announce
      </HoldButton>
    </Card>
  );
}

function Ended({ winner }: { winner: 'good' | 'evil' | null }) {
  const { run, pending } = useCommand();
  return (
    <Card tone="notice">
      <p>{winner ? `The game is over. ${wins(winner)}` : 'The game ended with no winner.'}</p>
      <div className="row">
        <Button variant="primary" disabled={pending} onClick={() => void run({ type: 'steward_play_again' })}>
          Play again
        </Button>
        <HoldButton disabled={pending} onConfirm={() => void run({ type: 'steward_new_game' })}>
          New game, everyone out
        </HoldButton>
      </div>
    </Card>
  );
}
