// Driving an autoplay game: the steward's commands, the players' and the server's own steps.
import type { Choice, Command, PlayerId, RoleId } from '@ct/protocol';
import { autopilotStep, defaultScript, findRole, resolveNight, stewardView } from '../../src';
import { notInAutoplay } from '../../src/abilities/define';
import type { Rng } from '../../src/util/rng';
import { randomActions, seatedIds } from './fuzz';
import { begin, cast, pid, ST, TestGame, type Cast } from './game';

/** Every role autoplay can use. */
export const autoScript = (): RoleId[] =>
  defaultScript().filter((id) => {
    const def = findRole(id);
    return def && !notInAutoplay(def);
  });

export class AutoGame extends TestGame {
  steward: PlayerId = pid('n0');

  sw(command: Command) {
    return this.as(this.steward, command);
  }

  console() {
    return stewardView(this.state, this.state.stewardId as PlayerId, { now: this.now });
  }

  get ids() {
    return seatedIds(this.state);
  }

  /** What the server does after every command. */
  autopilot() {
    for (let step = autopilotStep(this.state); step; step = autopilotStep(this.state)) this.as(null, step);
    return this;
  }

  wait(seconds: number) {
    this.now += seconds * 1000;
    return this;
  }

  submitAll(rng: Rng) {
    for (const id of this.ids) {
      this.as(id, { type: 'submit_night', actions: randomActions(this.state, id, rng) }).autopilot();
    }
    return this;
  }

  open() {
    return resolveNight(this.state).questions.filter((q) => !q.answered);
  }

  answerAll(rng: Rng) {
    for (let open = this.open(); open.length; open = this.open()) {
      for (const q of open) {
        const spec = q.spec;
        const values = spec.fields.map((f) => (f.options.length ? rng.pick(f.options) : ''));
        const choice: Choice = spec.allowDecline && rng.coin() ? { decline: true, values: [] } : { values };
        const res = this.tryAs(q.playerId, { type: 'answer_question', key: q.key, choice });
        // Three different players, say. Try again with other values.
        if (!res.ok && res.internal) throw res.cause;
      }
    }
    return this.autopilot();
  }

  /** A whole night with random choices, up to the dawn. */
  night(rng: Rng) {
    if (this.console().phase.stage === 'briefing') this.sw({ type: 'open_night' });
    this.submitAll(rng).answerAll(rng).wait(31);
    return this.sw({ type: 'call_dawn' });
  }
}

/** A lobby of these many players in autoplay, in setup and seated, with this script. */
export function table(count: number, script: readonly RoleId[] = autoScript(), seed = 1): AutoGame {
  const g = new AutoGame('A');
  g.seed = seed;
  for (let i = 0; i < count; i++) {
    g.as(null, { type: 'join', id: pid(`N${i}`), name: `N${i}`, rolePreference: 'none', wantsStoryteller: i === 0 });
  }
  g.sw({ type: 'choose_autoplay' }).sw({ type: 'steward_script', roleIds: [...script] });
  return g.sw({ type: 'steward_open_setup' }) as AutoGame;
}

/**
 * A game with these characters, set up by a Storyteller and then made an autoplay one, its first night open. For tests
 * of what autoplay does with a game whose characters the test has to choose.
 */
export function autoCast(
  chars: Cast,
  o: { setup?: (g: TestGame) => void; open?: (g: TestGame) => void } = {},
): AutoGame {
  const st = cast(chars);
  o.setup?.(st);
  begin(st);
  o.open?.(st);
  const g = new AutoGame('A');
  g.now = st.now;
  g.seed = st.seed;
  g.steward = pid(Object.keys(chars)[0] as string);
  const players = new Map(st.state.players);
  players.delete(ST);
  g.state = {
    ...st.state,
    players,
    storytellerId: null,
    stewardId: g.steward,
    autoplay: {
      idSeq: 1,
      dropped: [],
      nominations: [],
      record: [],
      lastNight: [],
      dayClosed: false,
      closedAt: null,
      away: [],
      awayTonight: [],
      demonDead: false,
      over: null,
      offered: null,
      handedTo: null,
    },
  };
  return g;
}
