// A thin renderer of PlayerView. It holds no rules: every option and message comes from the server.
import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import type { ActionSpec, Choice, PlayerView } from '@ct/protocol';
import { useCommand, useGame, useNames } from '../app/store';
import { Picker, choiceComplete } from '../ui/Picker';
import { Button, Card, Countdown, Sheet, SheetActions } from '../ui/ui';
import { Messages, NightOrder, RoleCardView, RoleList, Seating } from './parts';
import styles from './player.module.css';

const NightGames = lazy(() => import('../games/NightGames'));

type Tab = 'home' | 'role' | 'roles' | 'order' | 'seats';

export function PlayerApp({ view }: { view: PlayerView }) {
  const [tab, setTab] = useState<Tab>('home');
  const { catalog, jinxes } = useGame();
  const kind = view.phase.kind;
  const night = kind === 'night';
  const collectingOrLater = night && view.phase.stage !== 'briefing';
  const tabs: [Tab, string][] = [
    ['home', night ? 'Night' : kind === 'day' ? 'Day' : 'Game'],
    ['role', 'My role'],
    ['roles', 'Roles'],
    ['order', 'Order'],
    ['seats', 'Seats'],
  ];
  return (
    <div className={styles['player']}>
      <main className={tab === 'home' && collectingOrLater ? styles['full'] : styles['main']}>
        {tab === 'home' && <Home view={view} />}
        {tab === 'role' && (
          <div className="pad">
            <h2>My role</h2>
            <RoleCardView role={view.me.role} />
            <Messages messages={view.me.messages.filter((m) => m.kind === 'starting')} />
            {view.me.grants.map((g) => (
              <Card key={g.title}>
                <b>{g.title}</b>
                {g.lines.map((l, i) => (
                  <p key={i}>{l}</p>
                ))}
              </Card>
            ))}
            {!view.me.alive && <Card tone="dead">You are dead.</Card>}
          </div>
        )}
        {tab === 'roles' && (
          <div className="pad">
            <h2>Roles in this game&apos;s script</h2>
            <RoleList script={view.script} catalog={catalog} jinxes={jinxes} />
          </div>
        )}
        {tab === 'order' && (
          <div className="pad">
            <h2>Night order</h2>
            <NightOrder script={view.script} catalog={catalog} />
          </div>
        )}
        {tab === 'seats' && (
          <div className="pad">
            <h2>Seating</h2>
            <Seating view={view} catalog={catalog} />
          </div>
        )}
      </main>
      {view.me.questions.length > 0 && <Questions key={view.me.questions[0]?.key} specs={view.me.questions} />}
      <nav className={styles['tabs']} aria-label="Sections">
        {tabs.map(([t, label]) => (
          <button
            key={t}
            type="button"
            className={tab === t ? styles['tabOn'] : ''}
            aria-current={tab === t ? 'page' : undefined}
            onClick={() => setTab(t)}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Home({ view }: { view: PlayerView }) {
  const { kind, stage } = view.phase;
  if (kind === 'lobby' || kind === 'setup') return <Lobby view={view} />;
  if (kind === 'ended') return <Ended view={view} />;
  if (!view.me.seated) {
    return (
      <div className="pad">
        <Card>You are watching this game. The Storyteller can seat you for the next one.</Card>
      </div>
    );
  }
  if (kind === 'night') return stage === 'briefing' ? <RoleReveal view={view} /> : <Night view={view} />;
  return <Day view={view} />;
}

function Lobby({ view }: { view: PlayerView }) {
  const { run, pending } = useCommand();
  const others = view.players.filter((p) => !p.isStoryteller);
  return (
    <div className="pad">
      <h2>Welcome, {view.me.name}</h2>
      <Card>
        <p>
          {view.phase.kind === 'setup' ? 'The Storyteller is setting up the game.' : 'Waiting for the Storyteller.'}
        </p>
        {!view.hasStoryteller && (
          <>
            <p>Nobody is the Storyteller yet.</p>
            <Button disabled={pending} onClick={() => void run({ type: 'claim_storyteller' })}>
              Become Storyteller
            </Button>
          </>
        )}
      </Card>
      <h3>Players ({others.length})</h3>
      <ul>
        {others.map((p) => (
          <li key={p.id}>
            {p.name}
            {p.id === view.me.id ? ' (you)' : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

function RoleReveal({ view }: { view: PlayerView }) {
  const { run, pending } = useCommand();
  return (
    <div className="pad">
      <h2>Night 0 begins</h2>
      <p className="muted">Make sure nobody can see your screen.</p>
      <RoleCardView role={view.me.role} />
      <Messages messages={view.me.messages.filter((m) => m.kind === 'starting')} />
      {view.me.hasSeenRole ? (
        <Card>Thanks. Wait for the Storyteller to start the night.</Card>
      ) : (
        <Button variant="primary" big disabled={pending} onClick={() => void run({ type: 'seen_role' })}>
          I have seen my role
        </Button>
      )}
    </div>
  );
}

function useDead(view: PlayerView) {
  return useMemo(() => new Set<string>(view.deadAtDawn), [view.deadAtDawn]);
}

function Night({ view }: { view: PlayerView }) {
  const specs = view.me.actions;
  const names = useNames();
  const dead = useDead(view);
  const { run, pending } = useCommand();
  const [choice, setChoice] = useState<Record<string, Choice>>(view.me.submission ?? {});
  const [sheet, setSheet] = useState(false);
  const [editing, setEditing] = useState(false);
  const collecting = view.phase.stage === 'collecting';
  const n = view.phase.n;

  useEffect(() => {
    setChoice({});
    setEditing(false);
    setSheet(false);
  }, [n]);

  const complete = specs.every((s) => choiceComplete(s, choice[s.key]));
  const submit = async () => {
    const ack = await run({ type: 'submit_night', actions: specs.length ? choice : {} });
    if (ack.ok) {
      setSheet(false);
      setEditing(false);
    }
  };
  const done = view.me.submitted && !editing;
  // Games unlock only after the player has finished their night action, or the night has closed.
  const unlocked = view.me.submitted || !collecting;

  return (
    <div className={styles['night']}>
      <header className={styles['nightHead']}>
        <span className={styles['nightLabel']}>Night {n}</span>
        <Countdown endsAt={view.phase.deadline} offset={view.serverNow - Date.now()} />
      </header>
      {unlocked ? (
        <Suspense fallback={<div className={styles['lock']} />}>
          <NightGames owner={view.me.id} />
        </Suspense>
      ) : (
        <div className={styles['lock']}>
          <div className={styles['lockIcon']}>☾</div>
          <p>{specs.length ? 'Make your night choice and submit it.' : 'Press Continue below.'}</p>
          <p className="muted small">The games unlock once you are done.</p>
        </div>
      )}
      <footer className={styles['nightBar']}>
        {done || !collecting ? (
          <div className={styles['waiting']}>
            <span>{view.me.submitted ? 'Submitted. Waiting for everyone.' : 'The night is ending.'}</span>
            {collecting && specs.length > 0 && (
              <Button
                tiny
                onClick={() => {
                  setEditing(true);
                  setSheet(true);
                }}
              >
                Change
              </Button>
            )}
          </div>
        ) : !specs.length ? (
          <>
            <div className={styles['waiting']}>No night action tonight.</div>
            <Button variant="primary" disabled={pending} onClick={() => void submit()}>
              Continue
            </Button>
          </>
        ) : (
          <Button variant="primary" onClick={() => setSheet(true)}>
            Night action
          </Button>
        )}
      </footer>
      {sheet && collecting && (
        <Sheet title="Night action" onClose={() => setSheet(false)}>
          <Picker specs={specs} names={names} value={choice} onChange={setChoice} dead={dead} />
          <SheetActions>
            <Button onClick={() => setSheet(false)}>Close</Button>
            <Button variant="primary" disabled={!complete || pending} onClick={() => void submit()}>
              Submit
            </Button>
          </SheetActions>
        </Sheet>
      )}
    </div>
  );
}

/** Questions a role asks while the Storyteller reviews the night. */
function Questions({ specs }: { specs: ActionSpec[] }) {
  const names = useNames();
  const { run, pending } = useCommand();
  const [choice, setChoice] = useState<Record<string, Choice>>({});
  const complete = specs.every((s) => choiceComplete(s, choice[s.key]));
  const submit = async () => {
    for (const s of specs) {
      const answer = choice[s.key];
      if (answer) await run({ type: 'answer_question', key: s.key, choice: answer });
    }
  };
  return (
    <Sheet title={specs[0]?.title ?? 'A question'}>
      <Picker specs={specs} names={names} value={choice} onChange={setChoice} />
      <SheetActions>
        <Button variant="primary" disabled={!complete || pending} onClick={() => void submit()}>
          Submit
        </Button>
      </SheetActions>
    </Sheet>
  );
}

function Day({ view }: { view: PlayerView }) {
  const { run, pending } = useCommand();
  const results = view.me.messages.filter((m) => m.kind !== 'starting');
  const newest = results.reduce((n, m) => Math.max(n, m.n), -1);
  const tonight = results.filter((m) => m.n === newest);
  const earlier = results.filter((m) => m.n !== newest);
  const names = useNames();
  return (
    <div className="pad">
      <div className={styles['dawn']}>☀ Dawn, Day {view.phase.n}</div>
      {view.announcedDeaths && (
        <Card>
          {view.announcedDeaths.length
            ? `Died in the night: ${view.announcedDeaths.map((id) => names.players[id] ?? id).join(', ')}.`
            : 'Nobody died in the night.'}
        </Card>
      )}
      {!view.me.alive && (
        <Card tone="dead">
          <b>You have died.</b>
          <p>You keep your role list, the night order and your role card.</p>
          {view.me.ghostVoteUsed ? (
            <p className="muted">You have used your vote.</p>
          ) : (
            <div className="row">
              <span>You have one vote left.</span>
              <Button disabled={pending} onClick={() => void run({ type: 'use_ghost_vote' })}>
                I used my vote
              </Button>
            </div>
          )}
        </Card>
      )}
      <h3>Your information</h3>
      <Messages messages={tonight} emptyText="You learned nothing." />
      {earlier.length > 0 && (
        <details>
          <summary>Earlier messages</summary>
          <Messages messages={earlier} />
        </details>
      )}
      <p className="muted small">Discuss, nominate and vote at the table.</p>
    </div>
  );
}

function Ended({ view }: { view: PlayerView }) {
  const { winner, endedReason } = view.phase;
  return (
    <div className="pad">
      <h2>Game over</h2>
      {winner && <Card tone="notice">{winner === 'good' ? 'Good wins.' : 'Evil wins.'}</Card>}
      {endedReason === 'update' && <Card tone="notice">The game ended for an app update.</Card>}
      <p>Thanks for playing, {view.me.name}. Waiting for the next game.</p>
      <Messages messages={view.me.messages} />
    </div>
  );
}
