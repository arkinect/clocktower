// What a player's own screen shows in an autoplay game only, on their phone and on the steward's laptop. Nothing here
// shows in a Storyteller's game: the server sends none of it.
import { useState } from 'react';
import type { Choice, DayPrompt, PlayerView } from '@ct/protocol';
import { useCommand, useNames } from '../app/store';
import { Picker, choiceComplete } from '../ui/Picker';
import { Button, Card, HoldButton } from '../ui/ui';
import { Messages, RoleCardView } from './parts';

/**
 * The role card, with everything learned with it, and what it asks its holder in private, covered until pressed. The
 * steward has a tab of its own for what they are asked.
 */
export function MyRole({ view, asks = true }: { view: PlayerView; asks?: boolean }) {
  const { run } = useCommand();
  const { grants, messages, reminder, hasSeenRole } = view.me;
  const dayPrompts = asks ? (view.me.dayPrompts ?? []) : [];
  const starting = messages.filter((m) => m.kind === 'starting');
  const any = starting.length > 0 || grants.length > 0 || !!reminder || dayPrompts.length > 0;
  return (
    <RoleCardView
      role={view.me.role}
      onReveal={view.steward && !hasSeenRole ? () => void run({ type: 'seen_role' }) : undefined}
      secret={
        any && (
          <>
            <Messages messages={starting} />
            {grants.map((g) => (
              <Card key={g.title}>
                <b>{g.title}</b>
                {g.lines.map((l, i) => (
                  <p key={i}>{l}</p>
                ))}
              </Card>
            ))}
            {reminder && <Card>{reminder}</Card>}
            {dayPrompts.map((p) => (
              <DayQuestion key={p.key} spec={p} />
            ))}
          </>
        )
      }
    />
  );
}

/** A question an ability asks its holder by day. It can be changed until the day is over. */
export function DayQuestion({ spec }: { spec: DayPrompt }) {
  const names = useNames();
  const { run, pending } = useCommand();
  const saved: Choice = { values: spec.recorded ?? [] };
  const [choice, setChoice] = useState<Record<string, Choice>>({ [spec.key]: saved });
  const now = choice[spec.key] ?? saved;
  const values = now.decline ? [] : now.values.filter(Boolean);
  const send = async () => void (await run({ type: 'answer_day_prompt', key: spec.key, values }));
  return (
    <Card>
      <Picker specs={[spec]} names={names} value={choice} onChange={setChoice} />
      <Button variant="primary" disabled={pending || !choiceComplete(spec, now)} onClick={() => void send()}>
        Save
      </Button>
      {spec.recorded && (
        <p className="muted small">Saved: {spec.recorded.map((v) => names.players[v] ?? v).join(', ') || 'nobody'}.</p>
      )}
    </Card>
  );
}

/** Standing news for everyone, and being asked to become the Storyteller. */
export function TableNotes({ view }: { view: PlayerView }) {
  const { run, pending } = useCommand();
  const notes = view.tableNotes ?? [];
  if (!notes.length && !view.me.offeredStoryteller) return null;
  return (
    <div className="pad">
      {notes.map((n) => (
        <Card key={n} tone="notice">
          {n}
        </Card>
      ))}
      {view.me.offeredStoryteller && (
        <Card tone="warn">
          <b>You are asked to become the Storyteller.</b>
          <p>
            You stop playing, and see and run everything from here on. It cannot be taken back, and everyone is told.
          </p>
          <HoldButton disabled={pending} onConfirm={() => void run({ type: 'accept_storyteller' })}>
            Become the Storyteller
          </HoldButton>
        </Card>
      )}
    </div>
  );
}
