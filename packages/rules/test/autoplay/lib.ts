// Short scenes of an autoplay game with chosen characters.
import { roleId, type PlayerId, type RoleId } from '@ct/protocol';
import { actionSpecs } from '../../src';
import { autoCast, type AutoGame } from '../helpers/autoplay';
import { pid, type TestGame } from '../helpers/game';
import { MINION, TOWN, OUT } from '../helpers/plain';

const PLAIN: Record<string, RoleId> = {
  t1: TOWN[0] as RoleId,
  t2: TOWN[1] as RoleId,
  t3: TOWN[2] as RoleId,
  t4: TOWN[3] as RoleId,
  o1: OUT[0] as RoleId,
  m1: MINION[0] as RoleId,
};
const role = (x: string) => PLAIN[x] ?? roleId(x);
/** A player's id from their name; anything else (a role, an option) as it is. */
const value = (g: AutoGame, x: string) => (/^[a-z0-9]{1,8}$/.test(x) && g.state.players.has(pid(x)) ? pid(x) : x);

export class Scene {
  constructor(readonly g: AutoGame) {}

  /** Everyone presses done. Whoever is not named declines, or chooses themselves away. */
  done(choices: Record<string, string[]> = {}) {
    for (const id of this.g.ids) {
      const name = Object.keys(choices).find((x) => pid(x) === id);
      const actions = Object.fromEntries(
        actionSpecs(this.g.state, id).map((spec) => {
          const values = name ? (choices[name] as string[]).map((x) => value(this.g, x)) : [];
          return [spec.key, values.length ? { values } : { decline: true, values: [] }];
        }),
      );
      const res = this.g.tryAs(id, { type: 'submit_night', actions });
      if (!res.ok && name) throw new Error(`${name}: ${res.error}`);
      if (!res.ok) {
        // A choice that must be made, which nothing here depends on: they are away tonight.
        this.g.sw({ type: 'set_away', playerId: id, away: true });
      }
      this.g.autopilot();
    }
    this.g.autopilot();
    for (const id of this.g.state.autoplay?.away ?? []) this.g.sw({ type: 'set_away', playerId: id, away: false });
    return this;
  }

  /** A night, and the dawn after it. */
  night(choices: Record<string, string[]> = {}, answers: Record<string, string[]> = {}) {
    this.done(choices);
    for (const q of this.g.open()) {
      const name = Object.keys(answers).find((x) => pid(x) === q.playerId);
      const values = (name ? (answers[name] as string[]) : []).map((x) => value(this.g, x));
      const choice = values.length ? { values } : { decline: true, values: [] };
      this.g.as(q.playerId, { type: 'answer_question', key: q.key, choice });
    }
    this.g.wait(31).sw({ type: 'call_dawn' });
    return this;
  }

  execute(name: string | null, yes: string[] = []) {
    this.g.sw({ type: 'execute', playerId: name ? pid(name) : null, yes: yes.map((x) => roleId(x)) });
    return this;
  }

  dusk(name: string | null = null) {
    this.execute(name);
    if (!this.over) this.g.sw({ type: 'begin_night' });
    return this;
  }

  nominate(nominator: string, nominee: string) {
    this.g.sw({ type: 'nominate', nominator: pid(nominator), nominee: pid(nominee) });
    return this;
  }

  vote(...voters: string[]) {
    const last = this.g.console().day?.nominations.at(-1);
    this.g.sw({ type: 'count_vote', id: last?.id ?? 0, voters: voters.map(pid) });
    return this;
  }

  claim(id: string, claim: string, ...who: string[]) {
    this.g.sw({ type: 'make_claim', roleId: roleId(id), claim, values: who.map(pid) });
    return this.tell;
  }

  get tell() {
    return this.g.console().tell;
  }

  /** 'good', 'evil' or undefined. */
  get over() {
    return this.g.console().over?.winner;
  }

  alive(name: string) {
    return this.g.player(pid(name)).life.alive;
  }

  inbox(name: string) {
    return this.g.view(pid(name) as PlayerId).me.messages.flatMap((m) => [m.title, ...m.lines]);
  }
}

export function auto(
  chars: Record<string, string>,
  o: { setup?: (g: TestGame) => void; open?: (g: TestGame) => void } = {},
): Scene {
  return new Scene(autoCast(Object.fromEntries(Object.entries(chars).map(([n, r]) => [n, role(r)])), o));
}

export const drunk = (name: string) => ({
  open: (g: TestGame) => void g.st({ type: 'add_condition', target: pid(name), condition: 'drunk' }),
});
