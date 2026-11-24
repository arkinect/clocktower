// The one place the client knows about ability input, and it knows only the three field kinds. A new role never
// changes it. The server sends every option, and checks every answer.
import { inMode, type ActionField, type ActionSpec, type Choice } from '@ct/protocol';
import { Button, Segments } from './ui';
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

/** A rows spec's player choices, by position: `distinct` applies across every row. */
const playerValues = (spec: ActionSpec, values: string[]) =>
  values.filter((v, i) => v && spec.fields[i % spec.fields.length]?.kind === 'player');

export function choiceComplete(asked: ActionSpec, c: Choice | undefined): boolean {
  if (!c) return false;
  if (c.decline) return asked.allowDecline;
  if (c.values.some((v) => !v)) return false;
  if (asked.modes && !asked.modes.some((m) => m.id === c.mode)) return false;
  const spec = inMode(asked, c.mode);
  if (spec.maxRows) {
    const width = spec.fields.length;
    const rows = c.values.length / width;
    if (!c.values.length || !Number.isInteger(rows) || rows > spec.maxRows) return false;
    const players = playerValues(spec, c.values);
    return !spec.distinct || new Set(players).size === players.length;
  }
  if (c.values.length !== spec.fields.length) return false;
  return !spec.distinct || new Set(c.values).size === c.values.length;
}

/** A dropdown for one field: the client's only control for players and characters. */
function Select({
  f,
  label,
  picked,
  taken,
  names,
  dead,
  onChange,
}: {
  f: ActionField;
  label?: string;
  picked: string;
  taken: string[];
  names: Names;
  dead?: ReadonlySet<string> | undefined;
  onChange: (v: string) => void;
}) {
  return (
    <select aria-label={label} value={picked} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose…</option>
      {f.options.map((o) => (
        <option key={o} value={o} disabled={taken.includes(o)}>
          {optionText(f, o, names, dead)}
        </option>
      ))}
    </select>
  );
}

/**
 * Up to `maxRows` rows of the spec's fields (the Juggler's guesses). A new row appears once the last is filled in, and
 * a row emptied or removed goes, so the answer is always whole rows plus at most one being filled in.
 */
function Rows({
  spec,
  names,
  values,
  dead,
  onChange,
}: {
  spec: ActionSpec;
  names: Names;
  values: string[];
  dead?: ReadonlySet<string> | undefined;
  onChange: (values: string[]) => void;
}) {
  const width = spec.fields.length;
  const max = spec.maxRows ?? 1;
  const rows = Array.from({ length: Math.ceil(values.length / width) }, (_, r) =>
    spec.fields.map((_, i) => values[r * width + i] ?? ''),
  );
  const last = rows[rows.length - 1];
  const shown = !last || (last.every(Boolean) && rows.length < max) ? [...rows, spec.fields.map(() => '')] : rows;
  const save = (next: string[][]) => onChange(next.filter((row) => row.some(Boolean)).flat());
  return (
    <>
      {shown.map((row, r) => (
        <div key={r} className={styles['row']}>
          <span>
            {r + 1} of {max}
          </span>
          <div className={styles['rowFields']}>
            {spec.fields.map((f, i) => (
              <Select
                key={i}
                f={f}
                label={`${f.label} ${r + 1}`}
                picked={row[i] ?? ''}
                // Distinct: a player already in another row is greyed out.
                taken={
                  spec.distinct && f.kind === 'player' ? playerValues(spec, shown.filter((_, j) => j !== r).flat()) : []
                }
                names={names}
                dead={dead}
                onChange={(v) => save(shown.map((x, j) => (j === r ? x.map((y, k) => (k === i ? v : y)) : x)))}
              />
            ))}
            {row.some(Boolean) && (
              <Button tiny onClick={() => save(shown.filter((_, j) => j !== r))}>
                Remove
              </Button>
            )}
          </div>
        </div>
      ))}
    </>
  );
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
      {specs.map((asked) => {
        const cur = value[asked.key] ?? { values: [] };
        // The first mode until another is picked.
        const mode = cur.mode ?? asked.modes?.[0]?.id;
        const spec = inMode(asked, mode);
        const set = (c: Choice) =>
          onChange({ ...value, [spec.key]: c.decline || !mode ? c : { ...c, mode: c.mode ?? mode } });
        // Whole rows that fit the new mode stay.
        const setMode = (to: string) => {
          const room = (inMode(asked, to).maxRows ?? 1) * spec.fields.length;
          set({ mode: to, values: cur.decline ? [] : cur.values.slice(0, room) });
        };
        const pick = (i: number, v: string) => {
          const values = Array.from({ length: spec.fields.length }, (_, j) =>
            cur.decline ? '' : (cur.values[j] ?? ''),
          );
          values[i] = v;
          set({ values });
        };
        return (
          // A bare picker (the Cannibal's meal) has no prompt: it goes by its title instead.
          <fieldset key={spec.key} className={styles['spec']} {...(spec.prompt ? {} : { 'aria-label': spec.title })}>
            {spec.prompt && <legend>{spec.prompt}</legend>}
            {asked.modes && (
              <div className={styles['field']}>
                <Segments
                  label={spec.title}
                  options={asked.modes.map((m) => ({ id: m.id, text: m.label }))}
                  value={cur.decline ? null : (mode ?? null)}
                  onChange={setMode}
                />
              </div>
            )}
            {spec.maxRows ? (
              <Rows
                spec={spec}
                names={names}
                values={cur.decline ? [] : cur.values}
                dead={dead}
                onChange={(values) => set({ values })}
              />
            ) : (
              spec.fields.map((f, i) => {
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
                    <Select
                      f={f}
                      picked={picked}
                      taken={taken}
                      names={names}
                      dead={dead}
                      onChange={(v) => pick(i, v)}
                    />
                  </label>
                );
              })
            )}
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
