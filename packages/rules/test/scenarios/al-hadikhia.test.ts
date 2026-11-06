// The Al-Hadikhia in depth: who is asked, what a forced dawn does, and how the answers meet the rest of the night.
import { describe, expect, it } from 'vitest';
import { bluffCandidates } from '../../src/setup/rules';
import { as, chosen, expected, open, row, titles } from './lib';
import { scene, ST, type Scene } from '../scenario';

const cast = {
  ann: 'al_hadikhia',
  bo: 'm1',
  cy: 'empath',
  di: 'gambler',
  ed: 'butler',
  fi: 'seamstress',
  gus: 'virgin',
};
const THREE = ['cy', 'di', 'ed'];
const night = (over: Record<string, string> = {}, before?: (s: Scene) => void) => {
  const s = scene({ ...cast, ...over }).start();
  s.dawn();
  before?.(s);
  return s.dusk();
};
const pick = (s: Scene, ts = THREE, who = 'ann') => s.submit({ [who]: ts }).review();
const ah = (s: Scene, id = 'ann') => row(s, id, 'al_hadikhia');

describe('the Al-Hadikhia at night', () => {
  it('a game whose script lacks them never offers them', () => {
    const s = scene({ ann: 'imp', bo: 'm1', cy: 'empath', di: 'gambler', ed: 'butler', fi: 't1', gus: 't2' });
    s.g.st({ type: 'set_script', roleIds: s.state.script.filter((r) => r !== 'al_hadikhia') });
    expect(bluffCandidates(s.state)).not.toContain('al_hadikhia');
    expect(
      s.g.rejected(ST, { type: 'assign_character', playerId: as('cy'), roleId: chosen('al_hadikhia') }),
    ).toBeTruthy();
    s.start().nextNight();
    expect(s.specs('di')[0]?.fields[1]?.options).not.toContain('al_hadikhia');
  });

  it('nothing on night 0, then three distinct fields of any seated player, dead and self included, or "No one"', () => {
    const s = scene(cast).start();
    expect(s.specs('ann')).toEqual([]);
    s.dawn().execute('gus').dusk();
    const [spec] = s.specs('ann');
    expect(spec).toMatchObject({ title: 'Al-Hadikhia', distinct: true, allowDecline: true, declineLabel: 'No one' });
    expect(spec?.fields).toHaveLength(3);
    for (const f of spec?.fields ?? []) expect(f.options).toEqual(s.ids);
    const key = spec?.key as string;
    const submit = (values: string[]) => s.g.tryAs(as('ann'), { type: 'submit_night', actions: { [key]: { values } } });
    expect(submit(['cy', 'cy', 'ed']).ok).toBe(false);
    expect(submit(['ann', 'gus', 'ed']).ok).toBe(true);
  });

  it('declining: nothing happens and nothing is announced', () => {
    const s = night();
    s.submit({ ann: [] }).review();
    expect(s.res.questions).toEqual([]);
    expect(s.res.notices.filter((n) => n.title === 'Al-Hadikhia')).toEqual([]);
    expect(ah(s)?.outcome).toContain('chose no one: nothing happens');
  });

  it('asks each chosen player in order, Live or Die, and the row keeps the three names', () => {
    const s = pick(night());
    expect(s.res.questions.map((q) => q.playerId)).toEqual(THREE);
    expect(s.res.questions[0]?.spec.fields).toEqual([
      { kind: 'option', label: 'Your choice', options: ['live', 'die'], labels: { live: 'Live', die: 'Die' } },
    ]);
    expect(s.res.questions[0]?.spec.allowDecline).toBeFalsy();
    const before = ah(s)?.input;
    s.answer('cy', ['live']);
    expect(ah(s)?.input).toEqual(before);
    expect(JSON.stringify(before)).toContain('cy');
  });

  it('the dawn notice names all three in pick order, to every seat, and not before publishing', () => {
    const s = pick(night(), ['ed', 'cy', 'di']);
    expect(titles(s, 'fi')).not.toContain('Al-Hadikhia');
    s.dawn();
    for (const id of s.ids) expect(s.inbox(id)).toContain('The Al-Hadikhia chose ed, cy and di.');
  });

  it('"Accept all defaults" answers nothing, and publishing waits unless forced', () => {
    const s = pick(night());
    s.g.st({ type: 'accept_all_defaults' });
    expect(open(s)).toHaveLength(3);
    expect(s.g.tryAs(ST, { type: 'publish_dawn', force: false }).ok).toBe(false);
    for (const id of THREE) s.answer(id, ['die']);
    expect(open(s)).toEqual([]);
    s.g.st({ type: 'publish_dawn', force: false });
    expect(s.state.phase.kind).toBe('day');
  });

  it('die: they die as a Demon attack', () => {
    const s = pick(night());
    s.answer('cy', ['die']).answer('di', ['live']).answer('ed', ['live']);
    expect(s.res.deaths).toEqual(['cy']);
    s.dawn();
    expect(s.g.player(as('cy')).life.alive).toBe(false);
    expect(JSON.stringify(s.g.player(as('cy')).life)).toContain('demon_attack');
  });

  it('live revives a dead Empath, who gets information that night and is told', () => {
    const s = pick(night({}, (x) => x.execute('cy')));
    s.answer('cy', ['live']).answer('di', ['die']).answer('ed', ['live']);
    expect(s.res.revived).toEqual(['cy']);
    expect(s.truth('cy').length).toBe(1);
    s.dawn();
    expect(s.alive('cy')).toBe(true);
    expect(titles(s, 'cy')).toContain('You are alive again');
  });

  it('live revives a dead Fortune Teller: no question tonight, and they act the next night', () => {
    const s = pick(night({ cy: 'fortune_teller' }, (x) => x.execute('cy')));
    s.answer('cy', ['live']).answer('di', ['die']).answer('ed', ['live']);
    expect(s.res.revived).toEqual(['cy']);
    expect(s.res.questions.map((q) => q.playerId)).toEqual(THREE);
    expect(s.res.results.some((r) => r.playerId === 'cy')).toBe(false);
    s.dawn().dusk();
    expect(s.specs('cy').map((x) => x.roleId)).toContain('fortune_teller');
  });

  it('a Ravenkeeper revived by live and killed again is asked nothing', () => {
    const s = pick(night({ cy: 'ravenkeeper' }, (x) => x.execute('cy')));
    for (const id of THREE) s.answer(id, ['live']);
    expect(s.res.deaths).toContain('cy');
    expect(s.res.questions.map((q) => q.playerId)).toEqual(THREE);
  });

  it('all three alive: all three die, a revived player too, who is not told they are alive', () => {
    const s = pick(night({}, (x) => x.execute('cy')));
    for (const id of THREE) s.answer(id, ['live']);
    expect(s.res.deaths).toEqual(THREE);
    expect(ah(s)?.outcome).toContain('all three are alive: all three die');
    s.dawn();
    expect(s.dead(...THREE)).toBe(true);
    expect(titles(s, 'cy')).not.toContain('You are alive again');
  });

  it('a Tea Lady-protected "die" counts as alive: the others die, and she still protects them', () => {
    const s = pick(night({ di: 'tea_lady', ed: 't1' }), ['cy', 'fi', 'gus']);
    s.answer('cy', ['die']).answer('fi', ['live']).answer('gus', ['live']);
    expect(s.res.deaths).toEqual(['fi', 'gus']);
    expect(ah(s)?.outcome).toContain('all three are alive: all three die');
    s.dawn();
    expect(s.alive('cy')).toBe(true);
  });

  it('impaired: questions still asked, no effect, the notice still goes, and the review says so', () => {
    const s = night({ bo: 'poisoner' }, (x) => x.execute('gus'));
    s.submit({ bo: ['ann'] });
    pick(s, ['cy', 'di', 'gus']);
    expect(open(s)).toHaveLength(3);
    s.answer('cy', ['die']).answer('di', ['live']).answer('gus', ['live']);
    expect(s.res.deaths).toEqual([]);
    expect(s.res.revived).toEqual([]);
    expect(ah(s)?.impaired).toBe(true);
    expect(ah(s)?.outcome).toContain('impaired: questions asked, the answers have no effect');
    expect(s.res.notices.filter((n) => n.title === 'Al-Hadikhia')).toHaveLength(7);
  });

  it('reopening collecting clears the answers', () => {
    const s = pick(night());
    s.answer('cy', ['die']);
    s.g.st({ type: 'reopen_collecting' });
    s.review();
    expect(open(s)).toHaveLength(3);
    expect(s.res.deaths).toEqual([]);
  });

  it('a forced publish with a missing answer: no effect for them, and no "if all live, all die"', () => {
    const s = pick(night());
    s.answer('cy', ['live']).answer('di', ['live']);
    expect(ah(s)?.outcome).toContain('ed has not answered: no effect for them');
    expect(ah(s)?.outcome).toContain('the "if all live, all die" rule needs all three answers');
    s.dawn();
    for (const id of THREE) expect(s.alive(id)).toBe(true);
  });

  it('dead players are asked and answer, and the Storyteller can answer for them', () => {
    const s = pick(night({}, (x) => x.execute('cy')));
    expect(s.g.view(as('cy')).me.questions).toHaveLength(1);
    s.answer('cy', ['die']);
    const q = s.res.questions.find((x) => x.playerId === 'di');
    s.g.st({ type: 'answer_question_for', key: q?.key as string, choice: { values: ['live'] } });
    expect(open(s).map((x) => x.playerId)).toEqual(['ed']);
  });

  it('Live/Die reaches only the asked player, and nobody else can answer or see an answer', () => {
    const s = pick(night());
    const view = (id: string) => s.g.view(as(id));
    const key = s.res.questions[0]?.key as string;
    expect(view('cy').me.questions.map((q) => q.key)).toEqual([key]);
    expect(view('fi').me.questions).toEqual([]);
    expect(view('ann').me.questions).toEqual([]);
    expect(s.g.tryAs(as('di'), { type: 'answer_question', key, choice: { values: ['die'] } }).ok).toBe(false);
    s.answer('cy', ['die']);
    for (const id of ['ann', 'fi']) expect(JSON.stringify(view(id))).not.toMatch(/"die"/);
    expect(s.g.tryAs(as('cy'), { type: 'answer_question', key, choice: { values: ['live'] } }).ok).toBe(false);
  });
});

describe('Jinx (Scarlet Woman & Al-Hadikhia)', () => {
  const sw = { ...cast, bo: 'scarlet_woman' };
  const takeOver = (s: Scene) => {
    s.execute('ann').prompt('yes');
    expect(s.character('bo')).toBe('al_hadikhia');
  };
  const TITLE = 'Jinx (Scarlet Woman & Al-Hadikhia): You are the Scarlet Woman again';

  it('the old Al-Hadikhia chooses to live: she is the Scarlet Woman again, told, with a review line', () => {
    const s = scene(sw).start();
    s.dawn();
    takeOver(s);
    s.dusk();
    pick(s, ['ann', 'cy', 'di'], 'bo');
    s.answer('ann', ['live']);
    expect(ah(s, 'bo')?.outcome).toContain('Jinx (Scarlet Woman & Al-Hadikhia): bo is the Scarlet Woman again');
    s.dawn();
    expect(s.character('bo')).toBe('scarlet_woman');
    expect(s.alignment('bo')).toBe('evil');
    expect(s.character('ann')).toBe('al_hadikhia');
    expect(titles(s, 'bo')).toContain(TITLE);
  });

  it('reviving someone else changes nothing', () => {
    const s = scene(sw).start();
    s.dawn().execute('cy');
    takeOver(s);
    s.dusk();
    pick(s, ['cy', 'di', 'ed'], 'bo');
    s.answer('cy', ['live']);
    s.dawn();
    expect(s.character('bo')).toBe('al_hadikhia');
  });

  it('the Storyteller marking the old Al-Hadikhia alive by day does it too', () => {
    const s = scene(sw).start();
    s.dawn();
    takeOver(s);
    s.g.st({ type: 'mark_alive', playerId: as('ann'), alive: true });
    expect(s.character('bo')).toBe('scarlet_woman');
    expect(titles(s, 'bo')).toContain(TITLE);
  });
});

describe('Jinx (Al-Hadikhia & Mastermind)', () => {
  const mm = {
    ann: 'al_hadikhia',
    bo: 'mastermind',
    cy: 'poisoner',
    di: 'empath',
    ed: 'gambler',
    fi: 'butler',
    gus: 'seamstress',
  };
  const GOOD = ['di', 'ed', 'fi'];
  const executed = () => scene(mm).start().dawn().execute('ann').dusk();

  it('the dead Al-Hadikhia wakes with a picker of good players only, and is waited for', () => {
    const s = executed();
    expect(expected(s)).toContain('ann');
    const [spec] = s.specs('ann');
    expect(spec?.prompt).toMatch(/^Jinx \(Al-Hadikhia & Mastermind\): /);
    expect(spec?.allowDecline).toBeFalsy();
    expect(spec?.fields).toHaveLength(3);
    for (const f of spec?.fields ?? []) expect(f.options).toEqual(['di', 'ed', 'fi', 'gus']);
    const actions = { [spec?.key as string]: { values: ['cy', 'di', 'ed'] } };
    expect(s.g.tryAs(as('ann'), { type: 'submit_night', actions }).ok).toBe(false);
  });

  it('each chosen player sees only the picks up to and including them', () => {
    const s = pick(executed(), GOOD);
    expect(s.res.questions.map((q) => q.spec.prompt)).toEqual([
      'The Al-Hadikhia chose you. Do you choose to live or die?',
      'The Al-Hadikhia chose di, then you. Do you choose to live or die?',
      'The Al-Hadikhia chose di, ed, then you. Do you choose to live or die?',
    ]);
  });

  it('all three live: "evil wins", nothing dies, the game goes on', () => {
    const s = pick(executed(), GOOD);
    expect(ah(s)?.outcome).toContain('waiting for all three answers');
    for (const id of GOOD) s.answer(id, ['live']);
    expect(ah(s)?.outcome).toContain('Jinx (Al-Hadikhia & Mastermind): evil wins');
    expect(s.res.deaths).toEqual([]);
    s.g.st({ type: 'publish_dawn', force: false });
    expect(s.state.phase.kind).toBe('day');
  });

  it('anyone choosing to die: "good wins", and they do not die', () => {
    const s = pick(executed(), GOOD);
    s.answer('di', ['live']).answer('ed', ['die']).answer('fi', ['live']);
    expect(ah(s)?.outcome).toContain('Jinx (Al-Hadikhia & Mastermind): good wins');
    expect(s.res.deaths).toEqual([]);
  });

  it('an impaired Mastermind gets a review note', () => {
    const s = executed().submit({ cy: ['bo'] });
    pick(s, GOOD);
    expect(ah(s)?.outcome).toContain('Jinx (Al-Hadikhia & Mastermind): the Mastermind (bo) is drunk or poisoned');
  });

  it('a Scarlet Woman took over, so the dead Al-Hadikhia sleeps and the new Demon acts normally', () => {
    const s = scene({ ...mm, cy: 'scarlet_woman' }).start();
    s.dawn().execute('ann').prompt('yes').dusk();
    expect(s.specs('ann')).toEqual([]);
    expect(expected(s)).not.toContain('ann');
    const [spec] = s.specs('cy');
    expect(spec).toMatchObject({ roleId: 'al_hadikhia', allowDecline: true, declineLabel: 'No one' });
    expect(spec?.prompt).not.toMatch(/^Jinx/);
    expect(spec?.fields[0]?.options).toEqual(s.ids);
    pick(s, GOOD, 'cy');
    s.answer('di', ['die']);
    expect(s.res.deaths).toEqual(['di']);
    expect(ah(s, 'cy')?.outcome).not.toContain('Jinx');
  });

  it('not without a living Mastermind, and only the night after the execution', () => {
    const none = scene(cast).start().dawn().execute('ann').dusk();
    expect(none.specs('ann')).toEqual([]);
    const dead = scene(mm).start().dawn();
    dead.g.st({ type: 'mark_alive', playerId: as('bo'), alive: false });
    dead.execute('ann').dusk();
    expect(dead.specs('ann')).toEqual([]);
    const later = executed().dawn().dusk();
    expect(later.specs('ann')).toEqual([]);
  });
});
