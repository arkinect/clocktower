import { describe, expect, it } from 'vitest';
import { scene } from '../scenario';

const cast = { ann: 'witch_king', bo: 't1', cy: 't2', di: 'm1', ed: 't3', fi: 't4' };
const row = (s: ReturnType<typeof scene>) => s.dayActions().find((d) => d.roleId === 'witch_king');
/** Night 1's curses (an empty list is "No one"), then the day after. */
const cursed = (picks: string[], chars: Record<string, string> = cast) =>
  scene(chars).start().dawn().dusk().submit({ ann: picks }).dawn();

describe('Witch King', () => {
  it('does not wake on the first night', () => {
    expect(scene(cast).start().specs('ann')).toEqual([]);
  });
  it('curses up to 2 different players, or kills 1, or chooses no one', () => {
    const s = scene(cast).start().dawn().dusk();
    expect(s.specs('ann')[0]).toMatchObject({
      modes: [
        { id: 'curse', label: 'Curse', maxRows: 2 },
        { id: 'kill', label: 'Kill' },
      ],
      distinct: true,
      allowDecline: true,
    });
  });
  it('a kill is tonight, as the Demon, and curses no one', () => {
    const s = cursed(['kill', 'bo']);
    expect(s.alive('bo')).toBe(false);
    expect(s.state.events.some((e) => e.kind === 'death' && e.cause === 'demon_attack')).toBe(true);
    expect(row(s)).toBeUndefined();
  });
  it('a curse kills no one at night', () => {
    const s = cursed(['bo', 'cy']);
    expect(Object.keys(cast).every((id) => s.alive(id))).toBe(true);
  });
  it('may kill one night and curse the next', () => {
    const s = cursed(['kill', 'bo']);
    s.dusk()
      .submit({ ann: ['cy'] })
      .dawn();
    expect(s.alive('cy')).toBe(true);
    expect(row(s)?.fields[0]?.options).toEqual(['cy']);
  });
  it('a poisoned Witch King kills no one, and a protected player survives the kill', () => {
    const poisoned = scene({ ...cast, di: 'poisoner' })
      .start()
      .submit({ di: ['bo'] })
      .dawn()
      .dusk()
      .submit({ ann: ['kill', 'bo'], di: ['ann'] })
      .dawn();
    expect(poisoned.alive('bo')).toBe(true);
    expect(cursed(['kill', 'bo'], { ...cast, bo: 'fool' }).alive('bo')).toBe(true);
  });
  it('a Witch King who kills themself dies, and good wins', () => {
    expect(cursed(['kill', 'ann']).winners()).toContain('good');
  });
  it('a kill takes exactly 1 player, and the choice must say which it is', () => {
    const s = scene(cast).start().dawn().dusk();
    const key = s.specs('ann')[0]?.key as string;
    const tryIt = (choice: { values: string[]; mode?: string }) =>
      s.g.tryAs('ann' as never, { type: 'submit_night', actions: { [key]: choice } });
    expect(tryIt({ mode: 'kill', values: ['bo', 'cy'] }).ok).toBe(false);
    expect(tryIt({ mode: 'curse', values: ['bo', 'cy', 'ed'] }).ok).toBe(false);
    expect(tryIt({ mode: 'both', values: ['bo'] }).ok).toBe(false);
    expect(tryIt({ values: ['bo'] }).ok).toBe(false);
    expect(tryIt({ mode: 'kill', values: ['bo'] }).ok).toBe(true);
  });
  it('curses 2 players: each dies when nominated, and the other stays cursed', () => {
    const s = cursed(['bo', 'cy']);
    expect(row(s)).toMatchObject({ control: 'toggle', preview: true, recorded: null });
    expect(row(s)?.fields[0]?.options).toEqual(['bo', 'cy']);
    expect(s.act('witch_king', 'apply_curse', ['bo']).effective).toBe(true);
    expect(s.dead('bo')).toBe(true);
    expect(s.alive('cy')).toBe(true);
    expect(row(s)?.recorded).toEqual(['bo']);
    expect(s.act('witch_king', 'apply_curse', ['cy']).effective).toBe(true);
    expect(s.dead('bo', 'cy')).toBe(true);
    expect(row(s)?.recorded).toEqual(['bo', 'cy']);
  });
  it('the curse kills as the Demon', () => {
    const s = cursed(['bo']);
    s.act('witch_king', 'apply_curse', ['bo']);
    expect(s.state.events.some((e) => e.kind === 'death' && e.cause === 'demon_attack')).toBe(true);
  });
  it('tells the Witch King who they chose', () => {
    const s = scene(cast)
      .start()
      .dawn()
      .dusk()
      .submit({ ann: ['bo', 'cy'] });
    expect(s.truth('ann')).toEqual(['You chose bo and cy.']);
  });
  it('may curse just one player', () => {
    const s = cursed(['ed']);
    expect(row(s)?.fields[0]?.options).toEqual(['ed']);
  });
  it('may curse no one: no switch on the Day tab', () => {
    const s = cursed([]);
    expect(row(s)).toBeUndefined();
  });
  it('is a switch: pressing it again takes it back, reviving them and cursing them again', () => {
    const s = cursed(['bo', 'cy']);
    s.act('witch_king', 'apply_curse', ['bo']);
    expect(s.act('witch_king', 'apply_curse', ['bo']).summary).toBe('Taken back: bo is cursed again and alive.');
    expect(s.alive('bo')).toBe(true);
    expect(row(s)?.recorded).toBeNull();
    s.act('witch_king', 'apply_curse', ['bo']);
    expect(s.alive('bo')).toBe(false);
  });
  it('shows switches only for the living, and for a curse that has gone off', () => {
    const s = cursed(['bo', 'cy']);
    s.g.st({ type: 'mark_alive', playerId: 'cy' as never, alive: false });
    expect(row(s)?.fields[0]?.options).toEqual(['bo']);
    s.act('witch_king', 'apply_curse', ['bo']);
    expect(s.dead('bo', 'cy')).toBe(true);
    expect(row(s)).toMatchObject({ recorded: ['bo'], fields: [{ options: ['bo'] }] });
  });
  it('a preview changes nothing, and the Storyteller can force a survival', () => {
    const s = cursed(['bo']);
    s.act('witch_king', 'apply_curse', ['bo'], { mode: 'preview' });
    expect(s.alive('bo')).toBe(true);
    s.act('witch_king', 'apply_curse', ['bo'], { mode: 'force_fail' });
    expect(s.alive('bo')).toBe(true);
  });
  it('the curses end at dusk', () => {
    const s = cursed(['bo', 'cy']);
    s.dusk().submit({ ann: [] }).dawn();
    expect(row(s)).toBeUndefined();
  });
  it('a poisoned Witch King curses no one', () => {
    const s = scene({ ...cast, di: 'poisoner' })
      .start()
      .submit({ di: ['bo'] })
      .dawn()
      .dusk()
      .submit({ ann: ['bo', 'cy'], di: ['ann'] })
      .dawn();
    expect(row(s)).toBeUndefined();
  });
  it('a protected player survives the curse (the Fool)', () => {
    const s = cursed(['bo'], { ...cast, bo: 'fool' });
    expect(s.act('witch_king', 'apply_curse', ['bo'], { mode: 'preview' }).effective).toBe(false);
    s.act('witch_king', 'apply_curse', ['bo']);
    expect(s.alive('bo')).toBe(true);
  });
  /** 3 alive (the Witch King, ed and fi), and fi cursed and nominated: 2 left by day. */
  const twoLeft = () => {
    const s = scene(cast).start().dawn();
    for (const id of ['bo', 'cy', 'di']) s.kill(id);
    s.dusk()
      .submit({ ann: ['fi'] })
      .dawn();
    expect(s.act('witch_king', 'apply_curse', ['fi']).effective).toBe(true);
    return s;
  };
  it('keeps cursing with 3 players alive; with 2 left the day goes on, and evil wins at dusk', () => {
    const s = twoLeft();
    expect(s.winners()).toEqual([]);
    s.dusk();
    expect(s.winners()).toContain('evil');
  });
  it('with 2 left by day, the last good player can still execute the Witch King', () => {
    const s = twoLeft();
    s.execute('ann').dusk();
    expect(s.winners()).toEqual(['good']);
  });
  it('a Witch King who cursed themself and is nominated dies, and good wins', () => {
    const s = cursed(['ann']);
    s.act('witch_king', 'apply_curse', ['ann']);
    expect(s.alive('ann')).toBe(false);
    expect(s.winners()).toContain('good');
  });
  it('a Witch and a Witch King keep their own curses', () => {
    const s = scene({ ...cast, di: 'witch' })
      .start()
      .submit({ di: ['bo'] })
      .dawn()
      .dusk()
      .submit({ ann: ['cy'], di: ['ed'] })
      .dawn();
    const witch = () => s.dayActions().find((d) => d.roleId === 'witch');
    expect(witch()?.fields[0]?.options).toEqual(['ed']);
    expect(row(s)?.fields[0]?.options).toEqual(['cy']);
    s.act('witch_king', 'apply_curse', ['cy']);
    expect(s.alive('cy')).toBe(false);
    expect(witch()).toMatchObject({ recorded: null });
    expect(s.alive('ed')).toBe(true);
  });
});
