// The one place the client knows about ability input, and it knows only the three field kinds. A new role never
// changes it. The server sends every option, and checks every answer.
import type { ActionField, ActionSpec, Choice } from '@ct/protocol';
import { Segments } from './ui';
import styles from './Picker.module.css';

export interface Names {
  players: Record<string, string>;
  roles: Record<string, string>;
}

export function optionText(f: ActionField, o: string, names: Names, dead?: ReadonlySet<string>) {
  if (f.kind === 'player') return `${names.players[o] ?? o}${dead?.has(o) ? ' (dead)' : ''}`;
  if (f.kind === 'role') return names.roles[o] ?? o;
  return f.labels?.[o] ?? o;
}

export function choiceComplete(spec: ActionSpec, c: Choice | undefined): boolean {
  if (!c) return false;
  if (c.decline) return spec.allowDecline;
  if (c.values.length !== spec.fields.length || c.values.some((v) => !v)) return false;
  return !spec.distinct || new Set(c.values).size === c.values.length;
}

export function Picker({
  specs,
  names,
  value,
  onChange,
  dead,
}: {
  specs: ActionSpec[];
  names: Names;
  value: Record<string, Choice>;
  onChange: (v: Record<string, Choice>) => void;
  dead?: ReadonlySet<string> | undefined;
}) {
  return (
    <div>
      {specs.map((spec) => {
        const cur = value[spec.key] ?? { values: [] };
        const set = (c: Choice) => onChange({ ...value, [spec.key]: c });
        const pick = (i: number, v: string) => {
          const values = Array.from({ length: spec.fields.length }, (_, j) =>
            cur.decline ? '' : (cur.values[j] ?? ''),
          );
          values[i] = v;
          set({ values });
        };
        return (
          <fieldset key={spec.key} className={styles['spec']}>
            <legend>{spec.prompt}</legend>
            {spec.fields.map((f, i) => {
              const picked = cur.decline ? '' : (cur.values[i] ?? '');
              const taken = spec.distinct ? cur.values.filter((_, j) => j !== i) : [];
              if (f.kind === 'option') {
                return (
                  <div key={i} className={styles['field']}>
                    <span>{f.label}</span>
                    <Segments
                      label={f.label}
                      options={f.options.map((o) => ({ id: o, text: optionText(f, o, names) }))}
                      value={picked || null}
                      onChange={(v) => pick(i, v)}
                    />
                  </div>
                );
              }
              return (
                <label key={i} className={styles['field']}>
                  <span>{f.label}</span>
                  <select value={picked} onChange={(e) => pick(i, e.target.value)}>
                    <option value="">Choose…</option>
                    {f.options.map((o) => (
                      <option key={o} value={o} disabled={taken.includes(o)}>
                        {optionText(f, o, names, dead)}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
            {spec.allowDecline && (
              <label className={styles['check']}>
                <input
                  type="checkbox"
                  checked={!!cur.decline}
                  onChange={(e) => set(e.target.checked ? { decline: true, values: [] } : { values: [] })}
                />
                {spec.declineLabel ?? 'No action'}
              </label>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
