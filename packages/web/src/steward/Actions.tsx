// What the steward's own character asks of them, as their phone would: their night choice, a question in the night, a
// question by day. On a tab of its own, so nothing else on the console depends on their character.
import { useState } from 'react';
import type { ActionSpec, Choice, PlayerView } from '@ct/protocol';
import { useCommand, useNames } from '../app/store';
import { DayQuestion } from '../player/autoplay';
import { Section } from '../storyteller/common';
import { Picker, choiceComplete } from '../ui/Picker';
import { Button } from '../ui/ui';

const choosing = (view: PlayerView) => view.phase.kind === 'night' && view.phase.stage === 'collecting';

/** The night waits for the steward. */
export const asked = (view: PlayerView) => choosing(view) || view.me.questions.length > 0;

export function Actions({ view }: { view: PlayerView }) {
  const { run } = useCommand();
  const { actions, questions, dayPrompts = [] } = view.me;
  if (!asked(view) && !dayPrompts.length) return <p className="muted">Nothing to do now.</p>;
  return (
    <div>
      {choosing(view) && (
        <Form
          key={`night:${view.phase.n}`}
          title="Night action"
          specs={actions}
          dead={view.deadAtDawn}
          onSubmit={(choice) => run({ type: 'submit_night', actions: choice })}
        />
      )}
      {questions.map((q) => (
        <Form
          key={q.key}
          title={q.title}
          specs={[q]}
          dead={[]}
          onSubmit={async (choice) => {
            const answer = choice[q.key];
            if (answer) await run({ type: 'answer_question', key: q.key, choice: answer });
          }}
        />
      ))}
      {dayPrompts.map((p) => (
        <DayQuestion key={p.key} spec={p} />
      ))}
    </div>
  );
}

function Form({
  title,
  specs,
  dead,
  onSubmit,
}: {
  title: string;
  specs: ActionSpec[];
  dead: readonly string[];
  onSubmit: (choice: Record<string, Choice>) => Promise<unknown>;
}) {
  const names = useNames();
  const [choice, setChoice] = useState<Record<string, Choice>>({});
  const [sending, setSending] = useState(false);
  const complete = specs.every((s) => choiceComplete(s, choice[s.key]));
  const submit = async () => {
    setSending(true);
    await onSubmit(choice);
    setSending(false);
  };
  return (
    <Section title={title}>
      <Picker specs={specs} names={names} value={choice} onChange={setChoice} dead={new Set(dead)} />
      <Button variant="primary" disabled={sending || !complete} onClick={() => void submit()}>
        Submit
      </Button>
    </Section>
  );
}
