import { useState } from 'react';
import { abilitiesOf, ROLE_BY_ID, type GameState } from '@ct/shared';
import { send } from '../api';
import { ImpairmentTags, TimedButton } from '../common';
import { InactiveNote, Who, type AdminCtx } from './AdminApp';

export function DayPanel({ ctx }: { ctx: AdminCtx }) {
  const { s, names, seated, roleOf, label } = ctx;
  if (s.phase !== 'DAY') {
    return <InactiveNote s={s} what="No day in progress." />;
  }
  const d = s.days[s.dayNumber] ?? { executedPlayerId: null, demonVoted: null, jugglerCorrect: null, moonchildTargetId: null, mezephelesSayer: null, gossipStatement: 'none' as const, notes: '' };
  const alive = seated.filter((id) => s.players.find((p) => p.id === id)!.alive);
  const inPlay = new Set(seated.map(roleOf));
  const deadMoonchild = seated.some((id) => roleOf(id) === 'moonchild' && !s.players.find((p) => p.id === id)!.alive);
  const fact = (key: 'demonVoted' | 'jugglerCorrect' | 'moonchildTargetId' | 'mezephelesSayer' | 'gossipStatement' | 'notes', value: unknown) => send({ type: 'set_day_fact', key, value });

  return (
    <div className="cols">
      <div>
        <EyesClosedBanner on={ctx.view.eyesClosedVoting} />
        {s.dayPrompts.map((dp) => (
          <section key={dp.id} className="card warn">
            <h3>{dp.title}</h3>
            <p>{dp.description}</p>
            <div className="row">
              <button className="primary" onClick={() => send({ type: 'resolve_day_prompt', id: dp.id, accept: true })}>Yes, she becomes the Demon</button>
              <button onClick={() => send({ type: 'resolve_day_prompt', id: dp.id, accept: false })}>No</button>
            </div>
            <p className="muted small">She is told privately when the next night starts.</p>
          </section>
        ))}
        <section className="card">
          <h2>Day {s.dayNumber}</h2>
          <table className="tbl fixedcols">
            <colgroup><col style={{ width: '34%' }} /><col /><col style={{ width: '150px' }} /></colgroup>
            <tbody>
              {seated.map((id) => {
                const p = s.players.find((x) => x.id === id)!;
                return (
                  <tr key={id} className={p.alive ? '' : 'deadrow'}>
                    <td><Who ctx={ctx} id={id} role /></td>
                    {/* Statuses that matter during the day. Death is shown by the red name. */}
                    <td><DayStatus ctx={ctx} id={id} /></td>
                    {/* Alive -> Dead -> Dead vote (used). Restoring a vote and revives live in the Grimoire. */}
                    <td className="right">
                      {p.alive
                        ? <button className="danger" onClick={() => send({ type: 'mark_alive', playerId: id, alive: false })}>Dead</button>
                        : p.ghostVoteUsed
                          ? <span className="tag slot-tag">Dead vote used</span>
                          : <button onClick={() => send({ type: 'set_ghost_vote', playerId: id, used: true })}>Dead vote</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h2>Execution</h2>
          <div className="row wrap">
            <select value={d.executedPlayerId ?? ''} onChange={(e) => {
              const v = e.target.value || null;
              // No confirmation: the executed player is marked dead. If they survived (Devil's Advocate, Fool), use Mark alive.
              send({ type: 'record_execution', playerId: v, died: !!v });
            }}>
              <option value="">No execution</option>
              {seated.map((id) => <option key={id} value={id} style={ctx.optStyle(id)}>{ctx.label(id)}</option>)}
            </select>
          </div>
          <p className="muted small">The executed player is marked dead. If they survived (e.g. Devil's Advocate, Fool), revive them in the Grimoire.</p>
          <Reminders ctx={ctx} />
        </section>
      </div>
      <div>
        <section className="card">
          <h2>Facts for tonight</h2>
          {inPlay.has('flowergirl') && (
            <div className="field"><span>Did a Demon vote today? (Flowergirl)</span>
              <div className="seg">
                <button className={d.demonVoted === true ? 'on' : ''} onClick={() => fact('demonVoted', true)}>Yes</button>
                <button className={d.demonVoted === false ? 'on' : ''} onClick={() => fact('demonVoted', false)}>No</button>
              </div>
            </div>
          )}
          {inPlay.has('gossip') && (
            <div className="field"><span>Gossip's public statement today</span>
              <div className="seg">
                {(['none', 'true', 'false'] as const).map((v) => (
                  <button key={v} className={(d.gossipStatement ?? 'none') === v ? 'on' : ''} onClick={() => fact('gossipStatement', v)}>{v === 'none' ? 'None' : v === 'true' ? 'True' : 'False'}</button>
                ))}
              </div>
            </div>
          )}
          {inPlay.has('juggler') && s.dayNumber === 1 && (
            <label className="field"><span>Juggler's number correct (0–5)</span>
              <select value={d.jugglerCorrect ?? ''} onChange={(e) => fact('jugglerCorrect', e.target.value === '' ? null : Number(e.target.value))}>
                <option value="">not entered (0)</option>
                {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          )}
          {inPlay.has('moonchild') && (
            <label className="field"><span>Moonchild's chosen player {deadMoonchild ? '' : '(Moonchild is alive)'}</span>
              <select value={d.moonchildTargetId ?? ''} onChange={(e) => fact('moonchildTargetId', e.target.value || null)}>
                <option value="">none</option>
                {alive.map((id) => <option key={id} value={id} style={ctx.optStyle(id)}>{ctx.label(id)}</option>)}
              </select>
            </label>
          )}
          {inPlay.has('mezepheles') && (
            <label className="field"><span>Good player who said Mezepheles' word ("{s.setup.mezephelesWord}"){s.setup.mezephelesSpent ? ' — word already spent' : ''}</span>
              <select value={d.mezephelesSayer ?? ''} disabled={s.setup.mezephelesSpent} onChange={(e) => fact('mezephelesSayer', e.target.value || null)}>
                <option value="">nobody</option>
                {seated.filter((id) => s.assignments[id]?.alignment === 'good').map((id) => <option key={id} value={id} style={ctx.optStyle(id)}>Word said by {ctx.label(id)}</option>)}
              </select>
            </label>
          )}
          <label className="field"><span>Notes</span>
            <textarea rows={3} defaultValue={d.notes} key={`notes-${s.dayNumber}`} onBlur={(e) => e.target.value !== d.notes && fact('notes', e.target.value)} />
          </label>
        </section>
        <DayAbilities ctx={ctx} />
        <CannibalPanel ctx={ctx} />
        <AbilityTracker ctx={ctx} />
        <section className="card">
          <TimedButton className="primary big" onConfirm={() => send({ type: 'start_night' })}>Start Night {s.nightNumber + 1}</TimedButton>
        </section>
      </div>
    </div>
  );
}

/**
 * The Ability tracker's rows: one per once-per-game ability a player really has, now or later (their role, a
 * Philosopher's gained ability, an eaten one), in seat order. A believed role (Drunk, Marionette) has no row.
 */
export function trackerRows(s: GameState, seated: string[]): { id: string; r: string; k: string; manual: boolean }[] {
  return seated.flatMap((id) => {
    const own = s.assignments[id]?.roleId;
    const roles = [...new Set([...(own ? [own] : []), ...abilitiesOf(s, id, Infinity).filter((x) => x.real).map((x) => x.roleId)])];
    return roles.flatMap((r) => {
      const f = ROLE_BY_ID[r]?.usedFlag;
      return f ? [{ id, r, k: f.key, manual: !f.auto }] : [];
    });
  });
}

export function AbilityTracker({ ctx }: { ctx: AdminCtx }) {
  const { s, seated, roleOf } = ctx;
  const rows = trackerRows(s, seated);
  const damsel = seated.some((id) => roleOf(id) === 'damsel');
  if (!rows.length && !damsel) return null;
  return (
    <section className="card">
      <h2>Ability tracker</h2>
      {rows.map(({ id, r, k, manual }) => {
        const used = !!s.flags[id]?.[k];
        return (
          <div key={`${id}:${k}`} className="row">
            <span className="grow"><Who ctx={ctx} id={id} role />{r !== roleOf(id) && <span className="muted small"> ({ROLE_BY_ID[r].name})</span>}</span>
            <button className={`chip ${used ? 'used' : ''}`} onClick={() => send({ type: 'set_flag', playerId: id, key: k, value: !used })}>{used ? 'Used' : 'Unused'}</button>
            {!manual && <span className="muted small">auto</span>}
          </div>
        );
      })}
      {damsel && (
        <div className="row">
          <span className="grow">Damsel guess (evil team)</span>
          <button className={`chip ${s.setup.damselGuessUsed ? 'used' : ''}`} onClick={() => send({ type: 'set_damsel_guess_used', value: !s.setup.damselGuessUsed })}>{s.setup.damselGuessUsed ? 'Guess used' : 'Guess unused'}</button>
        </div>
      )}
    </section>
  );
}

export interface CannibalRow {
  id: string;
  executeeId: string;
  /** The eaten ability (null: none). */
  roleId: string | null;
  fromNight: number;
  /** The executee was evil: the ability (if the Storyteller gives one) is not real. */
  evil: boolean;
  /** Only believes they are the Cannibal (a Drunk or Marionette): never poisoned, nothing real. */
  believed: boolean;
  poisoned: boolean;
}

/** One row per player with the Cannibal's ability (real or believed) who has eaten, in seat order. */
export function cannibalRows(s: GameState, seated: string[]): CannibalRow[] {
  return seated.flatMap((id) => {
    const eaten = s.assignments[id]?.eatenAbility;
    const holder = abilitiesOf(s, id, Infinity).find((x) => x.roleId === 'cannibal' && x.source !== 'cannibal');
    if (!eaten || !holder) return [];
    return [{
      id, executeeId: eaten.executeeId, roleId: eaten.roleId, fromNight: eaten.fromNight, evil: eaten.fake, believed: !holder.real,
      poisoned: s.effects.some((e) => e.cause === 'cannibal' && e.targetPlayerId === id),
    }];
  });
}

/** What the Storyteller reads about an eat, after "X ate Y: ". */
export function cannibalSummary(r: CannibalRow): string {
  const ability = r.roleId ? `the ${ROLE_BY_ID[r.roleId]?.name ?? r.roleId} ability from night ${r.fromNight}` : 'no ability';
  if (r.evil) return `evil, ${r.poisoned ? 'poisoned' : 'not poisoned'}; thinks they have ${ability}`;
  return r.believed ? `${ability} (not real: they only think they are the Cannibal)` : ability;
}

/**
 * The Cannibal's eats (design.md section 12): who was eaten and the ability, and a dropdown to change it (after an
 * evil eat, the ability the Cannibal thinks they have; or to fix a re-recorded execution). Only Confirm sends.
 */
export function CannibalPanel({ ctx }: { ctx: AdminCtx }) {
  const rows = cannibalRows(ctx.s, ctx.seated);
  if (!rows.length) return null;
  return (
    <section className="card">
      <h2>Cannibal</h2>
      {rows.map((r) => <CannibalEat key={`${r.id}:${r.executeeId}:${r.roleId ?? ''}`} ctx={ctx} row={r} />)}
    </section>
  );
}

export function CannibalEat({ ctx, row }: { ctx: AdminCtx; row: CannibalRow }) {
  const [choice, setChoice] = useState(row.roleId ?? '');
  const roles = ctx.s.script.filter((r) => r !== 'cannibal' && ROLE_BY_ID[r]);
  return (
    <div className="field">
      <span><Who ctx={ctx} id={row.id} role /> ate <Who ctx={ctx} id={row.executeeId} role />: {cannibalSummary(row)}</span>
      <div className="row wrap">
        <select value={choice} onChange={(e) => setChoice(e.target.value)} aria-label="Eaten ability">
          <option value="">Nothing</option>
          {roles.map((r) => <option key={r} value={r}>{ROLE_BY_ID[r].name}</option>)}
        </select>
        <button disabled={choice === (row.roleId ?? '')} onClick={() => send({ type: 'set_cannibal_ability', playerId: row.id, roleId: choice || null })}>Confirm</button>
      </div>
    </div>
  );
}

type KillReq = { kind: 'slayer' | 'witch'; sourceId: string; targetId: string; recluseAs?: 'truthful' | 'minion' | 'demon' };

/** Slayer shot, Witch's curse and the Damsel guess (design.md section 12). */
function DayAbilities({ ctx }: { ctx: AdminCtx }) {
  const { s, seated, roleOf, label, names } = ctx;
  const [slayerTarget, setSlayerTarget] = useState('');
  const [recluseAs, setRecluseAs] = useState<'truthful' | 'minion' | 'demon'>('truthful');
  const [guess, setGuess] = useState('');
  const [dialog, setDialog] = useState<{ req: KillReq; preview: { wouldDie: boolean; reason: string } } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  // Anyone with the Slayer's ability, now or from a coming night (a Philosopher who chose it).
  const slayers = seated.filter((id) => abilitiesOf(s, id, Infinity).some((x) => x.real && x.roleId === 'slayer'));
  const curses = s.effects.filter((e) => e.type === 'witched');
  const damselEver = seated.some((id) => roleOf(id) === 'damsel' || s.assignments[id]?.history.some((h) => h.from === 'damsel'));
  const isAlive = (id: string) => !!s.players.find((p) => p.id === id)?.alive;
  if (!slayers.length && !curses.length && !damselEver && !seated.some((id) => roleOf(id) === 'witch')) return null;

  const start = async (req: KillReq) => {
    const r = await send({ type: 'day_kill', ...req, mode: 'preview' });
    if (r.ok) setDialog({ req, preview: r.data });
  };
  const finish = async (mode: 'accept' | 'force_death' | 'force_survive') => {
    if (!dialog) return;
    const r = await send({ type: 'day_kill', ...dialog.req, mode });
    if (r.ok) { setResult(r.data.died ? `${names[dialog.req.targetId]} died.` : `${names[dialog.req.targetId]} survives.`); setDialog(null); }
  };

  return (
    <section className="card">
      <h2>Day abilities</h2>
      {slayers.map((sl) => {
        const used = !!s.flags[sl]?.slayer_used;
        const recluse = slayerTarget && roleOf(slayerTarget) === 'recluse';
        return (
          <div key={sl} className="field">
            <span>Slayer shot (<Who ctx={ctx} id={sl} role />){used ? ' — used' : ''}{!isAlive(sl) ? ' — Slayer is dead' : ''}</span>
            <div className="row wrap">
              <select value={slayerTarget} disabled={used || !isAlive(sl)} onChange={(e) => setSlayerTarget(e.target.value)}>
                <option value="">Target…</option>
                {seated.map((id) => <option key={id} value={id} style={ctx.optStyle(id)}>{ctx.label(id)}</option>)}
              </select>
              {recluse && (
                <select value={recluseAs} onChange={(e) => setRecluseAs(e.target.value as typeof recluseAs)}>
                  <option value="truthful">Recluse registers truthfully</option>
                  <option value="minion">…as a Minion</option>
                  <option value="demon">…as the Demon</option>
                </select>
              )}
              <button disabled={used || !slayerTarget || !isAlive(sl)} onClick={() => start({ kind: 'slayer', sourceId: sl, targetId: slayerTarget, recluseAs: recluse ? recluseAs : undefined })}>Resolve shot</button>
            </div>
          </div>
        );
      })}
      {seated.some((id) => roleOf(id) === 'witch') && (
        <div className="field">
          <span>Witch's curse</span>
          {curses.length ? curses.map((c) => (
            <div key={c.id} className="row">
              <span className="grow">Cursed: <b><Who ctx={ctx} id={c.targetPlayerId} role /></b></span>
              <button disabled={!isAlive(c.targetPlayerId)} onClick={() => start({ kind: 'witch', sourceId: c.sourcePlayerId ?? '', targetId: c.targetPlayerId })}>They nominated, apply curse</button>
            </div>
          )) : <p className="muted small">Nobody is cursed today.</p>}
        </div>
      )}
      {damselEver && (
        <div className="field">
          <span>Record Damsel guess (once per game for the evil team){s.setup.damselGuessUsed ? ' — used' : ''}</span>
          <div className="row wrap">
            <select value={guess} disabled={s.setup.damselGuessUsed} onChange={(e) => setGuess(e.target.value)}>
              <option value="">Guessed player…</option>
              {seated.map((id) => <option key={id} value={id} style={ctx.optStyle(id)}>{ctx.label(id)}</option>)}
            </select>
            <button disabled={s.setup.damselGuessUsed || !guess} onClick={() => send({ type: 'damsel_guess', targetId: guess })}>Record guess</button>
          </div>
          {s.setup.damselGuessResult && (
            <div className={`banner ${s.setup.damselGuessResult.outcome}`}>
              <span>{s.setup.damselGuessResult.text}</span>
              {/* Retracting only clears the record; nothing was or will be sent to players. */}
              <button className="tiny" onClick={() => send({ type: 'set_damsel_guess_used', value: false })}>Retract guess</button>
            </div>
          )}
        </div>
      )}
      {result && <p className="ok">{result}</p>}
      {dialog && (
        <div className="sheet" onClick={() => setDialog(null)}>
          <div className="sheetbody" onClick={(e) => e.stopPropagation()}>
            <h3>{dialog.req.kind === 'slayer' ? 'Slayer shot' : 'Witch\'s curse'}: <Who ctx={ctx} id={dialog.req.targetId} /></h3>
            <p><b>{dialog.preview.reason}</b></p>
            {dialog.req.kind === 'slayer' && <p className="muted small">The Slayer's shot is spent whichever you choose (except Cancel).</p>}
            <div className="row wrap">
              <button className="primary" onClick={() => finish('accept')}>Accept</button>
              <button onClick={() => setDialog(null)}>Cancel</button>
              <button className="danger" onClick={() => finish('force_death')}>Force death</button>
              <button onClick={() => finish('force_survive')}>Force survive</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function Reminders({ ctx }: { ctx: AdminCtx }) {
  const out = dayReminders(ctx.s, ctx.seated, ctx.label);
  if (!out.length) return null;
  return <ul className="reminders">{out.map((x, i) => <li key={i}>{x}</li>)}</ul>;
}

/** The Day panel's reminders: day effects, then each seated player's role reminder (dayReminder roles). */
export function dayReminders(s: GameState, seated: string[], label: (id: string | null) => string): string[] {
  const out: string[] = [];
  for (const e of s.effects) {
    if (e.type === 'devils_advocate') out.push(`Devil's Advocate: ${label(e.targetPlayerId)} does not die if executed today.`);
    if (e.type === 'witched') out.push(`Witch: if ${label(e.targetPlayerId)} nominates today, they die (use the button above).`);
    if (e.type === 'butler_master') out.push(`Butler ${label(e.sourcePlayerId)} may only vote if ${label(e.targetPlayerId)} votes.`);
  }
  for (const id of seated) {
    const r = s.assignments[id]?.roleId ?? null;
    if (r === 'fool' && !s.flags[id]?.fool_used) out.push(`${label(id)}: the first time they die (including execution), they don't.`);
    if (r && ROLE_BY_ID[r]?.reminder && ROLE_BY_ID[r].dayReminder) out.push(`${label(id)}: ${ROLE_BY_ID[r].reminder}`);
  }
  return out;
}

/** "Eyes-closed voting today" while the Organ Grinder's ability works (AdminView.eyesClosedVoting; absent on older servers). */
export function EyesClosedBanner({ on }: { on: boolean | undefined }) {
  if (!on) return null;
  return <div className="banner no_effect" role="status"><b>Eyes-closed voting today.</b> Players keep their eyes closed when voting, and the vote tally is secret (Organ Grinder).</div>;
}

/** Drunk/poisoned (with causes) plus day-relevant effects, for the Day panel's status column. */
function DayStatus({ ctx, id }: { ctx: AdminCtx; id: string }) {
  const { s, view } = ctx;
  const imp = view.impairment[id];
  const extra: string[] = [];
  for (const e of s.effects) {
    if (e.type === 'devils_advocate' && e.targetPlayerId === id) extra.push("Survives execution (Devil's Advocate)");
    if (e.type === 'witched' && e.targetPlayerId === id) extra.push('Cursed: dies if they nominate (Witch)');
    if (e.type === 'butler_master' && e.sourcePlayerId === id) extra.push(`Votes only if ${ctx.names[e.targetPlayerId] ?? '?'} votes (Butler)`);
  }
  if (!imp?.impaired && !extra.length) return null;
  return (
    <span className="imptags">
      {imp?.impaired && <ImpairmentTags causes={imp.causes} />}
      {extra.map((x) => <span key={x} className="statustag">{x}</span>)}
    </span>
  );
}
