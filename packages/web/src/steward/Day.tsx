// The day as the table lives it: who nominates whom, who votes, what is said in public, who is executed. Nothing on it
// depends on who is in play, so it is the same for any game on this script.
import { useState } from 'react';
import type { ClaimSpec, NominationView, PlayerId, RoleId, StewardView } from '@ct/protocol';
import { useCommand } from '../app/store';
import styles from '../storyteller/console.module.css';
import { Section } from '../storyteller/common';
import { Button, Card, HoldButton, Segments, Sheet, SheetActions } from '../ui/ui';
import { Circle, Tell, nameOf, seatedPlayers } from './common';

type DayView = NonNullable<StewardView['day']>;

/** The public rules, as warnings only: a table's own rules never stop the game. */
export function nominationWarnings(view: StewardView, nominator: PlayerId, nominee: PlayerId): string[] {
  const today = view.day?.nominations ?? [];
  const alive = (id: PlayerId) => !!view.players.find((p) => p.id === id)?.alive;
  return [
    ...(alive(nominator) ? [] : [`${nameOf(view, nominator)} is dead, and the dead cannot nominate.`]),
    ...(today.some((x) => x.nominator === nominator)
      ? [`${nameOf(view, nominator)} has already nominated today.`]
      : []),
    ...(today.some((x) => x.nominee === nominee) ? [`${nameOf(view, nominee)} has already been nominated today.`] : []),
  ];
}

/** Voters with no vote left. A correction has its own last count to give back first. */
export function voteWarnings(view: StewardView, x: NominationView, voters: readonly PlayerId[]): string[] {
  return voters
    .filter((id) => !view.players.find((p) => p.id === id)?.votesLeft && !x.vote?.voters.includes(id))
    .map((id) => `${nameOf(view, id)} has no vote left.`);
}

export function Day({ view }: { view: StewardView }) {
  const { run, pending } = useCommand();
  const { day } = view;
  if (!day) return <p className="muted">It is not day.</p>;
  // Decided: the one thing left is to announce it, which is at the top of every tab.
  const stopped = day.closed || !!view.over;
  return (
    <div>
      <Tell lines={view.tell} />
      <div className={styles['columns']}>
        <div>
          {day.closed && !view.over && (
            <Section title="The day is over">
              <Button variant="primary" big disabled={pending} onClick={() => void run({ type: 'begin_night' })}>
                Start the night
              </Button>
            </Section>
          )}
          <Nominations view={view} day={day} stopped={stopped} />
        </div>
        <div>
          {day.claims.length > 0 && <Claims view={view} day={day} stopped={stopped} />}
          {!stopped && <Execution key={day.block?.playerId ?? ''} view={view} day={day} />}
        </div>
      </div>
    </div>
  );
}

function Nominations({ view, day, stopped }: { view: StewardView; day: DayView; stopped: boolean }) {
  const { run, pending } = useCommand();
  const [picking, setPicking] = useState<PlayerId | 'nominator' | null>(null);
  const [nominee, setNominee] = useState<PlayerId | null>(null);
  const [voting, setVoting] = useState<number | null>(null);
  const counted = day.nominations.find((x) => x.id === voting);
  const nominator = picking && picking !== 'nominator' ? picking : null;
  const close = () => {
    setPicking(null);
    setNominee(null);
  };
  const nominate = async () => {
    if (nominator && nominee && (await run({ type: 'nominate', nominator, nominee })).ok) close();
  };
  return (
    <Section title="Nominations">
      <p>
        {day.block
          ? `On the block: ${nameOf(view, day.block.playerId)}, with ${day.block.votes} votes.`
          : 'Nobody is on the block.'}{' '}
        <span className="muted small">{day.needed} votes needed.</span>
      </p>
      <ul className={styles['rows']}>
        {day.nominations.map((x) => (
          <li key={x.id}>
            <span className={styles['grow']}>
              {nameOf(view, x.nominator)} nominates {nameOf(view, x.nominee)}.{x.lines.map((l) => ` ${l}`).join('')}
              <span className="muted small">
                {x.vote ? ` ${x.vote.voters.length} voted, ${x.vote.needed} needed.` : ' No votes counted.'}
              </span>
            </span>
            {!stopped && (
              <Button tiny disabled={pending} onClick={() => setVoting(x.id)}>
                {x.vote ? 'Correct the votes' : 'Count the votes'}
              </Button>
            )}
            {x.canUndo && !view.over && (
              <HoldButton disabled={pending} onConfirm={() => void run({ type: 'undo_nomination', id: x.id })}>
                Remove
              </HoldButton>
            )}
          </li>
        ))}
      </ul>
      {!stopped && (
        <>
          <Button variant="primary" disabled={pending} onClick={() => setPicking('nominator')}>
            Nominate
          </Button>
          <p className="muted small">As it happens, before the vote. Enter every one, and every vote.</p>
        </>
      )}
      {picking && !nominee && (
        <Sheet title={nominator ? `Whom does ${nameOf(view, nominator)} nominate?` : 'Who nominates?'} onClose={close}>
          <Circle
            view={view}
            label={nominator ? 'Nominee' : 'Nominator'}
            on={nominator ? [nominator] : []}
            onPress={(p) => (nominator ? setNominee(p.id) : setPicking(p.id))}
          />
          <SheetActions>
            <Button onClick={close}>Cancel</Button>
          </SheetActions>
        </Sheet>
      )}
      {nominator && nominee && (
        <Sheet title={`${nameOf(view, nominator)} nominates ${nameOf(view, nominee)}?`} onClose={close}>
          <Warnings lines={nominationWarnings(view, nominator, nominee)} />
          <SheetActions>
            <Button onClick={close}>Cancel</Button>
            <Button variant="primary" disabled={pending} onClick={() => void nominate()}>
              Record
            </Button>
          </SheetActions>
        </Sheet>
      )}
      {counted && <Vote key={counted.id} view={view} x={counted} onClose={() => setVoting(null)} />}
    </Section>
  );
}

const Warnings = ({ lines }: { lines: readonly string[] }) =>
  lines.map((l) => (
    <p key={l} className={styles['warning']}>
      ⚠ {l}
    </p>
  ));

function Vote({ view, x, onClose }: { view: StewardView; x: NominationView; onClose: () => void }) {
  const { run, pending } = useCommand();
  const [voters, setVoters] = useState<PlayerId[]>(x.vote?.voters ?? []);
  const needed = x.vote?.needed ?? view.day?.needed ?? 0;
  const save = async () => {
    if ((await run({ type: 'count_vote', id: x.id, voters })).ok) onClose();
  };
  return (
    <Sheet title={`Who votes for ${nameOf(view, x.nominee)}?`} onClose={onClose}>
      <Circle
        view={view}
        label="Voters"
        on={voters}
        onPress={(p) => setVoters(voters.includes(p.id) ? voters.filter((id) => id !== p.id) : [...voters, p.id])}
      >
        <b>{voters.length}</b> of {needed}
      </Circle>
      <Warnings lines={voteWarnings(view, x, voters)} />
      <SheetActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={pending} onClick={() => void save()}>
          Record {voters.length} {voters.length === 1 ? 'vote' : 'votes'}
        </Button>
      </SheetActions>
    </Sheet>
  );
}

function Claims({ view, day, stopped }: { view: StewardView; day: DayView; stopped: boolean }) {
  const [open, setOpen] = useState<ClaimSpec | null>(null);
  return (
    <Section title="Said in public">
      {day.claimed.map((x, i) => (
        <p key={i}>
          {x.text} <span className="muted">{x.lines.join(' ')}</span>
        </p>
      ))}
      {!stopped && (
        <>
          <div className="row">
            {day.claims.map((c) => (
              <Button key={`${c.roleId}:${c.claim}`} onClick={() => setOpen(c)}>
                {c.title}
              </Button>
            ))}
          </div>
          <p className="muted small">Anyone can say these. What was said cannot be changed once it is recorded.</p>
        </>
      )}
      {open && !stopped && <ClaimSheet view={view} spec={open} onClose={() => setOpen(null)} />}
    </Section>
  );
}

function ClaimSheet({ view, spec, onClose }: { view: StewardView; spec: ClaimSpec; onClose: () => void }) {
  const { run, pending } = useCommand();
  const [values, setValues] = useState<string[]>(spec.fields.map(() => ''));
  const [asking, setAsking] = useState(false);
  const picked = values as PlayerId[];
  const said = spec.confirm.replace(/\{(\d)\}/g, (_, i: string) => nameOf(view, values[Number(i)] ?? null));
  const record = async () => {
    const ack = await run({ type: 'make_claim', roleId: spec.roleId, claim: spec.claim, values: picked });
    if (ack.ok) onClose();
  };
  if (asking) {
    return (
      <Sheet title={`${said}?`} onClose={onClose}>
        <SheetActions>
          <Button onClick={() => setAsking(false)}>Back</Button>
          <Button variant="primary" disabled={pending} onClick={() => void record()}>
            Record
          </Button>
        </SheetActions>
      </Sheet>
    );
  }
  return (
    <Sheet title={spec.title} onClose={onClose}>
      {spec.fields.map((label, i) => (
        <PlayerField
          key={label}
          view={view}
          label={label}
          value={values[i] ?? ''}
          onChange={(id) => setValues(values.map((v, j) => (j === i ? id : v)))}
        />
      ))}
      <SheetActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={values.some((v) => !v)} onClick={() => setAsking(true)}>
          Next
        </Button>
      </SheetActions>
    </Sheet>
  );
}

function PlayerField({
  view,
  label,
  value,
  none = 'Choose…',
  onChange,
}: {
  view: StewardView;
  label: string;
  value: string;
  none?: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className={styles['field']}>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{none}</option>
        {seatedPlayers(view).map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {p.alive ? '' : ' (dead)'}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The block is preselected, but it is the table's own rules that count. */
function Execution({ view, day }: { view: StewardView; day: DayView }) {
  const { run, pending } = useCommand();
  const [who, setWho] = useState<string>(day.block?.playerId ?? '');
  const [yes, setYes] = useState<Record<string, boolean>>({});
  const [asking, setAsking] = useState(false);
  const name = nameOf(view, who);
  // Asked of every execution, as asking it of some would say something.
  const questions = who ? day.executionQuestions : [];
  const answered = questions.every((q) => yes[q.roleId] !== undefined);
  const title = who ? `Execute ${name}?` : 'Nobody is executed?';
  const execute = () =>
    run({
      type: 'execute',
      playerId: (who || null) as PlayerId | null,
      yes: questions.filter((q) => yes[q.roleId]).map((q): RoleId => q.roleId),
    });
  return (
    <Section title="Execution">
      <PlayerField
        view={view}
        label="Executed today"
        none="Nobody"
        value={who}
        onChange={(id) => {
          setWho(id);
          setYes({});
        }}
      />
      <Button variant="primary" big disabled={pending} onClick={() => setAsking(true)}>
        {who ? `Execute ${name}` : 'No one'}
      </Button>
      {asking && (
        <Sheet title={title} onClose={() => setAsking(false)}>
          {questions.map((q) => (
            <div key={q.roleId} className={styles['field']}>
              <span>{q.question.replaceAll('{0}', name)}</span>
              <Segments
                label={q.question}
                options={[
                  { id: 'yes', text: 'Yes' },
                  { id: 'no', text: 'No' },
                ]}
                value={yes[q.roleId] === undefined ? null : yes[q.roleId] ? 'yes' : 'no'}
                onChange={(v) => setYes({ ...yes, [q.roleId]: v === 'yes' })}
              />
            </div>
          ))}
          <Card>It ends the day, and cannot be changed.</Card>
          <SheetActions>
            <Button onClick={() => setAsking(false)}>Cancel</Button>
            <Button variant="primary" disabled={pending || !answered} onClick={() => void execute()}>
              {who ? 'Execute' : 'No one'}
            </Button>
          </SheetActions>
        </Sheet>
      )}
    </Section>
  );
}
