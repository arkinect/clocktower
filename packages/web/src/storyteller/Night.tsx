import { useState } from 'react';
import type { Choice, PlayerId, StorytellerView, SubmissionRow } from '@ct/protocol';
import { useCommand, useNames } from '../app/store';
import { Picker, choiceComplete } from '../ui/Picker';
import { Button, Card, Countdown, HoldButton, Sheet, SheetActions } from '../ui/ui';
import { Section, Who, useSeats } from './common';
import styles from './console.module.css';

function SubmitFor({ view, row, onClose }: { view: StorytellerView; row: SubmissionRow; onClose: () => void }) {
  const names = useNames();
  const { dead } = useSeats(view);
  const { run, pending } = useCommand();
  const [choice, setChoice] = useState<Record<string, Choice>>(row.submission ?? {});
  const complete = row.specs.every((s) => choiceComplete(s, choice[s.key]));
  const submit = async () => {
    const ack = await run({ type: 'submit_for', playerId: row.playerId, actions: choice });
    if (ack.ok) onClose();
  };
  return (
    <Sheet title={`Submit for ${names.players[row.playerId] ?? row.playerId}`} onClose={onClose}>
      <Picker specs={row.specs} names={names} value={choice} onChange={setChoice} dead={dead} />
      <SheetActions>
        <Button onClick={onClose}>Close</Button>
        <Button variant="primary" disabled={!complete || pending} onClick={() => void submit()}>
          Submit
        </Button>
      </SheetActions>
    </Sheet>
  );
}

function Controls({ view }: { view: StorytellerView }) {
  const { run, pending } = useCommand();
  const [seconds, setSeconds] = useState(view.settings.countdownSeconds);
  const stage = view.phase.stage;
  const ready = view.board.every((b) => !b.expected || b.submitted);
  return (
    <Section title={`Night ${view.phase.n}`}>
      <p>
        <Countdown endsAt={view.phase.deadline} offset={view.serverNow - Date.now()} />
      </p>
      {stage === 'briefing' && (
        <Button variant="primary" big disabled={pending} onClick={() => void run({ type: 'open_collecting' })}>
          Open the night
        </Button>
      )}
      {stage === 'collecting' && (
        <>
          <div className="row">
            <Button
              variant="primary"
              disabled={!ready || pending}
              onClick={() => void run({ type: 'close_collecting' })}
            >
              Close the night
            </Button>
            {!ready && (
              <HoldButton onConfirm={() => void run({ type: 'close_collecting', force: true })}>
                Close anyway
              </HoldButton>
            )}
          </div>
          <div className="row">
            <Button tiny disabled={pending} onClick={() => void run({ type: 'extend_countdown', seconds: 60 })}>
              Add a minute
            </Button>
            <label className={styles['inline']}>
              <span>Countdown in seconds</span>
              <input type="number" min={0} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))} />
            </label>
            <Button tiny disabled={pending} onClick={() => void run({ type: 'set_countdown', seconds })}>
              Set
            </Button>
          </div>
        </>
      )}
    </Section>
  );
}

function Board({ view }: { view: StorytellerView }) {
  const { run, pending } = useCommand();
  const [open, setOpen] = useState<PlayerId | null>(null);
  const editing = view.board.find((b) => b.playerId === open);
  const collecting = view.phase.stage === 'collecting';
  const waiting = view.board.filter((b) => b.expected && !b.submitted).length;
  return (
    <Section title={`Submissions (${waiting} waiting)`}>
      <ul className={styles['rows']}>
        {view.board.map((b) => (
          <li key={b.playerId}>
            <span className={b.submitted ? styles['dotOn'] : styles['dot']} />
            <span className={styles['grow']}>
              <Who view={view} id={b.playerId} role />
              <span className="muted small">
                {' '}
                {b.wakes.map((w) => w.title).join(', ')}
                {b.byStoryteller ? ' (entered by you)' : ''}
                {!b.expected ? ' (not expected)' : ''}
              </span>
            </span>
            {collecting && !b.submitted && b.specs.length > 0 && (
              <Button tiny onClick={() => setOpen(b.playerId)}>
                Submit for
              </Button>
            )}
            {collecting && !b.submitted && (
              <Button
                tiny
                disabled={pending}
                onClick={() => void run({ type: 'mark_no_action', playerId: b.playerId })}
              >
                No action
              </Button>
            )}
            {collecting && b.submitted && (
              <Button
                tiny
                disabled={pending}
                onClick={() => void run({ type: 'clear_submission', playerId: b.playerId })}
              >
                Clear
              </Button>
            )}
          </li>
        ))}
      </ul>
      {!view.board.length && <p className="muted">Nobody is seated.</p>}
      {editing && <SubmitFor key={editing.playerId} view={view} row={editing} onClose={() => setOpen(null)} />}
    </Section>
  );
}

export function Night({ view }: { view: StorytellerView }) {
  if (view.phase.kind !== 'night') return <Card>There is no night under way.</Card>;
  return (
    <div className={styles['columns']}>
      <Controls view={view} />
      <Board view={view} />
    </div>
  );
}
