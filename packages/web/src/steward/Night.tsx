import type { StewardView } from '@ct/protocol';
import { useCommand } from '../app/store';
import styles from '../storyteller/console.module.css';
import { Section } from '../storyteller/common';
import { Button, Countdown, HoldButton } from '../ui/ui';
import { nameOf } from './common';
import own from './steward.module.css';

export function Night({ view }: { view: StewardView }) {
  if (view.phase.kind !== 'night') return <p className="muted">It is not night.</p>;
  if (view.phase.stage === 'briefing') return <Briefing view={view} />;
  return <Board view={view} />;
}

function Briefing({ view }: { view: StewardView }) {
  const { run, pending } = useCommand();
  const { seen, of } = view.seenRole ?? { seen: 0, of: 0 };
  return (
    <Section title="Roles are out">
      <p>
        {seen} of {of} players have looked at their role. Yours is on My role.
      </p>
      <Button variant="primary" big disabled={pending} onClick={() => void run({ type: 'open_night' })}>
        Open the night
      </Button>
    </Section>
  );
}

/** One number, whoever it is: names only once the countdown is over, when they would be called out. */
function Board({ view }: { view: StewardView }) {
  const { run, pending } = useCommand();
  const { night } = view;
  if (!night) return null;
  const offset = view.serverNow - Date.now();
  return (
    <div>
      {night.stuck && (
        <Section title="The app could not finish the night">
          <Button disabled={pending} onClick={() => void run({ type: 'retry_night' })}>
            Try again
          </Button>
          <p className="muted">If it still cannot, abandon the game on the Table tab.</p>
        </Section>
      )}
      {!night.closed && (
        <Section title="Not done yet">
          <p className={own['number']}>{night.notDone}</p>
          {view.me.phase.stage === 'collecting' && <p>You are one of them. Yours is on Actions.</p>}
          <p>
            <Countdown endsAt={view.phase.deadline} offset={offset} />
          </p>
          <Button disabled={pending} onClick={() => void run({ type: 'add_time', seconds: 60 })}>
            Add a minute
          </Button>
          {night.names && (
            <ul className={styles['rows']}>
              {night.names.map((id) => (
                <li key={id}>
                  <span className={styles['grow']}>{nameOf(view, id)}</span>
                  <HoldButton disabled={pending} onConfirm={() => void run({ type: 'skip_player', playerId: id })}>
                    Skip
                  </HoldButton>
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}
      {night.closed && (
        <Section title="The night is ending">
          {night.dawn === 'soon' && (
            <p>
              Dawn can be called in <Countdown endsAt={night.dawnAt} offset={offset} />.
            </p>
          )}
          {night.dawn === 'waiting' && <p>Not yet: the night is not over.</p>}
          <Button
            variant="primary"
            big
            disabled={pending || night.dawn !== 'ready'}
            onClick={() => void run({ type: 'call_dawn' })}
          >
            Call dawn
          </Button>
          {night.canSkip && (
            <HoldButton disabled={pending} onConfirm={() => void run({ type: 'skip_questions' })}>
              Wait no longer
            </HoldButton>
          )}
        </Section>
      )}
    </div>
  );
}
