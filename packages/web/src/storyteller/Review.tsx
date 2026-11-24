import { useState } from 'react';
import type {
  Choice,
  Command,
  DayActionSpec,
  PlayerId,
  QuestionView,
  ResultView,
  ReviewItem,
  StorytellerView,
  SubmissionRow,
} from '@ct/protocol';
import { useCommand, useNames } from '../app/store';
import { Picker, choiceComplete } from '../ui/Picker';
import { Button, Card, HoldButton } from '../ui/ui';
import { InputSheet, Lines, SHOW_GAME_END_CARDS, Section, Who, causeLabel, useSeats } from './common';
import styles from './console.module.css';
import { DayEvent } from './Day';
import { NightCard } from './Story';

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** "poisoned", "drunk": the kinds of impairment behind a result, for its heading. */
const impairmentTypes = (causes: string[]) => [...new Set(causes.map((c) => (c.split(':')[0] ?? '').toLowerCase()))];

const WRITE = 'write';
const SUGGESTION = 'suggestion';

function Result({ view, r }: { view: StorytellerView; r: ResultView }) {
  const { run, pending } = useCommand();
  const [editing, setEditing] = useState(false);
  const set = (lines: string[] | null) => run({ type: 'override_result', resultKey: r.key, lines });
  const suggestion = r.transformed ?? r.suggested;
  // The suggestion first, then every other outcome the role could give, then a written answer if there is one.
  const options: string[][] = [suggestion];
  for (const a of r.alternatives) if (!options.some((o) => same(o, a))) options.push(a);
  if (!options.some((o) => same(o, r.final))) options.push(r.final);
  const selected = options.findIndex((o) => same(o, r.final));
  const choose = (value: string) => {
    if (value === WRITE) return setEditing(true);
    if (value === SUGGESTION) return void set(null);
    const lines = options[Number(value)];
    if (lines) void set(lines);
  };
  const types = r.impaired ? impairmentTypes(r.causes) : [];
  return (
    <article className={styles['result']}>
      <h3>
        <Who view={view} id={r.playerId} /> {r.title}
        {types.length > 0 && (
          <span className={styles['warn']} title={r.causes.map(causeLabel).join(', ')}>
            {' '}
            - {types.join(', ')}
          </span>
        )}
      </h3>
      <div className={styles['truthGrid']}>
        <div>
          <span className="muted small">Truth</span>
          <Lines lines={r.truth} />
        </div>
        <label className={styles['field']}>
          <span className="muted small">Suggested</span>
          <select
            aria-label={`Answer for ${r.title}`}
            disabled={pending}
            value={selected === 0 ? SUGGESTION : String(selected)}
            onChange={(e) => choose(e.target.value)}
          >
            {options.map((o, i) => (
              <option key={o.join('|')} value={i === 0 ? SUGGESTION : String(i)}>
                {o.join(' ')}
                {i === 0 && r.overridden ? ' (suggestion)' : ''}
                {i > 0 && i === options.length - 1 && r.overridden && !r.alternatives.some((a) => same(a, o))
                  ? ' (your answer)'
                  : ''}
              </option>
            ))}
            <option value={WRITE}>Write an answer…</option>
          </select>
        </label>
      </div>
      {r.staleOverride && (
        <Card tone="warn">
          The night changed after you wrote this answer. Check it still holds, then keep it or go back to the
          suggestion.
          <div className="row">
            <Button tiny disabled={pending} onClick={() => void set(r.final)}>
              Keep this answer
            </Button>
            <Button tiny disabled={pending} onClick={() => void set(null)}>
              Use the suggestion
            </Button>
          </div>
        </Card>
      )}
      {editing && (
        <InputSheet
          title={`Answer for ${r.title}`}
          label="One line per message line"
          initial={r.final.join('\n')}
          multiline
          onClose={() => setEditing(false)}
          onSave={(text) =>
            set(
              text
                .split('\n')
                .map((l) => l.trim())
                .filter(Boolean)
                .slice(0, 10),
            )
          }
        />
      )}
    </article>
  );
}

/** Asked tonight because the day didn't record it: no default is taken. */
const missing = (d: ReviewItem) => d.required && d.chosen === null;

function Decision({ d }: { d: ReviewItem }) {
  const { run } = useCommand();
  return (
    <article className={styles['result']}>
      <h3>{d.title}</h3>
      {d.description && <p>{d.description}</p>}
      {/* Always a dropdown: every option the rule allows, starting on the suggestion. */}
      <select
        aria-label={d.title}
        value={(d.required ? d.chosen : (d.chosen ?? d.default)) ?? ''}
        onChange={(e) => void run({ type: 'decide', key: d.key, option: e.target.value })}
      >
        {d.required && d.chosen === null && <option value="">Choose…</option>}
        {d.options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
      {missing(d) && <p className="muted small">Answer this before dawn.</p>}
    </article>
  );
}

/** With `change`, an answer already given can be replaced (in a player's own section). */
function Question({ view, q, change }: { view: StorytellerView; q: QuestionView; change?: boolean }) {
  const names = useNames();
  const { dead } = useSeats(view);
  const { run, pending } = useCommand();
  const given = q.answered ? q.answer : null;
  const [choice, setChoice] = useState<Record<string, Choice>>(change && given ? { [q.spec.key]: given } : {});
  const answer = choice[q.spec.key];
  const said = (c: Choice) => {
    if (c.decline) return 'declined';
    const mode = q.spec.modes?.find((m) => m.id === c.mode);
    return `${mode ? `${mode.label}: ` : ''}${c.values.map((v) => names.players[v] ?? names.roles[v] ?? v).join(', ')}`;
  };
  return (
    <article className={styles['result']}>
      <h3>
        <Who view={view} id={q.playerId} role />: {q.spec.title}
      </h3>
      {given && <p>Answered: {said(given)}</p>}
      {!given && <p className="muted small">Waiting for the player. You can answer for them.</p>}
      {(!given || change) && (
        <>
          <Picker specs={[q.spec]} names={names} value={choice} onChange={setChoice} dead={dead} />
          <Button
            disabled={!answer || !choiceComplete(q.spec, answer) || pending || (!!given && sameChoice(given, answer))}
            onClick={() => answer && void run({ type: 'answer_question_for', key: q.key, choice: answer })}
          >
            {given ? 'Change the answer' : 'Answer for them'}
          </Button>
        </>
      )}
    </article>
  );
}

const choiceText = (c: Choice | undefined) =>
  !c ? '' : c.decline ? 'decline' : `${c.mode ?? ''}:${c.values.join(',')}`;
const sameChoice = (a: Choice | undefined, b: Choice | undefined) => choiceText(a) === choiceText(b);

/** The player's choice tonight, as submitted, and a way to make it something else. */
function NightChoice({ view, row }: { view: StorytellerView; row: SubmissionRow }) {
  const names = useNames();
  const { dead } = useSeats(view);
  const { run, pending } = useCommand();
  const [choice, setChoice] = useState<Record<string, Choice>>(row.submission ?? {});
  // A picker left alone keeps what was submitted; one that was touched must be finished.
  const touched = row.specs.filter((s) => choice[s.key]);
  const complete = touched.every((s) => choiceComplete(s, choice[s.key]));
  const changed = row.specs.some((s) => !sameChoice(choice[s.key], row.submission?.[s.key]));
  const actions = Object.fromEntries(touched.map((s) => [s.key, choice[s.key] as Choice]));
  return (
    <article className={styles['result']}>
      <Picker specs={row.specs} names={names} value={choice} onChange={setChoice} dead={dead} />
      <Button
        disabled={!complete || !changed || pending}
        onClick={() => void run({ type: 'submit_for', playerId: row.playerId, actions })}
      >
        Change their choice
      </Button>
    </article>
  );
}

/** The player holding the ability a question came from: its key starts with the ability's id. */
const askedBy = (view: StorytellerView, q: QuestionView) =>
  view.players.find((p) => p.abilities.some((a) => q.key.startsWith(`${a.id}:`)))?.id ?? null;

/**
 * The day's facts a player's ability reads tonight (whether a Demon voted, for the Flowergirl). A fact belongs to
 * every holder of the role, so it is on each one's card.
 */
const factsOf = (view: StorytellerView, id: string): DayActionSpec[] => {
  const held = view.players.find((p) => p.id === id)?.abilities ?? [];
  return (view.review?.facts ?? []).filter((f) => held.some((a) => a.id === f.abilityId || a.roleId === f.roleId));
};

const inSection = (view: StorytellerView, q: QuestionView, id: string) =>
  q.answered && (q.playerId === id || askedBy(view, q) === id);

/**
 * Everything one player's ability did tonight, with the controls to make it something else: the day's facts it reads
 * (what is true), their choice, their answers to follow-up questions and what they learn (what they are told). The
 * night resolves again from every change, so the rest of the tab follows by itself.
 */
function PlayerSection({
  view,
  id,
  before,
  onClose,
}: {
  view: StorytellerView;
  id: PlayerId;
  before: Snapshot;
  onClose: () => void;
}) {
  const names = useNames();
  const { run, pending } = useCommand();
  const review = view.review;
  if (!review) return null;
  const row = view.board.find((b) => b.playerId === id);
  const results = review.results.filter((r) => r.playerId === id);
  const questions = review.questions.filter((q) => inSection(view, q, id));
  const acted = review.actors.filter((a) => a.playerId === id);
  const name = names.players[id] ?? id;
  const facts = factsOf(view, id);
  const empty = !row?.specs.length && !results.length && !questions.length && !facts.length;
  // Puts back whatever differs from when the card was added, then takes the card away. It stays if a step fails.
  const cancel = async () => {
    const steps: Command[] = [];
    for (const f of facts) {
      const was = before.facts[f.key] ?? null;
      // Nothing recorded before: only a fact that can be taken back goes back to that.
      if (same(was ?? [], f.recorded ?? []) || (!was && !f.clearable && f.control !== 'rows')) continue;
      steps.push({ type: 'record_fact', abilityId: f.abilityId, action: f.action, values: was ?? [] });
    }
    const now = row?.submission ?? null;
    if (JSON.stringify(now) !== JSON.stringify(before.submission)) {
      steps.push(
        before.submission
          ? { type: 'submit_for', playerId: id, actions: before.submission }
          : { type: 'clear_submission', playerId: id },
      );
    }
    for (const q of questions) {
      const was = before.answers[q.key];
      if (was && !sameChoice(was, q.answer ?? undefined)) {
        steps.push({ type: 'answer_question_for', key: q.key, choice: was });
      }
    }
    for (const r of results) {
      const was = before.overrides[r.key] ?? null;
      if (r.overridden ? !was || !same(was, r.final) : !!was) {
        steps.push({ type: 'override_result', resultKey: r.key, lines: was });
      }
    }
    for (const step of steps) if (!(await run(step)).ok) return;
    onClose();
  };
  return (
    <Card>
      <div className="row">
        <h3 className={styles['grow']}>
          <Who view={view} id={id} role />
        </h3>
        <Button tiny disabled={pending} aria-label={`Cancel changes to ${name}`} onClick={() => void cancel()}>
          Cancel
        </Button>
      </div>
      {acted.map((a, i) => (
        <p key={i} className="muted small">
          {a.slot}: {a.input}
          {a.outcome ? `. ${a.outcome}` : ''}
          {a.impaired ? ` (${impairmentTypes(a.causes).join(', ') || 'not working'})` : ''}
        </p>
      ))}
      {facts.map((f) => (
        <DayEvent key={f.key} view={view} spec={f} />
      ))}
      {row && row.specs.length > 0 && <NightChoice key={JSON.stringify(row.submission)} view={view} row={row} />}
      {questions.map((q) => (
        <Question key={`${q.key}|${choiceText(q.answer ?? undefined)}`} view={view} q={q} change />
      ))}
      {results.map((r) => (
        <Result key={r.key} view={view} r={r} />
      ))}
      {empty && (
        <p className="muted">
          {name} has nothing to change tonight: no choice, no information and no fact from the day.
        </p>
      )}
    </Card>
  );
}

/** What a card's controls stood at when it was added, which is what Cancel puts back. */
interface Snapshot {
  submission: Record<string, Choice> | null;
  answers: Record<string, Choice>;
  /** Written answers by result key. A result not listed had none. */
  overrides: Record<string, string[]>;
  /** What each fact was recorded as, by its key. */
  facts: Record<string, string[] | null>;
}

function snapshot(view: StorytellerView, id: PlayerId): Snapshot {
  const review = view.review;
  const answers: Record<string, Choice> = {};
  const overrides: Record<string, string[]> = {};
  for (const q of review?.questions ?? []) if (inSection(view, q, id) && q.answer) answers[q.key] = q.answer;
  for (const r of review?.results ?? []) if (r.playerId === id && r.overridden) overrides[r.key] = r.final;
  const facts = Object.fromEntries(factsOf(view, id).map((f) => [f.key, f.recorded ?? null]));
  return { submission: view.board.find((b) => b.playerId === id)?.submission ?? null, answers, overrides, facts };
}

/** The open cards, by game and night, so they are still open after a look at another tab. */
const openSections = new Map<string, Map<PlayerId, Snapshot>>();

// The cards are also kept in the browser, so a reload brings them back with what Cancel puts back.
const STORE = 'ct.review.cards';

/** A player's ability ids, which no later game repeats: a card saved in another game with this code is dropped. */
const markOf = (view: StorytellerView, id: string) =>
  (view.players.find((p) => p.id === id)?.abilities ?? []).map((a) => a.id).join(',');

function loadCards(key: string, view: StorytellerView): Map<PlayerId, Snapshot> {
  try {
    const saved = JSON.parse(localStorage.getItem(`${STORE}:${key}`) ?? '[]') as [PlayerId, Snapshot, string][];
    return new Map(saved.filter(([id, , mark]) => mark === markOf(view, id)).map(([id, snap]) => [id, snap]));
  } catch {
    return new Map();
  }
}

function saveCards(key: string, view: StorytellerView, cards: Map<PlayerId, Snapshot>) {
  try {
    // Only this night's: an earlier night's cards are of no use once it is published.
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(`${STORE}:${view.code}:`)) localStorage.removeItem(k);
    }
    if (!cards.size) return;
    const rows = [...cards].map(([id, snap]) => [id, snap, markOf(view, id)]);
    localStorage.setItem(`${STORE}:${key}`, JSON.stringify(rows));
  } catch {
    // No storage (a private window): the cards last as long as the page.
  }
}

function useOpenSections(view: StorytellerView) {
  const key = `${view.code}:${view.phase.n}`;
  const [, redraw] = useState(0);
  const open = openSections.get(key) ?? loadCards(key, view);
  openSections.set(key, open);
  const change = (edit: (cards: Map<PlayerId, Snapshot>) => void) => {
    const next = new Map(open);
    edit(next);
    openSections.set(key, next);
    saveCards(key, view, next);
    redraw((x) => x + 1);
  };
  return {
    cards: open,
    add: (id: PlayerId) => change((c) => c.set(id, snapshot(view, id))),
    remove: (id: PlayerId) => change((c) => c.delete(id)),
  };
}

export function Review({ view }: { view: StorytellerView }) {
  const { run, pending } = useCommand();
  const names = useNames();
  const { seated } = useSeats(view);
  const sections = useOpenSections(view);
  const review = view.review;
  if (!review) return <Card>There is no night to review yet.</Card>;
  // Required decisions stay in the top card once answered, so answering one doesn't move it.
  const required = review.decisions.filter((d) => d.required);
  const others = review.decisions.filter((d) => !d.required);
  const unanswered = required.some(missing);
  const blocked =
    unanswered || review.questions.some((q) => !q.answered) || review.results.some((r) => r.staleOverride);
  // Decisions set what is true; this section sets the lie told to a drunk or poisoned player. A sober player's
  // information goes out as it is, and so does a confirmation ("You chose Bo"), which has no false version. An answer
  // you already wrote always shows, so it can be checked.
  // A player the Storyteller added below has their results and answered questions in their own section instead.
  const open = [...sections.cards.keys()].filter((id) => seated.some((p) => p.id === id));
  const shown = review.results.filter(
    (r) => ((r.impaired && !r.confirmation) || r.overridden || r.staleOverride) && !open.includes(r.playerId),
  );
  const questions = review.questions.filter((q) => !open.some((id) => inSection(view, q, id)));
  const closed = seated.filter((p) => !open.includes(p.id));
  return (
    <div>
      {required.length > 0 && (
        <Card {...(unanswered ? { tone: 'warn' as const } : {})}>
          <p>
            <b>Not recorded during the day.</b> Answer these before you publish dawn.
          </p>
          {required.map((d) => (
            <Decision key={d.hash} d={d} />
          ))}
        </Card>
      )}
      {others.length > 0 && (
        <Section title="Decisions">
          {others.map((d) => (
            <Decision key={d.hash} d={d} />
          ))}
        </Section>
      )}
      {questions.length > 0 && (
        <Section title="Questions">
          {questions.map((q) => (
            <Question key={q.key} view={view} q={q} />
          ))}
        </Section>
      )}
      {shown.length > 0 && (
        <Section title="What each player learns">
          {shown.map((r) => (
            <Result key={r.key} view={view} r={r} />
          ))}
        </Section>
      )}
      {seated.length > 0 && (
        <Section title="Change a player's night">
          {open.map((id) => (
            <PlayerSection
              key={id}
              view={view}
              id={id}
              before={sections.cards.get(id) as Snapshot}
              onClose={() => sections.remove(id)}
            />
          ))}
          {closed.length > 0 && (
            <select
              aria-label="Add a player"
              value=""
              onChange={(e) => e.target.value && sections.add(e.target.value as PlayerId)}
            >
              <option value="">Add a player…</option>
              {closed.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.character && names.roles[p.character] ? ` (${names.roles[p.character]})` : ''}
                  {p.alive ? '' : ' (dead)'}
                </option>
              ))}
            </select>
          )}
        </Section>
      )}
      {review.notices.length > 0 && (
        <Section title="Notices">
          {review.notices.map((n, i) => (
            <p key={i}>
              <Who view={view} id={n.playerId} />: <b>{/[.!?]$/.test(n.title) ? n.title : `${n.title}.`}</b>{' '}
              {n.lines.join(' ')}
            </p>
          ))}
        </Section>
      )}
      {SHOW_GAME_END_CARDS &&
        review.gameEnd.map((g) => (
          <Card key={g.key} tone="notice">
            {g.reason}
          </Card>
        ))}
      <NightCard night={review.story} />
      <Section title="Publish">
        <div className="row">
          <Button
            variant="primary"
            big
            disabled={blocked || pending}
            onClick={() => void run({ type: 'publish_dawn' })}
          >
            Publish dawn
          </Button>
          {blocked && (
            <HoldButton onConfirm={() => void run({ type: 'publish_dawn', force: true })}>Force publish</HoldButton>
          )}
          <Button disabled={pending} onClick={() => void run({ type: 'reopen_collecting' })}>
            Reopen the night
          </Button>
        </div>
      </Section>
    </div>
  );
}
