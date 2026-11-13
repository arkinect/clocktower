import { useState } from 'react';
import type { Choice, QuestionView, ResultView, ReviewItem, StorytellerView } from '@ct/protocol';
import { useCommand, useNames } from '../app/store';
import { Picker, choiceComplete } from '../ui/Picker';
import { Button, Card, HoldButton } from '../ui/ui';
import { InputSheet, Lines, SHOW_GAME_END_CARDS, Section, Who, causeLabel, useSeats } from './common';
import styles from './console.module.css';
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
const missing = (d: ReviewItem) => d.required && d.chosen === null && !d.stale;

function Decision({ d }: { d: ReviewItem }) {
  const { run } = useCommand();
  return (
    <article className={styles['result']}>
      <h3>
        {d.title}
        {d.stale ? <span className={styles['warn']}> (out of date)</span> : null}
      </h3>
      <p>{d.description}</p>
      {d.stale && <p className="muted small">This no longer applies. Clear it to carry on.</p>}
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
      {d.chosen === null ? (
        <p className="muted small">{d.required ? 'Answer this before dawn.' : 'Using the default.'}</p>
      ) : (
        <Button tiny onClick={() => void run({ type: 'decide', key: d.key, option: null })}>
          Clear
        </Button>
      )}
    </article>
  );
}

function Question({ view, q }: { view: StorytellerView; q: QuestionView }) {
  const names = useNames();
  const { dead } = useSeats(view);
  const { run, pending } = useCommand();
  const [choice, setChoice] = useState<Record<string, Choice>>({});
  const answer = choice[q.spec.key];
  return (
    <article className={styles['result']}>
      <h3>
        <Who view={view} id={q.playerId} role />: {q.spec.title}
      </h3>
      {q.answered && q.answer ? (
        <p>Answered: {q.answer.decline ? 'declined' : q.answer.values.map((v) => names.players[v] ?? v).join(', ')}</p>
      ) : (
        <>
          <p className="muted small">Waiting for the player. You can answer for them.</p>
          <Picker specs={[q.spec]} names={names} value={choice} onChange={setChoice} dead={dead} />
          <Button
            disabled={!answer || !choiceComplete(q.spec, answer) || pending}
            onClick={() => answer && void run({ type: 'answer_question_for', key: q.key, choice: answer })}
          >
            Answer for them
          </Button>
        </>
      )}
    </article>
  );
}

export function Review({ view }: { view: StorytellerView }) {
  const { run, pending } = useCommand();
  const review = view.review;
  if (!review) return <Card>There is no night to review yet.</Card>;
  // Required decisions stay in the top card once answered, so answering one doesn't move it.
  const required = review.decisions.filter((d) => d.required);
  const others = review.decisions.filter((d) => !d.required);
  const unanswered = required.some(missing);
  // accept_all_defaults skips required decisions, so the button is only for a non-required one still open.
  const undecided = others.some((d) => d.chosen === null && !d.stale);
  const blocked =
    unanswered ||
    review.decisions.some((d) => d.stale) ||
    review.questions.some((q) => !q.answered) ||
    review.results.some((r) => r.staleOverride);
  // A sober player's information is true and goes out as it is. Only a drunk or poisoned one needs a choice, plus
  // any answer you already wrote, so it can be checked.
  const shown = review.results.filter((r) => r.impaired || r.overridden || r.staleOverride);
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
          {undecided && (
            <Button tiny disabled={pending} onClick={() => void run({ type: 'accept_all_defaults' })}>
              Accept all defaults
            </Button>
          )}
          {others.map((d) => (
            <Decision key={d.hash} d={d} />
          ))}
        </Section>
      )}
      {review.questions.length > 0 && (
        <Section title="Questions">
          {review.questions.map((q) => (
            <Question key={q.key} view={view} q={q} />
          ))}
        </Section>
      )}
      <Section title="What each player learns">
        {shown.map((r) => (
          <Result key={r.key} view={view} r={r} />
        ))}
        {!shown.length && (
          <p className="muted">
            {review.results.length
              ? 'Nobody who learns something tonight is drunk or poisoned: they get the true answer.'
              : 'Nobody learns anything tonight.'}
          </p>
        )}
      </Section>
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
