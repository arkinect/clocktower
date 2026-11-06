// The Al-Hadikhia (design.md section 14.7) and its jinxes (14.8).
import { describe, expect, it } from 'vitest';
import { act, alive, build, nextNight, resolve, resultFor, runNight, submit, tryAct, type TestGame } from './helpers';
import { actionSpecs, wakingRoles } from '../src/engine/actions';
import { expectedActors } from '../src/engine/game';
import { bluffCandidates, enabledRoles } from '../src/engine/setup';
import { playerView } from '../src/engine/views';

/** Seats: Al-Hadikhia, Poisoner, Empath, Gambler, Butler, Seamstress, Virgin. */
const ROLES = ['al_hadikhia', 'poisoner', 'empath', 'gambler', 'butler', 'seamstress', 'virgin'];

function night1(roles = ROLES, day?: (g: TestGame) => void): TestGame {
  const g = build(roles);
  runNight(g, {});
  day?.(g);
  nextNight(g);
  return g;
}

const key = (g: TestGame, pid: string, ah = g.p.al_hadikhia) => `al_hadikhia:${ah}:${pid}`;
const open = (g: TestGame) => g.s.night!.resolution!.followUps.filter((f) => !f.answered).map((f) => f.key);
const answer = (g: TestGame, pid: string, c: 'live' | 'die', ah = g.p.al_hadikhia) =>
  act(g, { type: 'answer_follow_up', key: key(g, pid, ah), choice: { values: [c] } }, pid);
const row = (g: TestGame, ah = g.p.al_hadikhia) => g.s.night!.resolution!.actors.find((a) => a.playerId === ah && a.roleId === 'al_hadikhia')!;
const worldAlive = (g: TestGame, pid: string) => g.s.night!.resolution!.after.players.find((p) => p.id === pid)!.alive;
const three = (g: TestGame) => [g.p.empath, g.p.gambler, g.p.butler];
const nameOf = (g: TestGame, pid: string) => g.s.players.find((p) => p.id === pid)!.name;
/** What each of the three is asked: only the picks up to and including them, in pick order. */
const expectedPrompts = (g: TestGame) => {
  const [a, b] = three(g).map((t) => nameOf(g, t));
  return ['you', `${a}, then you`, `${a}, ${b}, then you`].map((x) => `The Al-Hadikhia chose ${x}. Do you choose to live or die?`);
};
const titles = (g: TestGame, pid: string) => (g.s.messages[pid] ?? []).map((m) => m.title);

/** The Al-Hadikhia chooses `ts`; the night is resolved, nobody has answered. */
function chose(g: TestGame, ts: string[], ah = g.p.al_hadikhia) {
  submit(g, { [ah]: { al_hadikhia: ts } });
  resolve(g);
}

describe('Al-Hadikhia', () => {
  it('a game whose script lacks them never offers them', () => {
    const g = build(['imp', 'poisoner', 'empath', 'gambler', 'butler', 'seamstress', 'virgin'], (g) => {
      act(g, { type: 'set_role_enabled', roleId: 'al_hadikhia', enabled: false });
    });
    expect(enabledRoles(g.s)).not.toContain('al_hadikhia');
    expect(bluffCandidates(g.s)).not.toContain('al_hadikhia');
    runNight(g, {});
    nextNight(g);
    expect(actionSpecs(g.s, g.p.gambler)[0].fields[1].options).not.toContain('al_hadikhia');
    expect(tryAct(g, { type: 'assign_role', playerId: g.p.empath, roleId: 'al_hadikhia' }).ok).toBe(false);
  });

  it('nothing on night 0; then three distinct fields of any seated player, dead and self included, or "No one"', () => {
    const g = build(ROLES);
    expect(wakingRoles(g.s, g.p.al_hadikhia)).toEqual([]);
    runNight(g, {});
    act(g, { type: 'record_execution', playerId: g.p.virgin, died: true });
    nextNight(g);
    const [spec] = actionSpecs(g.s, g.p.al_hadikhia);
    expect(spec).toMatchObject({ key: 'al_hadikhia', title: 'Al-Hadikhia', distinct: true, allowDecline: true, declineLabel: 'No one' });
    expect(spec.fields).toHaveLength(3);
    for (const f of spec.fields) expect(f.options).toEqual(g.ids);
    const pick = (values: string[]) => tryAct(g, { type: 'submit_night', actions: { al_hadikhia: { values } } }, g.p.al_hadikhia);
    expect(pick([g.p.empath, g.p.empath, g.p.butler]).ok).toBe(false);
    expect(pick([g.p.al_hadikhia, g.p.virgin, g.p.butler]).ok).toBe(true);
  });

  it('declining: nothing happens and nothing is announced', () => {
    const g = night1();
    submit(g, { [g.p.al_hadikhia]: { al_hadikhia: 'decline' } });
    const res = resolve(g);
    expect(res.followUps).toEqual([]);
    expect(res.notices).toEqual([]);
    expect(row(g).outcome).toBe('chose no one: nothing happens');
  });

  it('asks each chosen player in order, Live or Die, and the actor row keeps the three names', () => {
    const g = night1();
    chose(g, three(g));
    const qs = g.s.night!.resolution!.followUps;
    expect(qs.map((q) => q.key)).toEqual(three(g).map((t) => key(g, t)));
    expect(qs.map((q) => q.playerId)).toEqual(three(g));
    expect(qs.map((q) => q.spec.prompt)).toEqual(expectedPrompts(g));
    expect(qs[0].spec.fields).toEqual([{ kind: 'option', label: 'Your choice', options: ['live', 'die'], labels: { live: 'Live', die: 'Die' } }]);
    expect(qs[0].spec.allowDecline).toBe(false);
    const before = row(g).input;
    answer(g, g.p.empath, 'live');
    expect(row(g).input).toBe(before);
    expect(before).toContain('P2-empath');
  });

  it('the dawn notice still names all three, in pick order', () => {
    const g = night1();
    chose(g, three(g));
    const [a, b, c] = three(g).map((t) => nameOf(g, t));
    expect(g.s.night!.resolution!.notices.find((n) => n.playerId === g.p.virgin)!.lines).toEqual([`The Al-Hadikhia chose ${a}, ${b} and ${c}.`]);
  });

  it('"Accept all defaults" answers nothing, and publishing waits unless forced', () => {
    const g = night1();
    chose(g, three(g));
    act(g, { type: 'accept_all_defaults' });
    expect(open(g)).toHaveLength(3);
    expect(tryAct(g, { type: 'publish_night' }).ok).toBe(false);
    for (const t of three(g)) answer(g, t, 'die');
    expect(open(g)).toEqual([]);
    act(g, { type: 'publish_night' });
    expect(g.s.phase).toBe('DAY');
  });

  it('die: they die, as a Demon attack', () => {
    const g = night1();
    chose(g, three(g));
    answer(g, g.p.empath, 'die');
    answer(g, g.p.gambler, 'live');
    answer(g, g.p.butler, 'live');
    const res = g.s.night!.resolution!;
    expect(res.deaths).toEqual([g.p.empath]);
    expect(res.after.players.find((p) => p.id === g.p.empath)).toMatchObject({ alive: false, deathCause: 'demon_attack' });
  });

  it('live revives a dead player, who acts in their slots later that night', () => {
    const g = night1(ROLES, (g) => { act(g, { type: 'record_execution', playerId: g.p.empath, died: true }); });
    chose(g, three(g));
    answer(g, g.p.empath, 'live');
    answer(g, g.p.gambler, 'die');
    answer(g, g.p.butler, 'live');
    expect(g.s.night!.resolution!.revived).toEqual([g.p.empath]);
    expect(resultFor(g.s.night!.resolution!, g.p.empath, 'empath')).toBeDefined();
    expect(worldAlive(g, g.p.empath)).toBe(true);
    act(g, { type: 'publish_night' });
    expect(alive(g, g.p.empath)).toBe(true);
    expect(titles(g, g.p.empath)).toContain('You are alive again');
  });

  it('all three alive afterwards: all three die, a revived player too, who is not told they are alive', () => {
    const g = night1(ROLES, (g) => { act(g, { type: 'record_execution', playerId: g.p.empath, died: true }); });
    chose(g, three(g));
    for (const t of three(g)) answer(g, t, 'live');
    expect(g.s.night!.resolution!.deaths).toEqual(three(g));
    expect(row(g).outcome).toContain('all three are alive: all three die');
    act(g, { type: 'publish_night' });
    for (const t of three(g)) expect(alive(g, t)).toBe(false);
    expect(titles(g, g.p.empath)).not.toContain('You are alive again');
  });

  it('a Tea Lady-protected "die" counts as alive: the others die, and she still protects them', () => {
    const g = night1(['al_hadikhia', 'poisoner', 'empath', 'tea_lady', 'butler', 'seamstress', 'virgin']);
    const ts = [g.p.empath, g.p.seamstress, g.p.virgin];
    chose(g, ts);
    answer(g, g.p.empath, 'die');
    answer(g, g.p.seamstress, 'live');
    answer(g, g.p.virgin, 'live');
    expect(g.s.night!.resolution!.deaths).toEqual([g.p.seamstress, g.p.virgin]);
    expect(worldAlive(g, g.p.empath)).toBe(true);
    expect(row(g).outcome).toContain('all three are alive: all three die');
  });

  it('impaired: questions still asked, no effect, and the review says so', () => {
    const g = night1(ROLES, (g) => { act(g, { type: 'record_execution', playerId: g.p.virgin, died: true }); });
    submit(g, { [g.p.poisoner]: { poisoner: [g.p.al_hadikhia] } });
    chose(g, [g.p.empath, g.p.gambler, g.p.virgin]);
    expect(open(g)).toHaveLength(3);
    answer(g, g.p.empath, 'die');
    answer(g, g.p.gambler, 'live');
    answer(g, g.p.virgin, 'live');
    const res = g.s.night!.resolution!;
    expect(res.deaths).toEqual([]);
    expect(res.revived).toEqual([]);
    expect(row(g)).toMatchObject({ impaired: true });
    expect(row(g).outcome).toContain('impaired: questions asked, the answers have no effect');
    expect(res.notices.filter((n) => n.title === 'Al-Hadikhia')).toHaveLength(7);
  });

  it('reopening collecting clears the answers', () => {
    const g = night1();
    chose(g, three(g));
    answer(g, g.p.empath, 'die');
    act(g, { type: 'reopen_collecting' });
    expect(g.s.night!.followUpAnswers).toEqual({});
    act(g, { type: 'resolve_night', force: true });
    expect(open(g)).toHaveLength(3);
    expect(g.s.night!.resolution!.deaths).toEqual([]);
  });

  it('a forced publish with a missing answer: no effect for that player, and no "if all live, all die"', () => {
    const g = night1();
    chose(g, three(g));
    answer(g, g.p.empath, 'live');
    answer(g, g.p.gambler, 'live');
    expect(row(g).outcome).toContain(`${'P4-butler'} has not answered: no effect for them`);
    expect(row(g).outcome).toContain('needs all three answers');
    act(g, { type: 'publish_night', force: true });
    for (const t of three(g)) expect(alive(g, t)).toBe(true);
  });

  it('dead players are asked and answer, and the Storyteller can answer for them', () => {
    const g = night1(ROLES, (g) => { act(g, { type: 'record_execution', playerId: g.p.empath, died: true }); });
    chose(g, three(g));
    expect(playerView(g.s, g.p.empath, 0).me.followUps).toHaveLength(1);
    answer(g, g.p.empath, 'die');
    act(g, { type: 'answer_follow_up_for', key: key(g, g.p.gambler), choice: { values: ['live'] } });
    expect(g.s.night!.followUpAnswers[key(g, g.p.gambler)]).toMatchObject({ byAdmin: true });
    expect(open(g)).toEqual([key(g, g.p.butler)]);
  });

  it('dawn notice to every seated player, not before publishing, even if nobody answered', () => {
    const g = night1();
    chose(g, three(g));
    expect(titles(g, g.p.seamstress)).not.toContain('Al-Hadikhia');
    act(g, { type: 'publish_night', force: true });
    for (const id of g.ids) {
      expect(g.s.messages[id].find((m) => m.title === 'Al-Hadikhia')).toMatchObject({ lines: ['The Al-Hadikhia chose P2-empath, P3-gambler and P4-butler.'] });
    }
  });

  it('Live/Die reaches only the asked player, and nobody else can answer or see an answer', () => {
    const g = night1();
    chose(g, three(g));
    const view = (id: string) => playerView(g.s, id, 0);
    expect(view(g.p.empath).me.followUps!.map((f) => f.key)).toEqual([key(g, g.p.empath)]);
    expect(view(g.p.seamstress).me.followUps).toEqual([]);
    expect(view(g.p.al_hadikhia).me.followUps).toEqual([]);
    expect(tryAct(g, { type: 'answer_follow_up', key: key(g, g.p.empath), choice: { values: ['die'] } }, g.p.gambler).ok).toBe(false);
    answer(g, g.p.empath, 'die');
    for (const id of [g.p.al_hadikhia, g.p.seamstress]) expect(JSON.stringify(view(id))).not.toMatch(/followUpAnswers|"die"/);
    expect(tryAct(g, { type: 'answer_follow_up', key: key(g, g.p.empath), choice: { values: ['live'] } }, g.p.empath).ok).toBe(false);
  });
});

describe('jinxes', () => {
  /** Seats: Al-Hadikhia, Scarlet Woman, Empath, Gambler, Butler, Seamstress, Virgin. The Al-Hadikhia executed on day 1; she takes over. */
  const SW = ['al_hadikhia', 'scarlet_woman', 'empath', 'gambler', 'butler', 'seamstress', 'virgin'];
  function swIsDemon(g: TestGame) {
    act(g, { type: 'record_execution', playerId: g.p.al_hadikhia, died: true });
    act(g, { type: 'resolve_day_prompt', id: g.s.dayPrompts[0].id, accept: true });
    expect(g.s.assignments[g.p.scarlet_woman].roleId).toBe('al_hadikhia');
  }

  it('Jinx (Scarlet Woman & Al-Hadikhia): the old Al-Hadikhia chooses to live: she is the Scarlet Woman again, told, with a review line', () => {
    const g = night1(SW, swIsDemon);
    const me = g.p.scarlet_woman;
    chose(g, [g.p.al_hadikhia, g.p.empath, g.p.gambler], me);
    answer(g, g.p.al_hadikhia, 'live', me);
    const res = g.s.night!.resolution!;
    expect(res.after.assignments[me]).toMatchObject({ roleId: 'scarlet_woman', alignment: 'evil' });
    expect(res.after.assignments[me].history.at(-1)).toMatchObject({ from: 'al_hadikhia', to: 'scarlet_woman' });
    expect(res.after.assignments[g.p.al_hadikhia].roleId).toBe('al_hadikhia');
    expect(row(g, me).outcome).toContain('Jinx (Scarlet Woman & Al-Hadikhia): P1-scarlet_woman is the Scarlet Woman again');
    expect(res.notices.find((n) => n.playerId === me && n.title.startsWith('Jinx'))).toMatchObject({
      title: 'Jinx (Scarlet Woman & Al-Hadikhia): You are the Scarlet Woman again',
      lines: [expect.stringMatching(/^If there are 5 or more players alive/)],
    });
    act(g, { type: 'publish_night', force: true });
    expect(g.s.assignments[me].roleId).toBe('scarlet_woman');
    expect(titles(g, me)).toContain('Jinx (Scarlet Woman & Al-Hadikhia): You are the Scarlet Woman again');
  });

  it('Jinx (Scarlet Woman & Al-Hadikhia): reviving someone else changes nothing', () => {
    const g = night1(SW, (g) => { act(g, { type: 'record_execution', playerId: g.p.empath, died: true }); swIsDemon(g); });
    const me = g.p.scarlet_woman;
    chose(g, [g.p.empath, g.p.gambler, g.p.butler], me);
    answer(g, g.p.empath, 'live', me);
    expect(g.s.night!.resolution!.after.assignments[me].roleId).toBe('al_hadikhia');
  });

  it('Jinx (Scarlet Woman & Al-Hadikhia): the Storyteller marking the old Al-Hadikhia alive by day does it too', () => {
    const g = build(SW);
    runNight(g, {});
    swIsDemon(g);
    act(g, { type: 'mark_alive', playerId: g.p.al_hadikhia, alive: true });
    expect(g.s.assignments[g.p.scarlet_woman].roleId).toBe('scarlet_woman');
    expect(titles(g, g.p.scarlet_woman)).toContain('Jinx (Scarlet Woman & Al-Hadikhia): You are the Scarlet Woman again');
  });

  /** Seats: Al-Hadikhia, Mastermind, Poisoner, Empath, Gambler, Butler, Seamstress. The Al-Hadikhia executed on day 1. */
  const MM = ['al_hadikhia', 'mastermind', 'poisoner', 'empath', 'gambler', 'butler', 'seamstress'];
  const executed = (g: TestGame) => { act(g, { type: 'record_execution', playerId: g.p.al_hadikhia, died: true }); };

  it('Jinx (Al-Hadikhia & Mastermind): the dead Al-Hadikhia wakes with a picker of good players only, and is waited for', () => {
    const g = night1(MM, executed);
    expect(wakingRoles(g.s, g.p.al_hadikhia)).toEqual(['al_hadikhia']);
    expect(expectedActors(g.s)).toContain(g.p.al_hadikhia);
    const [spec] = actionSpecs(g.s, g.p.al_hadikhia);
    expect(spec.prompt).toMatch(/^Jinx \(Al-Hadikhia & Mastermind\): /);
    expect(spec.allowDecline).toBe(false);
    expect(spec.fields).toHaveLength(3);
    for (const f of spec.fields) expect(f.options).toEqual([g.p.empath, g.p.gambler, g.p.butler, g.p.seamstress]);
    expect(tryAct(g, { type: 'submit_night', actions: { al_hadikhia: { values: [g.p.poisoner, g.p.empath, g.p.gambler] } } }, g.p.al_hadikhia).ok).toBe(false);
  });

  it('Jinx (Al-Hadikhia & Mastermind): each chosen player sees only the picks up to and including them', () => {
    const g = night1(MM, executed);
    chose(g, three(g));
    expect(g.s.night!.resolution!.followUps.map((q) => q.spec.prompt)).toEqual(expectedPrompts(g));
  });

  it('Jinx (Al-Hadikhia & Mastermind): all three live: "evil wins", nothing dies, the game goes on', () => {
    const g = night1(MM, executed);
    chose(g, three(g));
    expect(row(g).outcome).toContain('waiting for all three answers');
    for (const t of three(g)) answer(g, t, 'live');
    const res = g.s.night!.resolution!;
    expect(row(g).outcome).toContain('Jinx (Al-Hadikhia & Mastermind): evil wins');
    expect(res.deaths).toEqual([]);
    act(g, { type: 'publish_night' });
    expect(g.s.phase).toBe('DAY');
  });

  it('Jinx (Al-Hadikhia & Mastermind): anyone choosing to die: "good wins", and they don\'t die', () => {
    const g = night1(MM, executed);
    chose(g, three(g));
    answer(g, g.p.empath, 'live');
    answer(g, g.p.gambler, 'die');
    answer(g, g.p.butler, 'live');
    expect(row(g).outcome).toContain('Jinx (Al-Hadikhia & Mastermind): good wins');
    expect(g.s.night!.resolution!.deaths).toEqual([]);
  });

  it('Jinx (Al-Hadikhia & Mastermind): an impaired Mastermind gets a review note', () => {
    const g = night1(MM, executed);
    submit(g, { [g.p.poisoner]: { poisoner: [g.p.mastermind] } });
    chose(g, three(g));
    expect(row(g).outcome).toContain('Jinx (Al-Hadikhia & Mastermind): the Mastermind (P1-mastermind) is drunk or poisoned');
  });

  it('Jinx (Al-Hadikhia & Mastermind): a Scarlet Woman took over, so the game goes on: the dead Al-Hadikhia doesn\'t wake, the new Demon acts normally', () => {
    const g = night1(['al_hadikhia', 'mastermind', 'scarlet_woman', 'empath', 'gambler', 'butler', 'seamstress'], (g) => {
      executed(g);
      act(g, { type: 'resolve_day_prompt', id: g.s.dayPrompts[0].id, accept: true });
    });
    const me = g.p.scarlet_woman;
    expect(wakingRoles(g.s, g.p.al_hadikhia)).toEqual([]);
    expect(expectedActors(g.s)).not.toContain(g.p.al_hadikhia);
    expect(wakingRoles(g.s, me)).toEqual(['al_hadikhia']);
    const [spec] = actionSpecs(g.s, me);
    expect(spec).toMatchObject({ allowDecline: true, declineLabel: 'No one' });
    expect(spec.prompt).not.toMatch(/^Jinx/);
    expect(spec.fields[0].options).toEqual(g.ids);
    chose(g, three(g), me);
    answer(g, g.p.empath, 'die', me);
    const res = g.s.night!.resolution!;
    expect(res.deaths).toEqual([g.p.empath]);
    expect(res.actors.filter((a) => a.roleId === 'al_hadikhia').map((a) => a.playerId)).toEqual([me]);
    expect(row(g, me).outcome).not.toContain('Jinx');
  });

  it('Jinx (Al-Hadikhia & Mastermind): not without a living Mastermind, and only the night after the execution', () => {
    const none = night1(ROLES, (g) => { act(g, { type: 'record_execution', playerId: g.p.al_hadikhia, died: true }); });
    expect(wakingRoles(none.s, none.p.al_hadikhia)).toEqual([]);
    const dead = night1(MM, (g) => { act(g, { type: 'mark_alive', playerId: g.p.mastermind, alive: false }); executed(g); });
    expect(wakingRoles(dead.s, dead.p.al_hadikhia)).toEqual([]);
    const later = night1(MM, executed);
    resolve(later);
    act(later, { type: 'publish_night', force: true });
    nextNight(later);
    expect(wakingRoles(later.s, later.p.al_hadikhia)).toEqual([]);
  });
});
