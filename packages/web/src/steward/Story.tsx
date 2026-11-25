import type { StewardView } from '@ct/protocol';
import { useNames } from '../app/store';
import styles from '../storyteller/console.module.css';
import { Section } from '../storyteller/common';
import { DayCard, NightCard } from '../storyteller/Story';

/** The public days so far. Once the game has ended, everything that really happened. */
export function Story({ view }: { view: StewardView }) {
  const { revealed, publicStory } = view;
  return (
    <div>
      {revealed && <Revealed revealed={revealed} />}
      {revealed ? (
        revealed.story.map((e) =>
          e.kind === 'day' ? <DayCard key={`d${e.n}`} day={e} /> : <NightCard key={`n${e.n}`} night={e} />,
        )
      ) : publicStory.length ? (
        publicStory.map((d) => (
          <Section key={d.n} title={`☀ Day ${d.n}`}>
            {d.lines.map((l, i) => (
              <p key={i}>{l}</p>
            ))}
          </Section>
        ))
      ) : (
        <p className="muted">The story starts at the first dawn. Everything else opens once the game has ended.</p>
      )}
    </div>
  );
}

function Revealed({ revealed }: { revealed: NonNullable<StewardView['revealed']> }) {
  const names = useNames();
  const role = (id: string | null) => (id ? (names.roles[id] ?? id) : 'no character');
  return (
    <Section title="Who was who">
      <ul className={styles['rows']}>
        {revealed.players.map((p) => (
          <li key={p.id}>
            <span className={styles['grow']}>
              <b className={p.alive ? undefined : styles['dead']}>{p.name}</b>: {role(p.character)}
              {p.believed ? ` (thought ${role(p.believed)})` : ''}, {p.alignment}
              {p.alive ? '' : ', dead'}
            </span>
          </li>
        ))}
      </ul>
      {revealed.bluffs.length > 0 && <p>Demon bluffs: {revealed.bluffs.map(role).join(', ')}.</p>}
    </Section>
  );
}
