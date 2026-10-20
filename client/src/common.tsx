import { useEffect, useRef, useState, type ReactNode } from 'react';
import { FIRST_NIGHT_ORDER, OTHER_NIGHT_ORDER, ROLE_BY_ID, ROLES, type ActionChoice, type ActionSpec, type PrivateMessage, type RoleCard as RC, type RoleType } from '@ct/shared';

export const TYPE_LABEL: Record<RoleType, string> = { townsfolk: 'Townsfolk', outsider: 'Outsiders', minion: 'Minions', demon: 'Demons' };
export const TYPE_ORDER: RoleType[] = ['townsfolk', 'outsider', 'minion', 'demon'];

export function RoleList({ enabled }: { enabled: string[] }) {
  return (
    <div>
      {TYPE_ORDER.map((t) => {
        const rs = ROLES.filter((r) => r.type === t && enabled.includes(r.id)).sort((a, b) => a.name.localeCompare(b.name));
        if (!rs.length) return null;
        return (
          <section key={t} className="rolegroup">
            <h3 className={`type-${t}`}>{TYPE_LABEL[t]}</h3>
            {rs.map((r) => (
              <div key={r.id} className="roleitem">
                <img className="roleicon" src={`/icons/${r.id}.png`} alt="" loading="lazy" />
                <div>
                  <b className={`type-${t}`}>{r.name}</b>
                  <p>{r.abilityText}</p>
                </div>
              </div>
            ))}
          </section>
        );
      })}
    </div>
  );
}

/** Night order of roles only (never people), generated from the order data and filtered to enabled roles. */
export function NightOrder({ enabled }: { enabled: string[] }) {
  const hasDemon = enabled.some((r) => ROLE_BY_ID[r]?.type === 'demon');
  const filt = (order: typeof FIRST_NIGHT_ORDER) => order.filter((s) => (s.roleId ? enabled.includes(s.roleId) : s.id === 'demon_info' && hasDemon));
  return (
    <div className="nightorder">
      <section>
        <h3>Night 0 (first night)</h3>
        <ol>{filt(FIRST_NIGHT_ORDER).map((s) => <li key={s.id}>{s.label}{s.note ? <span className="muted"> — {s.note}</span> : null}</li>)}</ol>
      </section>
      <section>
        <h3>Other nights</h3>
        <ol>{filt(OTHER_NIGHT_ORDER).map((s) => <li key={s.id}>{s.label}{s.note ? <span className="muted"> — {s.note}</span> : null}</li>)}</ol>
      </section>
    </div>
  );
}

export function Seating({ names, published, dead }: { names: string[]; published: boolean; dead?: boolean[] }) {
  if (!published) return <p className="muted">The Storyteller has not published the seating yet.</p>;
  return (
    <div>
      <ol className="seating">{names.map((n, i) => <li key={i} className={dead?.[i] ? 'dead-name' : undefined}>{n}</li>)}</ol>
      <p className="muted small">The circle closes: {names[names.length - 1]} sits next to {names[0]}.</p>
    </div>
  );
}

export function RoleCardView({ role, hiddenByDefault = true }: { role: RC | null; hiddenByDefault?: boolean }) {
  const [shown, setShown] = useState(!hiddenByDefault);
  if (!role) return <div className="rolecard empty">No role yet.</div>;
  return (
    <div className={`rolecard ${shown ? 'shown' : ''}`} onClick={() => setShown(!shown)}>
      {shown ? (
        <>
          <div className={`rtype type-${role.type}`}>{TYPE_LABEL[role.type].replace(/s$/, '')}</div>
          <div className="rname">{role.name}</div>
          <p>{role.abilityText}</p>
          <div className="muted small">Tap to hide</div>
        </>
      ) : (
        <div className="reveal">Tap to reveal your role</div>
      )}
    </div>
  );
}

export function Messages({ messages, emptyText }: { messages: PrivateMessage[]; emptyText?: string }) {
  if (!messages.length) return emptyText ? <p className="muted">{emptyText}</p> : null;
  return (
    <div className="messages">
      {messages.map((m) => (
        <div key={m.id} className={`msg msg-${m.kind}`}>
          <b>{m.title}</b>
          {m.lines.map((l, i) => <p key={i}>{l}</p>)}
        </div>
      ))}
    </div>
  );
}

export function useNow(intervalMs = 500) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function Countdown({ endsAt, offset }: { endsAt: number | null; offset: number }) {
  const now = useNow() + offset;
  if (!endsAt) return null;
  const left = Math.max(0, Math.round((endsAt - now) / 1000));
  const m = Math.floor(left / 60);
  const s = left % 60;
  return <span className={`countdown ${left === 0 ? 'up' : ''}`}>{left === 0 ? 'Time is up' : `${m}:${String(s).padStart(2, '0')}`}</span>;
}

/** A picker for one or more actions. Used for real pickers, decoys and the Admin's submit-on-behalf. */
export function ActionPicker({ specs, names, value, onChange, dead }: {
  specs: ActionSpec[];
  names: Record<string, string>;
  /** Players to show in red (dead). */
  dead?: Set<string>;
  value: Record<string, ActionChoice>;
  onChange: (v: Record<string, ActionChoice>) => void;
}) {
  return (
    <div className="picker">
      {specs.map((spec) => {
        const cur = value[spec.key] ?? { values: [] };
        const set = (c: ActionChoice) => onChange({ ...value, [spec.key]: c });
        return (
          <div key={spec.key} className="pickspec">
            <div className="pickhead">{spec.prompt}</div>
            {spec.fields.map((f, i) => (
              <label key={i} className="field">
                <span>{f.label}</span>
                <select
                  value={cur.decline ? '' : cur.values[i] ?? ''}
                  onChange={(e) => {
                    const vals = cur.decline ? [] : cur.values.slice();
                    while (vals.length < spec.fields.length) vals.push('');
                    vals[i] = e.target.value;
                    set({ values: vals });
                  }}
                >
                  <option value="">Choose…</option>
                  {f.options.map((o) => <option key={o} value={o} style={f.kind === 'player' && dead?.has(o) ? { color: '#ff6b6b' } : undefined}>{f.kind === 'player' ? names[o] ?? o : ROLE_BY_ID[o]?.name ?? o}</option>)}
                </select>
              </label>
            ))}
            {spec.allowDecline && (
              <label className="check">
                <input type="checkbox" checked={!!cur.decline} onChange={(e) => set(e.target.checked ? { decline: true, values: [] } : { values: [] })} />
                {spec.declineLabel ?? 'No action'}
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function choiceComplete(spec: ActionSpec, c: ActionChoice | undefined): boolean {
  if (!c) return false;
  if (c.decline) return spec.allowDecline;
  if (c.values.length !== spec.fields.length || c.values.some((v) => !v)) return false;
  if (spec.distinct) {
    const ps = c.values.filter((_, i) => spec.fields[i].kind === 'player');
    if (new Set(ps).size !== ps.length) return false;
  }
  return true;
}

/**
 * A button for consequential actions: the first click arms a 3-second countdown (a fill wipes across the
 * button and its text becomes "Cancel"); clicking again cancels; when the countdown ends the action runs.
 */
export function TimedButton({ onConfirm, children, className, disabled, seconds = 3 }: {
  onConfirm: () => void;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  seconds?: number;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const action = useRef(onConfirm);
  action.current = onConfirm;
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => { if (disabled && armed) { window.clearTimeout(timer.current); setArmed(false); } }, [disabled, armed]);
  const click = () => {
    if (armed) {
      window.clearTimeout(timer.current);
      setArmed(false);
      return;
    }
    setArmed(true);
    timer.current = window.setTimeout(() => {
      setArmed(false);
      action.current();
    }, seconds * 1000);
  };
  return (
    <button
      className={`timed ${className ?? ''}${armed ? ' armed' : ''}`}
      disabled={disabled}
      onClick={click}
      style={{ ['--timed-ms' as string]: `${seconds * 1000}ms` }}
    >
      <span className="timed-fill" />
      <span className="timed-label">{armed ? 'Cancel' : children}</span>
    </button>
  );
}

const CAUSE_SOURCE: Record<string, string> = {
  poisoner: 'Poisoner', sailor: 'Sailor', innkeeper: 'Innkeeper', goon: 'Goon', philosopher: 'Philosopher', pukka: 'Pukka',
  no_dashii: 'No Dashii', vigormortis: 'Vigormortis', witch: 'Witch', admin: 'Storyteller',
};

/** "poisoned:poisoner" -> "Poisoned by the Poisoner"; "own_character" -> "Drunk/Marionette (own role)". */
export function causeLabel(c: string): string {
  if (c === 'own_character') return 'Drunk/Marionette (own role)';
  const [kind, src] = c.split(':');
  const what = kind === 'poisoned' ? 'Poisoned' : kind === 'drunk' ? 'Drunk' : kind.replace(/_/g, ' ');
  if (!src) return what;
  return src === 'admin' ? `${what} (set by you)` : `${what} by the ${CAUSE_SOURCE[src] ?? src.replace(/_/g, ' ')}`;
}

/** One tidy chip per impairment cause, wrapping cleanly when there are several. */
export function ImpairmentTags({ causes }: { causes: string[] }) {
  return (
    <span className="imptags">
      {causes.map((c) => <span key={c} className="imptag">{causeLabel(c)}</span>)}
    </span>
  );
}
