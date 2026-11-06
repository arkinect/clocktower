import { useState } from 'react';
import type { Choice, PlayerId, QuestionView, ResultView, ReviewItem, ReviewView, StorytellerView } from '@ct/protocol';
import { useCommand, useNames } from '../app/store';
import { Picker, choiceComplete } from '../ui/Picker';
import { Button, Card, HoldButton, Segments } from '../ui/ui';
import { InputSheet, Lines, PlayerSelect, Section, Who, useSeats } from './common';
import styles from './console.module.css';

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

function Result({ view, r }: { view: StorytellerView; r: ResultView }) {
  const { run, pending } = useCommand();
  const [editing, setEditing] = useState(false);
  const set = (lines: string[] | null) => run({ type: 'override_result', resultKey: r.key, lines });
  return (
    <article className={styles['result']}>
      <h3>
        <Who view={view} id={r.playerId} role />: {r.title}
      </h3>
      {r.impaired && <p className={styles['warn']}>Impaired: {r.causes.join(', ')}</p>}
      <div className={styles['truthGrid']}>
        <div>
          <span className="muted small">Truth</span>
          <Lines lines={r.truth} />
        </div>
        <div>
          <span className="muted small">Suggested</span>
          <Lines lines={r.transformed ?? r.suggested} />
        </div>
        <div>
          <span className="muted small">Final</span>
          <Lines lines={r.final} />
        </div>
      </div>
      {r.staleOverride && (
        <Card tone="warn">
          The night changed after you wrote this answer. Check it still holds, then keep it or go back to the
          suggestion.
        </Card>
      )}
      <div className="row">
        {r.alternatives
          .filter((a) => !same(a, r.final))
          .map((a) => (
            <Button key={a.join('|')} tiny disabled={pending} onClick={() => void set(a)}>
              {a.join(' ')}
            </Button>
          ))}
        <Button tiny onClick={() => setEditing(true)}>
          Write an answer
        </Button>
        {r.overridden && (
          <Button tiny disabled={pending} onClick={() => void set(null)}>
            Use the suggestion
          </Button>
        )}
        {r.staleOverride && (
          <Button tiny disabled={pending} onClick={() => void set(r.final)}>
            Keep this answer
          </Button>
        )}
      </div>
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
      <Segments
        label={d.title}
        options={d.options.map((o) => ({ id: o.id, text: o.label }))}
        value={d.chosen ?? d.default}
        onChange={(option) => void run({ type: 'decide', key: d.key, option })}
      />
      {d.chosen === null ? (
        <p className="muted small">Using the default.</p>
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

function Malfunctions({ view, review }: { view: StorytellerView; review: ReviewView }) {
  const { run, pending } = useCommand();
  const [adding, setAdding] = useState<PlayerId | ''>('');
  const { seated } = useSeats(view);
  const { add, remove } = review.malfunctionAdjust;
  const counted = review.malfunctions.filter((m) => !remove.includes(m.playerId));
  const push = (nextAdd: PlayerId[], nextRemove: PlayerId[]) =>
    void run({ type: 'adjust_malfunctions', add: nextAdd, remove: nextRemove });
  return (
    <Section title={`Malfunctions (${counted.length + add.length})`}>
      <ul className={styles['rows']}>
        {review.malfunctions.map((m) => (
          <li key={`${m.playerId}:${m.cause}`}>
            <span className={styles['grow']}>
              <Who view={view} id={m.playerId} role />
              <span className="muted small"> {m.detail}</span>
            </span>
            <Button
              tiny
              disabled={pending}
              onClick={() =>
                push(
                  add,
                  remove.includes(m.playerId) ? remove.filter((x) => x !== m.playerId) : [...remove, m.playerId],
                )
              }
            >
              {remove.includes(m.playerId) ? 'Count it' : 'Do not count'}
            </Button>
          </li>
        ))}
        {add.map((id) => (
          <li key={id}>
            <span className={styles['grow']}>
              <Who view={view} id={id} role /> <span className="muted small">added by you</span>
            </span>
            <Button
              tiny
              disabled={pending}
              onClick={() =>
                push(
                  add.filter((x) => x !== id),
                  remove,
                )
              }
            >
              Remove
            </Button>
          </li>
        ))}
      </ul>
      <div className="row">
        <PlayerSelect label="Add a malfunction" players={seated} value={adding} onChange={setAdding} />
        <Button
          tiny
          disabled={!adding || pending}
          onClick={() => {
            if (adding) push([...add, adding], remove);
            setAdding('');
          }}
        >
          Add
        </Button>
      </div>
    </Section>
  );
}

export function Review({ view }: { view: StorytellerView }) {
  const { run, pending } = useCommand();
  const review = view.review;
  if (!review) return <Card>There is no night to review yet.</Card>;
  const blocked =
    review.decisions.some((d) => d.stale) ||
    review.questions.some((q) => !q.answered) ||
    review.results.some((r) => r.staleOverride);
  return (
    <div>
      {review.decisions.length > 0 && (
        <Section title="Decisions">
          <Button tiny disabled={pending} onClick={() => void run({ type: 'accept_all_defaults' })}>
            Accept all defaults
          </Button>
          {review.decisions.map((d) => (
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
        {review.results.map((r) => (
          <Result key={r.key} view={view} r={r} />
        ))}
        {!review.results.length && <p className="muted">Nobody learns anything tonight.</p>}
      </Section>
      {review.notices.length > 0 && (
        <Section title="Notices">
          {review.notices.map((n, i) => (
            <p key={i}>
              <Who view={view} id={n.playerId} />: <b>{n.title}.</b> {n.lines.join(' ')}
            </p>
          ))}
        </Section>
      )}
      <Malfunctions view={view} review={review} />
      <Section title="Tonight">
        <p>
          Deaths:{' '}
          {review.deaths.length
            ? review.deaths.map((id, i) => (
                <span key={id}>
                  {i > 0 ? ', ' : ''}
                  <Who view={view} id={id} role />
                </span>
              ))
            : 'nobody'}
        </p>
        {review.revived.length > 0 && (
          <p>
            Revived:{' '}
            {review.revived.map((id) => (
              <Who key={id} view={view} id={id} role />
            ))}
          </p>
        )}
        {review.gameEnd.map((g) => (
          <Card key={g.key} tone="notice">
            {g.reason}
          </Card>
        ))}
        <details>
          <summary>The night in order</summary>
          <ul>
            {review.actors.map((a, i) => (
              <li key={i}>
                <Who view={view} id={a.playerId} role />: {a.input} {a.outcome}
                {a.impaired ? ` (impaired: ${a.causes.join(', ')})` : ''}
              </li>
            ))}
          </ul>
          <Lines lines={review.log} />
        </details>
      </Section>
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
            <HoldButton onConfirm={() => void run({ type: 'publish_dawn', force: true })}>Publish anyway</HoldButton>
          )}
          <Button disabled={pending} onClick={() => void run({ type: 'reopen_collecting' })}>
            Reopen the night
          </Button>
        </div>
      </Section>
    </div>
  );
}
