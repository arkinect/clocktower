// Role behaviour modules (section 14). Each role declares its night input (spec) and how it resolves.
// Owner decision: night pickers list dead players too (abilities can be wasted on bodies), except where a role
// needs a specific group (Lil' Monsta passes only to living Minions, the Professor picks only the dead).
import { ROLE_BY_ID, type ActionSpec, type GameState, type WorldState } from '@ct/shared';
import type { Actor, NightRun } from '../night';
import { becomeDemon, demonInfoLines } from '../demon';
import {
  aliveIds, aliveNeighbours, alignmentOf, findPlayer, flag, isAlive, isDemon, nameOf, nearestAliveMatching, roleIdOf,
  roleName, rs, seatDistance, seatedIds, typeOf,
} from '../world';

export interface SpecCtx { w: WorldState; pid: string; night: number; state: GameState }

export interface RoleBehaviour {
  /** Extra condition for waking tonight (beyond being in the night order and able to act). */
  wakes?(ctx: SpecCtx): boolean;
  /** The player's input tonight, or null if the role wakes without input. */
  spec?(ctx: SpecCtx): ActionSpec | null;
  resolve?(run: NightRun, actor: Actor): void;
  actsWhileDead?: boolean;
}

const enabled = (s: GameState) => Object.keys(s.enabledRoles).filter((r) => s.enabledRoles[r] && ROLE_BY_ID[r]);

function players(key: string, title: string, prompt: string, count: number, options: string[], distinct = true, decline?: string): ActionSpec {
  return {
    key, roleId: key, title, prompt,
    fields: Array.from({ length: count }, (_, i) => ({ kind: 'player' as const, label: count > 1 ? `Player ${i + 1}` : 'Player', options })),
    distinct, allowDecline: !!decline, declineLabel: decline,
  };
}

const alive = (c: SpecCtx) => aliveIds(c.w);
const all = (c: SpecCtx) => seatedIds(c.w);
const target = (a: Actor) => (a.choice && !a.choice.decline ? a.choice.values : []);

function otherNumbers(run: NightRun, key: string, truth: number, min: number, max: number): number {
  const opts: number[] = [];
  for (let i = min; i <= max; i++) if (i !== truth) opts.push(i);
  return opts.length ? run.rng(key).pick(opts) : truth;
}

function numberAlternatives(min: number, max: number, fmt: (n: number) => string[]): string[][] {
  const out: string[][] = [];
  for (let i = min; i <= max; i++) out.push(fmt(i));
  return out;
}

const yesNo = (v: boolean) => (v ? 'Yes' : 'No');

export const BEHAVIOURS: Record<string, RoleBehaviour> = {
  // ===================== Townsfolk =====================
  philosopher: {
    // Hidden once used: either the used flag, or an ability already gained (the flag can be toggled by hand).
    wakes: (c) => !flag(c.w, c.pid, 'philosopher_used') && !c.w.assignments[c.pid]?.grantedAbility,
    spec: (c) => ({
      key: 'philosopher', roleId: 'philosopher', title: 'Philosopher', prompt: 'Choose a good character to gain its ability, or wait.',
      fields: [{ kind: 'role', label: 'Character', options: enabled(c.state).filter((r) => ROLE_BY_ID[r].alignment === 'good' && r !== 'philosopher') }],
      distinct: false, allowDecline: true, declineLabel: 'Not tonight',
    }),
    resolve(run, a) {
      const [roleId] = target(a);
      if (!roleId) return;
      run.setFlag(a.pid, 'philosopher_used');
      if (run.sober(a.pid)) {
        run.w.assignments[a.pid].grantedAbility = { roleId, fromNight: run.n + 1 };
        if (roleId === 'grandmother') run.setRs(a.pid, 'grandmotherInfoPending', true);
        run.outcome(`gains the ${roleName(roleId)} ability from next night`);
        for (const pid of seatedIds(run.w)) {
          if (pid !== a.pid && roleIdOf(run.w, pid) === roleId) {
            run.addEffect('drunk', 'philosopher', a.pid, pid, 'until_removed');
            run.outcome(`${run.name(pid)} (${roleName(roleId)}) is drunk while the Philosopher lives`);
          }
        }
        if (!BEHAVIOURS[roleId]?.spec && !BEHAVIOURS[roleId]?.resolve) run.outcome(`Reminder: ${roleName(roleId)} is a day/passive ability`);
      } else run.outcome('impaired: nothing gained');
      run.result(a, 'Philosopher', [`You chose the ${roleName(roleId)} ability.`], null);
    },
  },

  sailor: {
    spec: (c) => players('sailor', 'Sailor', 'Choose a player: either you or they are drunk until dusk.', 1, all(c)),
    resolve(run, a) {
      const [t] = target(a);
      if (!t) return;
      if (!run.sober(a.pid)) { run.outcome('impaired: no effect'); return; }
      let drunk = a.pid;
      if (t !== a.pid) {
        const coin = run.rng(`sailor:${a.pid}`).coin();
        drunk = run.review(`sailor:${a.pid}`, 'sailor', `Sailor ${run.name(a.pid)}: who is drunk?`,
          `Sailor chose ${run.name(t)}. Coin recommends ${coin ? 'the Sailor' : 'the chosen player'}.`,
          [{ id: a.pid, label: `${run.name(a.pid)} (Sailor)` }, { id: t, label: run.name(t) }], coin ? a.pid : t);
      }
      run.addEffect('drunk', 'sailor', a.pid, drunk, 'until_dusk');
      run.outcome(`${run.name(drunk)} is drunk until dusk`);
    },
  },

  innkeeper: {
    spec: (c) => players('innkeeper', 'Innkeeper', 'Choose 2 players: they can\'t die tonight, but 1 is drunk until dusk.', 2, all(c)),
    resolve(run, a) {
      const ts = target(a);
      if (ts.length !== 2) return;
      if (!run.sober(a.pid)) { run.outcome('impaired: no protection'); return; }
      for (const t of ts) run.addEffect('protected', 'innkeeper', a.pid, t, 'until_dusk');
      const def = run.rng(`innkeeper:${a.pid}`).pick(ts);
      const drunk = run.review(`innkeeper:${a.pid}`, 'innkeeper', `Innkeeper ${run.name(a.pid)}: who is drunk?`,
        `Protected: ${ts.map((t) => run.name(t)).join(' and ')}.`, ts.map((t) => ({ id: t, label: run.name(t) })), def);
      run.addEffect('drunk', 'innkeeper', a.pid, drunk, 'until_dusk');
      run.outcome(`${ts.map((t) => run.name(t)).join(' and ')} protected; ${run.name(drunk)} drunk until dusk`);
    },
  },

  gambler: {
    spec: (c) => ({
      key: 'gambler', roleId: 'gambler', title: 'Gambler', prompt: 'Choose a player and guess their character. If you guess wrong, you die.',
      fields: [
        { kind: 'player', label: 'Player', options: all(c).filter((x) => x !== c.pid) },
        { kind: 'role', label: 'Character', options: enabled(c.state) },
      ],
      distinct: false, allowDecline: false,
    }),
    resolve(run, a) {
      const [t, guess] = target(a);
      if (!t || !guess) return;
      const right = roleIdOf(run.w, t) === guess;
      run.outcome(`guessed ${run.name(t)} is ${roleName(guess)}: ${right ? 'right' : 'wrong'}`);
      if (!right) {
        if (run.sober(a.pid)) run.attemptKill(a.pid, 'self_gamble', a.pid);
        else run.outcome('impaired: does not die');
      }
    },
  },

  clockmaker: {
    resolve(run, a) {
      const ids = seatedIds(run.w);
      const demons = ids.filter((id) => run.regIsDemon(`clockmaker:${a.pid}`, id));
      const minions = ids.filter((id) => !demons.includes(id) && run.regIsMinion(`clockmaker:${a.pid}`, id));
      let truth = 0;
      if (demons.length && minions.length) {
        truth = Math.min(...demons.flatMap((d) => minions.map((m) => seatDistance(run.w, d, m))));
      }
      const max = Math.max(1, Math.floor(ids.length / 2));
      const fake = otherNumbers(run, `clockmaker:${a.pid}`, truth, 1, max);
      const fmt = (n: number) => [`The Demon is ${n} step${n === 1 ? '' : 's'} from its nearest Minion.`];
      run.result(a, 'Clockmaker', fmt(truth), fmt(fake), numberAlternatives(1, max, fmt));
    },
  },

  empath: {
    resolve(run, a) {
      const nb = aliveNeighbours(run.w, a.pid);
      const truth = nb.filter((x) => run.regAlignment(`empath:${a.pid}`, x) === 'evil').length;
      const fake = otherNumbers(run, `empath:${a.pid}`, truth, 0, 2);
      const fmt = (n: number) => [`${n} of your alive neighbours ${n === 1 ? 'is' : 'are'} evil.`];
      run.result(a, 'Empath', fmt(truth), fmt(fake), numberAlternatives(0, 2, fmt));
    },
  },

  fortune_teller: {
    spec: (c) => players('fortune_teller', 'Fortune Teller', 'Choose 2 players: you learn if either is a Demon.', 2, all(c)),
    resolve(run, a) {
      const ts = target(a);
      if (ts.length !== 2) return;
      const yes = ts.some((t) => t === run.w.setup.redHerringId || run.regIsDemon(`fortune_teller:${a.pid}`, t));
      const fmt = (v: boolean) => [`${ts.map((t) => run.name(t)).join(' and ')}: ${v ? 'Yes, one of them is a Demon.' : 'No, neither is a Demon.'}`];
      run.result(a, 'Fortune Teller', fmt(yes), fmt(!yes), [fmt(true), fmt(false)]);
    },
  },

  flowergirl: {
    resolve(run, a) {
      const voted = !!run.state.days[run.n]?.demonVoted;
      const fmt = (v: boolean) => [`${yesNo(v)}, a Demon ${v ? 'voted' : 'did not vote'} today.`];
      run.result(a, 'Flowergirl', fmt(voted), fmt(!voted), [fmt(true), fmt(false)]);
    },
  },

  seamstress: {
    wakes: (c) => !flag(c.w, c.pid, 'seamstress_used'),
    spec: (c) => players('seamstress', 'Seamstress', 'Once per game: choose 2 players (not yourself) to learn if they are the same alignment.', 2, all(c).filter((x) => x !== c.pid), true, 'Not tonight'),
    resolve(run, a) {
      const ts = target(a);
      if (ts.length !== 2) return;
      run.setFlag(a.pid, 'seamstress_used');
      const same = run.regAlignment(`seamstress:${a.pid}`, ts[0]) === run.regAlignment(`seamstress:${a.pid}`, ts[1]);
      const fmt = (v: boolean) => [`${run.name(ts[0])} and ${run.name(ts[1])} are ${v ? 'the same alignment' : 'different alignments'}.`];
      run.result(a, 'Seamstress', fmt(same), fmt(!same), [fmt(true), fmt(false)]);
    },
  },

  juggler: {
    wakes: (c) => c.night === 1,
    resolve(run, a) {
      const truth = run.state.days[1]?.jugglerCorrect ?? 0;
      const fake = otherNumbers(run, `juggler:${a.pid}`, truth, 0, 5);
      const fmt = (n: number) => [`You guessed ${n} correctly.`];
      run.result(a, 'Juggler', fmt(truth), fmt(fake), numberAlternatives(0, 5, fmt));
    },
  },

  balloonist: {
    resolve(run, a) {
      const typeOfReg = (id: string) => (isDemon(run.w, id) ? 'demon' : typeOf(run.w, id));
      const others = seatedIds(run.w).filter((x) => x !== a.pid);
      const shown = (rs<string[]>(run.w, a.pid, 'shownTypes') ?? []).slice();
      const fmt = (id: string) => [run.name(id)];
      if (!others.length) return;
      if (!run.sober(a.pid)) {
        const def = run.rng(`balloonist:${a.pid}`).pick(others);
        const pick = run.review(`balloonist:${a.pid}`, 'balloonist', `Balloonist ${run.name(a.pid)} (impaired): show which player?`,
          'Any player may be shown.', others.map((x) => ({ id: x, label: `${run.name(x)} (${typeOfReg(x)})` })), def);
        run.result(a, 'Balloonist', ['(impaired, no true information)'], fmt(pick));
        return;
      }
      const candidates = others.filter((x) => !shown.includes(typeOfReg(x) ?? ''));
      if (!candidates.length) {
        run.result(a, 'Balloonist', ['You learn nothing new.'], null);
        return;
      }
      const def = run.rng(`balloonist:${a.pid}`).pick(candidates);
      const pick = run.review(`balloonist:${a.pid}`, 'balloonist', `Balloonist ${run.name(a.pid)}: show which player?`,
        `Types already shown: ${shown.join(', ') || 'none'}.`, candidates.map((x) => ({ id: x, label: `${run.name(x)} (${typeOfReg(x)})` })), def);
      shown.push(typeOfReg(pick)!);
      run.setRs(a.pid, 'shownTypes', shown);
      run.result(a, 'Balloonist', fmt(pick), null);
    },
  },

  mathematician: {
    resolve(run, a) {
      const adj = run.night.mathAdjust;
      const set = new Set(run.abnormal.map((e) => e.playerId));
      for (const x of adj.add) set.add(x);
      for (const x of adj.remove) set.delete(x);
      const truth = set.size;
      const passive = new Set(['sailor', 'tea_lady', 'fool', 'mayor', 'goon', 'recluse']);
      const capN = seatedIds(run.w).filter((id) => {
        if (id === a.pid) return false;
        const r = roleIdOf(run.w, id);
        if (!r || r === 'drunk' || r === 'marionette') return false;
        return passive.has(r) || !!BEHAVIOURS[r]?.resolve;
      }).length;
      const fake = capN === 0 ? 0 : otherNumbers(run, `mathematician:${a.pid}`, truth, 0, capN);
      const fmt = (n: number) => [`${n} player${n === 1 ? '\'s ability' : 's\' abilities'} worked abnormally.`];
      run.result(a, 'Mathematician', fmt(truth), fmt(fake), numberAlternatives(0, Math.max(capN, truth), fmt));
    },
  },

  ravenkeeper: {
    actsWhileDead: true,
    resolve(run, a) {
      if (!a.choice) {
        run.awaitingRavenkeeper.push(a.pid);
        run.outcome('died tonight: waiting for the Ravenkeeper\'s choice');
        return;
      }
      const [t] = target(a);
      if (!t) return;
      const truth = run.regRole(`ravenkeeper:${a.pid}`, t);
      const opts = enabled(run.state).filter((r) => r !== truth);
      const fake = opts.length ? run.rng(`ravenkeeper:${a.pid}`).pick(opts) : truth;
      const fmt = (r: string) => [`${run.name(t)} is the ${roleName(r)}.`];
      run.result(a, 'Ravenkeeper', fmt(truth), fmt(fake));
    },
  },

  // ===================== Outsiders =====================
  butler: {
    spec: (c) => players('butler', 'Butler', 'Choose a player (not yourself): tomorrow you may only vote if they are voting too.', 1, all(c).filter((x) => x !== c.pid)),
    resolve(run, a) {
      const [t] = target(a);
      if (!t) return;
      if (run.sober(a.pid)) run.addEffect('butler_master', 'admin', a.pid, t, 'until_dusk');
      run.outcome(`master: ${run.name(t)}${run.sober(a.pid) ? '' : ' (no effect, impaired)'}`);
      run.result(a, 'Butler', [`Your master is ${run.name(t)}.`], null);
    },
  },

  moonchild: {
    actsWhileDead: true,
    wakes: (c) => !c.state.players.find((p) => p.id === c.pid)?.alive && !!c.state.days[c.night]?.moonchildTargetId && !rs(c.w, c.pid, 'moonchildUsed'),
    resolve(run, a) {
      const t = run.state.days[run.n]?.moonchildTargetId;
      if (!t) return;
      run.setRs(a.pid, 'moonchildUsed', true);
      const soberAtDeath = rs<boolean>(run.w, a.pid, 'soberAtDeath') !== false;
      run.outcome(`target ${run.name(t)}`);
      if (!soberAtDeath) { run.outcome('impaired at death: no effect'); return; }
      if (!isAlive(run.w, t)) { run.outcome('target already dead'); return; }
      if (run.regAlignment(`moonchild:${a.pid}`, t) === 'good') run.attemptKill(t, 'ability_kill', a.pid);
      else run.outcome('target is not good: nothing happens');
    },
  },

  // ===================== Minions =====================
  poisoner: {
    spec: (c) => players('poisoner', 'Poisoner', 'Choose a player: they are poisoned tonight and tomorrow day.', 1, all(c)),
    resolve(run, a) {
      const [t] = target(a);
      if (!t) return;
      if (!run.sober(a.pid)) { run.outcome('impaired: no effect'); return; }
      run.addEffect('poisoned', 'poisoner', a.pid, t, 'until_dusk');
      run.outcome(`${run.name(t)} is poisoned`);
    },
  },

  devils_advocate: {
    spec: (c) => {
      const last = rs<{ night: number; target: string }>(c.w, c.pid, 'lastTarget');
      const exclude = last && last.night === c.night - 1 ? last.target : null;
      return players('devils_advocate', 'Devil\'s Advocate', 'Choose a player (different to last night): if executed tomorrow, they don\'t die.', 1, all(c).filter((x) => x !== exclude));
    },
    resolve(run, a) {
      const [t] = target(a);
      if (!t) return;
      run.setRs(a.pid, 'lastTarget', { night: run.n, target: t });
      if (!run.sober(a.pid)) { run.outcome('impaired: no effect'); return; }
      run.addEffect('devils_advocate', 'admin', a.pid, t, 'until_dusk');
      run.outcome(`${run.name(t)} survives execution tomorrow`);
    },
  },

  mezepheles: {
    wakes: (c) => c.night >= 1 && !!c.state.days[c.night]?.mezephelesSayer && !c.w.setup.mezephelesSpent,
    resolve(run, a) {
      const t = run.state.days[run.n]?.mezephelesSayer;
      if (!t) return;
      run.w.setup.mezephelesSpent = true;
      if (!run.sober(a.pid)) { run.outcome('impaired: no conversion, word spent'); return; }
      const def = isAlive(run.w, t) && alignmentOf(run.w, t) === 'good' ? 'convert' : 'skip';
      const ch = run.review(`mezepheles:${a.pid}`, 'mezepheles', `Mezepheles: convert ${run.name(t)} to evil?`,
        `${run.name(t)} said the word.${isAlive(run.w, t) ? '' : ' They are dead.'}`,
        [{ id: 'convert', label: 'Convert to evil' }, { id: 'skip', label: 'Skip' }], def);
      if (ch !== 'convert') { run.outcome('conversion skipped'); return; }
      run.w.assignments[t].alignment = 'evil';
      run.notice(t, 'You are now evil.', ['Your character has not changed, but you are now on the evil team.']);
      run.outcome(`${run.name(t)} becomes evil`);
    },
  },

  assassin: {
    wakes: (c) => !flag(c.w, c.pid, 'assassin_used'),
    spec: (c) => players('assassin', 'Assassin', 'Once per game: choose a player. They die, even if for some reason they could not.', 1, all(c), true, 'Not tonight'),
    resolve(run, a) {
      const [t] = target(a);
      if (!t) return;
      run.setFlag(a.pid, 'assassin_used');
      if (!run.sober(a.pid)) { run.outcome('impaired: no death, use spent'); return; }
      run.attemptKill(t, 'assassin', a.pid);
    },
  },

  scarlet_woman: {},

  // ===================== Demons =====================
  imp: {
    spec: (c) => players('imp', 'Imp', 'Choose a player: they die. If you choose yourself, a Minion becomes the Imp.', 1, all(c)),
    resolve(run, a) {
      const [t] = target(a);
      if (!t) return;
      if (!run.sober(a.pid)) { run.outcome('impaired: no kill'); return; }
      if (t !== a.pid) { run.attemptKill(t, 'demon_attack', a.pid); return; }
      const died = run.attemptKill(a.pid, 'demon_attack', a.pid, { noScarlet: true });
      if (!died) return;
      const minions = aliveIds(run.w).filter((x) => typeOf(run.w, x) === 'minion');
      if (!minions.length) { run.outcome('starpass: no living Minion'); return; }
      const sw = minions.find((x) => roleIdOf(run.w, x) === 'scarlet_woman');
      const def = sw ?? run.rng(`starpass:${a.pid}`).pick(minions);
      const ch = run.review(`starpass:${a.pid}`, 'starpass', 'Starpass: which Minion becomes the Imp?',
        `${run.name(a.pid)} killed themselves.`,
        [...minions.map((m) => ({ id: m, label: `${run.name(m)} (${roleName(roleIdOf(run.w, m))})` })), { id: 'none', label: 'Nobody' }], def);
      if (ch === 'none') return;
      becomeDemon(run.w, ch, a.pid, (pid, title, lines) => run.notice(pid, title, lines));
      run.outcome(`${run.name(ch)} becomes the Imp`);
    },
  },

  pukka: {
    spec: (c) => players('pukka', 'Pukka', 'Choose a player: they are poisoned. The previously poisoned player dies.', 1, all(c)),
    resolve(run, a) {
      const prev = run.w.effects.find((e) => e.cause === 'pukka' && e.sourcePlayerId === a.pid);
      if (prev) {
        run.w.effects = run.w.effects.filter((e) => e !== prev);
        if (isAlive(run.w, prev.targetPlayerId)) run.attemptKill(prev.targetPlayerId, 'demon_attack', a.pid);
      }
      const [t] = target(a);
      if (!t) return;
      if (!run.sober(a.pid)) { run.outcome('impaired: no new poison'); return; }
      run.addEffect('poisoned', 'pukka', a.pid, t, 'until_source_acts_again');
      run.outcome(`${run.name(t)} is poisoned`);
    },
  },

  shabaloth: {
    spec: (c) => players('shabaloth', 'Shabaloth', 'Choose 2 players: they die.', 2, all(c)),
    resolve(run, a) {
      const ts = target(a);
      if (!run.sober(a.pid)) { run.outcome('impaired: no kills, no regurgitation'); return; }
      const list = run.w.setup.shabalothKills.filter((x) => findPlayer(run.w, x) && !isAlive(run.w, x));
      if (list.length) {
        const rng = run.rng(`shabaloth:${a.pid}`);
        const roll = rng.int(3) === 0;
        const def = roll ? rng.pick(list) : 'none';
        const ch = run.review(`shabaloth:${a.pid}`, 'shabaloth', 'Shabaloth: regurgitate a past victim?',
          `1-in-3 roll ${roll ? 'succeeded' : 'failed'}.`,
          [{ id: 'none', label: 'Nobody' }, ...list.map((x) => ({ id: x, label: run.name(x) }))], def);
        if (ch !== 'none') run.revive(ch, 'regurgitated by the Shabaloth');
      }
      for (const t of ts) {
        if (run.attemptKill(t, 'demon_attack', a.pid) && !run.w.setup.shabalothKills.includes(t)) run.w.setup.shabalothKills.push(t);
      }
    },
  },

  po: {
    spec: (c) => {
      const charged = !!rs<boolean>(c.w, c.pid, 'lastChoiceNone');
      const opts = all(c);
      if (charged) return players('po', 'Po', 'Your last choice was no-one: choose 3 players. They die.', Math.min(3, opts.length), opts);
      return players('po', 'Po', 'You may choose a player: they die. If you choose no-one, choose 3 players next night.', 1, opts, true, 'No one');
    },
    resolve(run, a) {
      const ts = target(a);
      run.setRs(a.pid, 'lastChoiceNone', ts.length === 0);
      if (!run.sober(a.pid)) { run.outcome('impaired: no kills'); return; }
      if (!ts.length) run.outcome('chose no one');
      for (const t of ts) run.attemptKill(t, 'demon_attack', a.pid);
    },
  },

  no_dashii: {
    spec: (c) => players('no_dashii', 'No Dashii', 'Choose a player: they die.', 1, all(c)),
    resolve(run, a) {
      const [t] = target(a);
      if (!t) return;
      if (!run.sober(a.pid)) { run.outcome('impaired: no kill'); return; }
      run.attemptKill(t, 'demon_attack', a.pid);
    },
  },

  vigormortis: {
    spec: (c) => players('vigormortis', 'Vigormortis', 'Choose a player: they die.', 1, all(c)),
    resolve(run, a) {
      const [t] = target(a);
      if (!t) return;
      if (!run.sober(a.pid)) { run.outcome('impaired: no kill'); return; }
      const died = run.attemptKill(t, 'demon_attack', a.pid);
      if (!died || typeOf(run.w, t) !== 'minion') return;
      run.w.assignments[t].retainsAbilityWhenDead = true;
      run.outcome(`${run.name(t)} (Minion) keeps their ability`);
      const tf = nearestAliveMatching(run.w, t, (p) => typeOf(run.w, p) === 'townsfolk');
      if (!tf.length) return;
      const def = run.rng(`vigormortis:${t}`).pick(tf);
      const ch = run.review(`vigormortis:${t}`, 'vigormortis', `Vigormortis: which Townsfolk neighbour of ${run.name(t)} is poisoned?`,
        'Lasts while the Vigormortis is alive and sober.', tf.map((x) => ({ id: x, label: run.name(x) })), def);
      run.addEffect('poisoned', 'vigormortis', a.pid, ch, 'while_source_alive_and_sober');
      run.outcome(`${run.name(ch)} is poisoned by the Vigormortis`);
    },
  },

  lil_monsta: {
    wakes: (c) => c.w.setup.lilMonstaTokenHolderId === c.pid,
    spec: (c) => ({
      key: 'lil_monsta', roleId: 'lil_monsta', title: 'Lil\' Monsta',
      prompt: 'You hold Lil\' Monsta\'s token. Choose a living Minion to babysit it next (yourself to keep it), and a player to die.',
      fields: [
        { kind: 'player', label: 'Pass the token to', options: alive(c).filter((x) => typeOf(c.w, x) === 'minion') },
        { kind: 'player', label: 'Victim', options: all(c) },
      ],
      distinct: false, allowDecline: false,
    }),
    resolve(run, a) {
      const [pass, victim] = target(a);
      if (!pass || !victim) return;
      if (!run.sober(a.pid)) { run.outcome('impaired: no kill, token stays'); return; }
      run.attemptKill(victim, 'demon_attack', a.pid);
      if (run.w.setup.lilMonstaTokenHolderId === a.pid && pass !== a.pid) {
        run.w.setup.lilMonstaTokenHolderId = pass;
        run.notice(pass, 'Lil\' Monsta', ['You hold Lil\' Monsta\'s token. You are the Demon.', ...demonInfoLines(run.w, pass)]);
        run.outcome(`token passes to ${run.name(pass)}`);
      }
    },
  },
};


// ===================== Roles added in schema v2 (design.md section 14) =====================
function godfatherDerived(state: GameState, night: number): boolean {
  if (night < 1) return false;
  return state.players.some((p) => !p.isAdmin && !p.alive && p.deadAt?.phase === 'day' && p.deadAt.number === night
    && ROLE_BY_ID[roleIdOf(state, p.id) ?? '']?.type === 'outsider');
}

/** Whether the Godfather may kill tonight: the Admin's choice if made, otherwise the rule. */
export function godfatherTriggered(state: GameState, night: number): boolean {
  const c = state.night?.reviewChoices['godfather_trigger'];
  if (c === 'yes') return night >= 1;
  if (c === 'no') return false;
  return godfatherDerived(state, night);
}

function grandmotherInfo(run: NightRun, a: Actor) {
  run.setRs(a.pid, 'grandmotherInfoPending', false);
  const others = seatedIds(run.w).filter((x) => x !== a.pid);
  if (!others.length) return;
  const fmt = (pid: string, r: string) => [`Your grandchild is ${run.name(pid)}, the ${roleName(r)}.`];
  if (!run.sober(a.pid)) {
    const rng = run.rng(`grandmother:${a.pid}`);
    run.setRs(a.pid, 'grandchildId', null);
    run.result(a, 'Grandmother', ['(impaired: no grandchild is recorded)'], fmt(rng.pick(others), rng.pick(enabled(run.state))));
    run.outcome('impaired: false grandchild, no link');
    return;
  }
  const goods = others.filter((x) => alignmentOf(run.w, x) === 'good');
  if (!goods.length) { run.result(a, 'Grandmother', ['There is no good player to be your grandchild.'], null); return; }
  const pool = goods.filter((x) => roleIdOf(run.w, x) !== 'drunk');
  const def = run.rng(`grandmother:${a.pid}`).pick(pool.length ? pool : goods);
  const ch = run.review(`grandmother:${a.pid}`, 'grandmother_grandchild', `Grandmother ${run.name(a.pid)}: who is the grandchild?`,
    'Any good player. She learns their actual character.', goods.map((x) => ({ id: x, label: `${run.name(x)} (${roleName(roleIdOf(run.w, x))})` })), def);
  run.setRs(a.pid, 'grandchildId', ch);
  run.outcome(`grandchild: ${run.name(ch)}`);
  run.result(a, 'Grandmother', fmt(ch, roleIdOf(run.w, ch) ?? ''), null);
}

const chose = (run: NightRun, a: Actor, title: string, t: string) => run.result(a, title, [`You chose ${run.name(t)}.`], null);

Object.assign(BEHAVIOURS, {
  oracle: {
    resolve(run: NightRun, a: Actor) {
      const dead = seatedIds(run.w).filter((x) => !isAlive(run.w, x));
      const truth = dead.filter((x) => run.regAlignment(`oracle:${a.pid}`, x) === 'evil').length;
      const fake = dead.length ? otherNumbers(run, `oracle:${a.pid}`, truth, 0, dead.length) : 0;
      const fmt = (n: number) => [`${n} dead player${n === 1 ? ' is' : 's are'} evil.`];
      run.result(a, 'Oracle', fmt(truth), fmt(fake), numberAlternatives(0, dead.length, fmt));
    },
  },

  gossip: {
    actsWhileDead: true,
    wakes: (c: SpecCtx) => c.night >= 1 && c.state.days[c.night]?.gossipStatement === 'true' && !!c.state.players.find((p) => p.id === c.pid)?.alive,
    resolve(run: NightRun, a: Actor) {
      run.outcome('statement was true');
      if (!run.sober(a.pid)) { run.outcome('impaired: no death'); return; }
      const alivePl = aliveIds(run.w);
      if (!alivePl.length) return;
      const pool = alivePl.filter((x) => x !== a.pid);
      const def = run.rng(`gossip:${a.pid}`).pick(pool.length ? pool : alivePl);
      const v = run.review(`gossip:${a.pid}`, 'gossip_victim', 'Gossip: who dies?', 'The Gossip\'s statement was true. Recommended at random.',
        alivePl.map((x) => ({ id: x, label: run.name(x) })), def);
      run.attemptKill(v, 'ability_kill', a.pid);
    },
  },

  grandmother: {
    resolve(run: NightRun, a: Actor) {
      if (run.n === 0 || rs<boolean>(run.w, a.pid, 'grandmotherInfoPending')) {
        grandmotherInfo(run, a);
        if (run.n === 0) return;
      }
      const gc = rs<string | null>(run.w, a.pid, 'grandchildId');
      if (!gc || run.deathCause[gc] !== 'demon_attack' || !isAlive(run.w, a.pid)) return;
      if (!run.sober(a.pid)) {
        run.abnormalIfExternal(a.pid, 'Grandmother link failed');
        run.outcome('grandchild killed by the Demon, but the Grandmother is impaired');
        return;
      }
      const ch = run.review(`grandmother_link:${a.pid}`, 'grandmother_link', `Grandmother ${run.name(a.pid)} dies too?`,
        `${run.name(gc)} (her grandchild) was killed by the Demon.`, [{ id: 'yes', label: 'Yes, she dies too' }, { id: 'no', label: 'No' }], 'yes');
      if (ch === 'yes') run.attemptKill(a.pid, 'grandchild_link', null);
    },
  },

  huntsman: {
    wakes: (c: SpecCtx) => !flag(c.w, c.pid, 'huntsman_used'),
    spec: (c: SpecCtx) => players('huntsman', 'Huntsman', 'Once per game: choose a player. The Damsel, if chosen, becomes a not-in-play Townsfolk.', 1, all(c), true, 'Not tonight'),
    resolve(run: NightRun, a: Actor) {
      const [t] = target(a);
      if (!t) return;
      run.setFlag(a.pid, 'huntsman_used');
      chose(run, a, 'Huntsman', t);
      if (!run.sober(a.pid)) { run.outcome('impaired: no effect, use spent'); return; }
      if (roleIdOf(run.w, t) !== 'damsel') { run.outcome(`${run.name(t)} is not the Damsel: nothing happens`); return; }
      const inPlay = new Set(seatedIds(run.w).flatMap((x) => [roleIdOf(run.w, x), run.w.assignments[x]?.believedRoleId]).filter(Boolean));
      const cands = enabled(run.state).filter((r) => ROLE_BY_ID[r].type === 'townsfolk' && !inPlay.has(r));
      if (!cands.length) { run.outcome('WARNING: no Townsfolk left out of play, the Damsel stays the Damsel'); return; }
      const def = run.rng(`huntsman:${a.pid}`).pick(cands);
      const nr = run.review(`huntsman:${a.pid}`, 'huntsman_new_role', `Huntsman found the Damsel (${run.name(t)}): she becomes…`,
        'A Townsfolk not in play. Her new ability works from the next night.', cands.map((r) => ({ id: r, label: roleName(r) })), def);
      const as = run.w.assignments[t];
      as.history.push({ at: Date.now(), from: as.roleId, to: nr, reason: 'Huntsman found the Damsel' });
      as.roleId = nr;
      as.believedRoleId = null;
      as.alignment = 'good';
      run.noActTonight.add(t);
      if (nr === 'grandmother') run.setRs(t, 'grandmotherInfoPending', true);
      run.notice(t, `Your role is now ${roleName(nr)}`, [ROLE_BY_ID[nr].abilityText]);
      run.outcome(`the Damsel (${run.name(t)}) becomes the ${roleName(nr)}`);
    },
  },

  professor: {
    wakes: (c: SpecCtx) => c.night >= 1 && !flag(c.w, c.pid, 'professor_used'),
    spec: (c: SpecCtx) => players('professor', 'Professor', 'Once per game: choose a dead player. If they are a Townsfolk, they are resurrected.', 1,
      seatedIds(c.state).filter((x) => !c.state.players.find((p) => p.id === x)?.alive), true, 'Not tonight'),
    resolve(run: NightRun, a: Actor) {
      const [t] = target(a);
      if (!t) return;
      run.setFlag(a.pid, 'professor_used');
      chose(run, a, 'Professor', t);
      if (!run.sober(a.pid)) { run.outcome('impaired: nothing happens, use spent'); return; }
      const wasDead = !run.state.players.find((p) => p.id === t)?.alive;
      if (!wasDead || isAlive(run.w, t)) { run.outcome(`${run.name(t)} is not dead: nothing happens`); return; }
      if (typeOf(run.w, t) !== 'townsfolk') { run.outcome(`${run.name(t)} is not a Townsfolk: nothing happens`); return; }
      run.revive(t, 'resurrected by the Professor');
    },
  },

  godfather: {
    actsWhileDead: false,
    wakes: (c: SpecCtx) => c.night === 0 || godfatherTriggered(c.state, c.night),
    spec: (c: SpecCtx) => (c.night === 0 ? null : players('godfather', 'Godfather', 'An Outsider died today: choose a player. They die.', 1, all(c))),
    resolve(run: NightRun, a: Actor) {
      if (run.n === 0) {
        const outs = seatedIds(run.w).filter((x) => typeOf(run.w, x) === 'outsider');
        const listed = outs.filter((x) => {
          if (roleIdOf(run.w, x) !== 'recluse') return true;
          return run.review(`godfather_recluse:${a.pid}:${x}`, 'godfather_recluse', `Godfather: list the Recluse (${run.name(x)})?`,
            'The Recluse might not register as an Outsider.', [{ id: 'list', label: 'List it' }, { id: 'hide', label: 'Hide it' }], 'list') === 'list';
        }).map((x) => roleIdOf(run.w, x)!);
        const fmt = (rs2: string[]) => [rs2.length ? `Outsiders in play: ${rs2.map(roleName).join(', ')}` : 'No Outsiders in play.'];
        const inPlay = new Set(seatedIds(run.w).map((x) => roleIdOf(run.w, x)));
        const spare = enabled(run.state).filter((r) => ROLE_BY_ID[r].type === 'outsider' && !inPlay.has(r));
        const rng = run.rng(`godfather:${a.pid}`);
        let fake = listed.slice();
        if (spare.length) {
          if (fake.length) fake[rng.int(fake.length)] = rng.pick(spare);
          else fake = [rng.pick(spare)];
        }
        run.result(a, 'Godfather', fmt(listed), fmt(fake));
        return;
      }
      const [t] = target(a);
      if (!t) return;
      if (!run.sober(a.pid)) { run.outcome('impaired: no kill'); return; }
      run.attemptKill(t, 'ability_kill', a.pid);
    },
  },

  witch: {
    wakes: (c: SpecCtx) => aliveIds(c.state).length >= 4,
    spec: (c: SpecCtx) => players('witch', 'Witch', 'Choose a player: if they nominate tomorrow, they die.', 1, all(c)),
    resolve(run: NightRun, a: Actor) {
      const [t] = target(a);
      if (!t) return;
      chose(run, a, 'Witch', t);
      if (aliveIds(run.w).length <= 3) { run.outcome('3 or fewer players alive: the Witch has no ability'); return; }
      if (!run.sober(a.pid)) { run.outcome('impaired: no curse'); return; }
      run.addEffect('witched', 'witch', a.pid, t, 'until_dusk');
      run.outcome(`${run.name(t)} is cursed: dies if they nominate tomorrow`);
    },
  },
} satisfies Record<string, RoleBehaviour>);

export function hasNightAbility(roleId: string): boolean {
  const b = BEHAVIOURS[roleId];
  return !!b && !!b.resolve;
}

export { nameOf };
