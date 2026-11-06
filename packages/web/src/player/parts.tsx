// Read-only pieces of the phone app: role card, script, night order, seating and messages.
import { useState } from 'react';
import type { CharacterType, Jinx, Message, PlayerView, RoleCard } from '@ct/protocol';
import styles from './player.module.css';

const TYPE_LABEL: Record<CharacterType, string> = {
  townsfolk: 'Townsfolk',
  outsider: 'Outsiders',
  minion: 'Minions',
  demon: 'Demons',
  traveller: 'Travellers',
  fabled: 'Fabled',
  loric: 'Loric',
};

const TYPE_ORDER = Object.keys(TYPE_LABEL) as CharacterType[];

export const typeName = (t: CharacterType) => (t === 'townsfolk' ? 'Townsfolk' : TYPE_LABEL[t].replace(/s$/, ''));

export function RoleIcon({ id }: { id: string }) {
  return <img className={styles['roleIcon']} src={`/icons/${id}.png`} alt="" loading="lazy" />;
}

/** Tap to reveal. Both faces keep their place, and the hidden one is invisible, so nothing moves. */
export function RoleCardView({ role }: { role: RoleCard | null }) {
  const [shown, setShown] = useState(false);
  if (!role) return <div className={styles['roleCard']}>No role yet.</div>;
  return (
    <button type="button" className={styles['roleCard']} aria-expanded={shown} onClick={() => setShown(!shown)}>
      <span className={`${styles['roleFace']} ${shown ? '' : styles['offFace']}`} aria-hidden={!shown || undefined}>
        <span className={`${styles['roleType']} type-${role.type}`}>{typeName(role.type)}</span>
        <RoleIcon id={role.roleId} />
        <span className={styles['roleName']}>{role.name}</span>
        <span>{role.abilityText}</span>
        <span className="muted small">Tap to hide</span>
      </span>
      <span className={`${styles['roleFace']} ${shown ? styles['offFace'] : ''}`} aria-hidden={shown || undefined}>
        <span className={styles['reveal']}>Tap to reveal your role</span>
      </span>
    </button>
  );
}

export function Messages({ messages, emptyText }: { messages: Message[]; emptyText?: string }) {
  if (!messages.length) return emptyText ? <p className="muted">{emptyText}</p> : null;
  return (
    <div className={styles['messages']}>
      {messages.map((m) => (
        <div key={m.id} className={`${styles['message']} ${styles[m.kind]}`}>
          <b>{m.title}</b>
          {m.lines.map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
      ))}
    </div>
  );
}

export function RoleList({ script, catalog, jinxes }: { script: string[]; catalog: RoleCard[]; jinxes: Jinx[] }) {
  const roles = catalog.filter((c) => script.includes(c.roleId));
  const inPlay = jinxes.filter((j) => script.includes(j.a) && script.includes(j.b));
  const name = (id: string) => catalog.find((c) => c.roleId === id)?.name ?? id;
  return (
    <div>
      {!roles.length && <p className="muted">The Storyteller has not chosen a script yet.</p>}
      {TYPE_ORDER.map((t) => {
        const rows = roles.filter((r) => r.type === t).sort((a, b) => a.name.localeCompare(b.name));
        if (!rows.length) return null;
        return (
          <section key={t}>
            <h3 className={`${styles['groupHead']} type-${t}`}>{TYPE_LABEL[t]}</h3>
            {rows.map((r) => (
              <div key={r.roleId} className={styles['roleItem']}>
                <RoleIcon id={r.roleId} />
                <div>
                  <b className={`type-${t}`}>{r.name}</b>
                  <p>{r.abilityText}</p>
                </div>
              </div>
            ))}
          </section>
        );
      })}
      {inPlay.length > 0 && (
        <section>
          <h3 className={styles['groupHead']}>Jinxes</h3>
          {inPlay.map((j) => (
            <p key={`${j.a}:${j.b}`}>
              <b>
                {name(j.a)} and {name(j.b)}:
              </b>{' '}
              {j.text}
            </p>
          ))}
        </section>
      )}
    </div>
  );
}

/** Roles only, never people, ordered by the numbers the server sent. */
export function NightOrder({ script, catalog }: { script: string[]; catalog: RoleCard[] }) {
  const inOrder = (key: 'firstNight' | 'otherNight') =>
    catalog
      .filter((c) => script.includes(c.roleId) && c[key] !== null)
      .sort((a, b) => (a[key] as number) - (b[key] as number));
  return (
    <div>
      <h3>Night 0 (first night)</h3>
      <ol>
        {inOrder('firstNight').map((c) => (
          <li key={c.roleId}>{c.name}</li>
        ))}
      </ol>
      <h3>Other nights</h3>
      <ol>
        {inOrder('otherNight').map((c) => (
          <li key={c.roleId}>{c.name}</li>
        ))}
      </ol>
    </div>
  );
}

export function Seating({ view, catalog }: { view: PlayerView; catalog: RoleCard[] }) {
  if (!view.seatingPublished) return <p className="muted">The Storyteller has not published the seating yet.</p>;
  const seats = view.players.filter((p) => p.seat !== null).sort((a, b) => (a.seat as number) - (b.seat as number));
  const first = seats[0];
  const last = seats.at(-1);
  return (
    <div>
      <ol className={styles['seating']}>
        {seats.map((p) => {
          const dead = view.deadAtDawn.includes(p.id);
          const traveller = catalog.find((c) => c.roleId === p.publicRole)?.name;
          return (
            <li key={p.id} className={dead ? styles['deadName'] : undefined}>
              {p.name}
              {traveller ? ` (${traveller})` : ''}
              {dead ? ' (dead)' : ''}
              {p.exiled ? ' (exiled)' : ''}
            </li>
          );
        })}
      </ol>
      {first && last && (
        <p className="muted small">
          The circle closes: {last.name} sits next to {first.name}.
        </p>
      )}
    </div>
  );
}
