// Small helpers shared by the steward's panels.
import type { PlayerId, StewardView } from '@ct/protocol';
import { seatPlace } from '../storyteller/circle';
import circle from '../storyteller/console.module.css';
import { Card } from '../ui/ui';
import styles from './steward.module.css';

export type StewardPlayer = StewardView['players'][number];

export const seatedPlayers = (view: StewardView): StewardPlayer[] =>
  view.players.filter((p) => p.seat !== null).sort((a, b) => (a.seat as number) - (b.seat as number));

export const nameOf = (view: StewardView, id: string | null) => view.players.find((p) => p.id === id)?.name ?? '';

export function phaseText(view: StewardView) {
  const { kind, n, stage } = view.phase;
  if (kind === 'night') return stage === 'briefing' ? `Night ${n}: roles are out` : `Night ${n}`;
  if (kind === 'day') return `Day ${n}`;
  return { lobby: 'Lobby', setup: 'Setup', ended: 'Game over' }[kind];
}

/** What to tell the table. Announcements only: the steward's own results live on My role. */
export function Tell({ lines }: { lines: readonly string[] }) {
  if (!lines.length) return null;
  return (
    <Card tone="notice">
      <h2 className={styles['tellHead']}>Tell the table</h2>
      {lines.map((l, i) => (
        <p key={i} className={styles['tell']}>
          {l}
        </p>
      ))}
    </Card>
  );
}

/** The circle of seats, to be pressed. Alive, dead and votes left, and nothing else. */
export function Circle({
  view,
  on = [],
  onPress,
  children,
  label,
}: {
  view: StewardView;
  /** Pressed seats. */
  on?: readonly PlayerId[];
  onPress?: (p: StewardPlayer) => void;
  children?: React.ReactNode;
  label: string;
}) {
  const seated = seatedPlayers(view);
  return (
    <div className={`${circle['circle']} ${styles['seats']}`} role="group" aria-label={label}>
      {seated.map((p, i) => {
        const { left, top, size } = seatPlace(i, seated.length);
        const facts = [
          p.alive ? 'alive' : p.votesLeft ? 'dead, 1 vote left' : 'dead, no vote left',
          ...(p.away ? ['away'] : []),
          ...(p.id === view.meId ? ['you'] : []),
        ];
        const pressed = on.includes(p.id);
        return (
          <button
            key={p.id}
            type="button"
            className={`${circle['token']} ${pressed ? styles['tokenOn'] : ''}`}
            style={{
              left: `${left}%`,
              top: `${top}%`,
              width: `${size}%`,
              height: `${size}%`,
              fontSize: `clamp(9px, ${size / 6}cqw, 16px)`,
            }}
            aria-pressed={pressed}
            aria-label={`Seat ${i + 1}: ${p.name}, ${facts.join(', ')}`}
            disabled={!onPress}
            onClick={() => onPress?.(p)}
          >
            <span className={p.alive ? circle['tokenName'] : `${circle['tokenName']} ${circle['dead']}`}>{p.name}</span>
            {p.id === view.meId && <span className={`${circle['tokenLine']} muted`}>you</span>}
            {!p.alive && (
              <span className={`${circle['tokenLine']} muted`}>{p.votesLeft ? 'dead, 1 vote' : 'dead'}</span>
            )}
            {p.away && <span className={`${circle['tokenLine']} muted`}>away</span>}
          </button>
        );
      })}
      {children && <div className={circle['circleCentre']}>{children}</div>}
    </div>
  );
}
