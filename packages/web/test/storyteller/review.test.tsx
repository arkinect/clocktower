// The Review tab.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DayActionSpec, ReviewItem, ReviewView, type StorytellerView } from '@ct/protocol';
import { ability, console_, player } from '../views';

const run = vi.hoisted(() => vi.fn(async () => ({ ok: true })));
// The catalog the panels look types up in: one Townsfolk and one Traveller.
const catalog = vi.hoisted(() => [
  { roleId: 'empath', name: 'Empath', type: 'townsfolk' },
  { roleId: 'beggar', name: 'Beggar', type: 'traveller' },
]);
vi.mock('../../src/app/store', () => ({
  useCommand: () => ({ run, pending: false }),
  useGame: () => ({ catalog, jinxes: [] }),
  useNames: () => ({ players: { aaaaaaaaaaaaaaaa: 'Ann', bbbbbbbbbbbbbbbb: 'Bo' }, roles: {} }),
}));

import { Review } from '../../src/storyteller/Review';

afterEach(() => {
  cleanup();
  run.mockClear();
});

describe('the Review tab', () => {
  const decision = (over: Record<string, unknown>) =>
    ReviewItem.parse({
      key: { kind: 'flowergirl_voted', ability: null },
      hash: 'h1',
      title: 'Flowergirl: did a Demon vote on Day 1?',
      description: 'Not recorded during the day.',
      options: [
        { id: 'yes', label: 'Yes' },
        { id: 'no', label: 'No' },
      ],
      default: 'no',
      chosen: null,
      required: true,
      ...over,
    });
  const result = (over: Record<string, unknown> = {}) => ({
    key: 'r1',
    playerId: 'aaaaaaaaaaaaaaaa',
    roleId: 'butler',
    title: 'Butler',
    truth: ['Your master is Bo.'],
    suggested: ['Your master is Bo.'],
    transformed: null,
    final: ['Your master is Bo.'],
    impaired: true,
    causes: ['poisoned:Poisoner'],
    overridden: false,
    staleOverride: false,
    alternatives: [],
    confirmation: true,
    ...over,
  });
  const reviewView = (decisions: ReviewItem[], results: unknown[] = []) =>
    ({
      ...console_({ kind: 'night', n: 2, stage: 'review' }),
      review: ReviewView.parse({
        actors: [],
        results,
        decisions,
        questions: [],
        notices: [],
        deaths: [],
        revived: [],
        malfunctions: [],
        malfunctionAdjust: { add: [], remove: [] },
        gameEnd: [],
        log: [],
        story: { kind: 'night', n: 2, deaths: [], revived: [], rows: [] },
      }),
    }) as StorytellerView;
  const topCard = () => screen.getByText('Not recorded during the day.', { selector: 'b' }).closest('p')?.parentElement;

  it('keeps an answered required decision in the top card, with no Decisions section', () => {
    render(<Review view={reviewView([decision({ chosen: 'yes' })])} />);
    expect(within(topCard() as HTMLElement).getByRole('heading', { name: /Flowergirl/ })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Decisions' })).toBeNull();
  });

  it('lists an optional decision under Decisions with only its dropdown', () => {
    render(
      <Review view={reviewView([decision({ hash: 'h2', title: 'Imp: who dies?', required: false, chosen: 'yes' })])} />,
    );
    const section = screen.getByRole('heading', { name: 'Decisions' }).parentElement as HTMLElement;
    expect(within(section).getByRole('combobox', { name: 'Imp: who dies?' })).toBeTruthy();
    expect(within(section).queryByRole('button')).toBeNull();
  });

  it('lists an impaired result only when there is a false answer to choose, or one you wrote', () => {
    const learns = () => screen.queryByRole('heading', { name: 'What each player learns' });
    const { rerender } = render(<Review view={reviewView([], [result()])} />);
    expect(learns()).toBeNull();
    rerender(<Review view={reviewView([], [result({ overridden: true, final: ['Written.'] })])} />);
    expect(learns()).toBeTruthy();
    rerender(<Review view={reviewView([], [result({ confirmation: false })])} />);
    expect(learns()).toBeTruthy();
    rerender(<Review view={reviewView([], [result({ confirmation: false, impaired: false, causes: [] })])} />);
    expect(learns()).toBeNull();
  });

  describe("a player's own section", () => {
    const spec = {
      key: 'a1',
      roleId: 'imp',
      title: 'Imp',
      prompt: 'Choose a player: they die.',
      fields: [{ kind: 'player', label: 'Player', options: ['aaaaaaaaaaaaaaaa', 'bbbbbbbbbbbbbbbb'] }],
      distinct: true,
      allowDecline: false,
    };
    const sober = result({ confirmation: false, impaired: false, causes: [], playerId: 'bbbbbbbbbbbbbbbb' });
    // Each test has its own game code: open sections are remembered by game and night.
    const withPlayers = (code: string, results: unknown[] = [], questions: unknown[] = []) => {
      const base = reviewView([], results);
      return {
        ...base,
        code,
        review: { ...base.review, questions },
        players: [player({}), player({ id: 'bbbbbbbbbbbbbbbb', name: 'Bo', seat: 1, alive: false })],
        board: [
          {
            playerId: 'aaaaaaaaaaaaaaaa',
            wakes: [],
            specs: [spec],
            expected: true,
            submitted: true,
            byStoryteller: false,
            submission: { a1: { values: ['bbbbbbbbbbbbbbbb'] } },
          },
          {
            playerId: 'bbbbbbbbbbbbbbbb',
            wakes: [],
            specs: [],
            expected: false,
            submitted: false,
            byStoryteller: false,
            submission: null,
          },
        ],
      } as unknown as StorytellerView;
    };
    const add = (id: string) => userEvent.selectOptions(screen.getByRole('combobox', { name: 'Add a player' }), id);

    it('offers every seated player, and one added leaves the list', async () => {
      render(<Review view={withPlayers('G1')} />);
      const options = () =>
        within(screen.getByRole('combobox', { name: 'Add a player' }))
          .getAllByRole('option')
          .map((o) => o.textContent);
      expect(options()).toEqual(['Add a player…', 'Ann', 'Bo (dead)']);
      await add('aaaaaaaaaaaaaaaa');
      expect(options()).toEqual(['Add a player…', 'Bo (dead)']);
      await userEvent.click(screen.getByRole('button', { name: 'Cancel changes to Ann' }));
      expect(options()).toEqual(['Add a player…', 'Ann', 'Bo (dead)']);
      expect(run).not.toHaveBeenCalled();
    });

    it('Cancel puts back the choice and the answer the card was added with, then removes the card', async () => {
      const { rerender } = render(<Review view={withPlayers('G6', [sober])} />);
      await add('aaaaaaaaaaaaaaaa');
      await add('bbbbbbbbbbbbbbbb');
      // The game as it is after the Storyteller changed Ann's choice and wrote Bo an answer.
      const changed = withPlayers('G6', [{ ...sober, overridden: true, final: ['Written.'] }]);
      (changed.board[0] as { submission: unknown }).submission = { a1: { values: ['aaaaaaaaaaaaaaaa'] } };
      rerender(<Review view={changed} />);
      await userEvent.click(screen.getByRole('button', { name: 'Cancel changes to Ann' }));
      expect(run).toHaveBeenLastCalledWith({
        type: 'submit_for',
        playerId: 'aaaaaaaaaaaaaaaa',
        actions: { a1: { values: ['bbbbbbbbbbbbbbbb'] } },
      });
      await userEvent.click(screen.getByRole('button', { name: 'Cancel changes to Bo' }));
      expect(run).toHaveBeenLastCalledWith({ type: 'override_result', resultKey: 'r1', lines: null });
      expect(run).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('button', { name: /Cancel changes/ })).toBeNull();
    });

    it("changes a player's night choice, once it differs from what they submitted", async () => {
      render(<Review view={withPlayers('G2')} />);
      await add('aaaaaaaaaaaaaaaa');
      const change = screen.getByRole('button', { name: 'Change their choice' }) as HTMLButtonElement;
      expect((screen.getByLabelText('Player') as HTMLSelectElement).value).toBe('bbbbbbbbbbbbbbbb');
      expect(change.disabled).toBe(true);
      await userEvent.selectOptions(screen.getByLabelText('Player'), 'aaaaaaaaaaaaaaaa');
      await userEvent.click(change);
      expect(run).toHaveBeenCalledWith({
        type: 'submit_for',
        playerId: 'aaaaaaaaaaaaaaaa',
        actions: { a1: { values: ['aaaaaaaaaaaaaaaa'] } },
      });
    });

    it("shows a sober player's result only in their section, with its answer to choose", async () => {
      render(<Review view={withPlayers('G3', [sober])} />);
      expect(screen.queryByRole('combobox', { name: 'Answer for Butler' })).toBeNull();
      await add('bbbbbbbbbbbbbbbb');
      expect(screen.getByRole('combobox', { name: 'Answer for Butler' })).toBeTruthy();
      expect(screen.queryByRole('heading', { name: 'What each player learns' })).toBeNull();
    });

    it('lets an answered question be answered again', async () => {
      const q = {
        key: 'a9:b',
        playerId: 'bbbbbbbbbbbbbbbb',
        roleId: 'ravenkeeper',
        spec: { ...spec, key: 'a9:b' },
        answered: true,
      };
      render(<Review view={withPlayers('G4', [], [{ ...q, answer: { values: ['aaaaaaaaaaaaaaaa'] } }])} />);
      expect(screen.queryByRole('button', { name: 'Change the answer' })).toBeNull();
      await add('bbbbbbbbbbbbbbbb');
      expect(screen.queryByRole('heading', { name: 'Questions' })).toBeNull();
      await userEvent.selectOptions(screen.getByLabelText('Player'), 'bbbbbbbbbbbbbbbb');
      await userEvent.click(screen.getByRole('button', { name: 'Change the answer' }));
      expect(run).toHaveBeenCalledWith({
        type: 'answer_question_for',
        key: 'a9:b',
        choice: { values: ['bbbbbbbbbbbbbbbb'] },
      });
    });

    it("has the day's fact for a holder of the role, recorded again from the card and put back by Cancel", async () => {
      const fact = (recorded: string) =>
        DayActionSpec.parse({
          key: 'a5:demon_voted',
          roleId: 'flowergirl',
          title: 'Flowergirl (Bo)',
          prompt: 'Did a Demon vote today?',
          fields: [{ kind: 'option', label: 'Demon voted', options: ['no', 'yes'], labels: { yes: 'Yes', no: 'No' } }],
          distinct: false,
          allowDecline: false,
          abilityId: 'a5',
          action: 'demon_voted',
          preview: false,
          recorded: [recorded],
          neededTonight: true,
          control: 'toggle',
          default: ['no'],
        });
      const withFact = (recorded: string) => {
        const v = withPlayers('G7');
        const holder = player({
          id: 'bbbbbbbbbbbbbbbb',
          name: 'Bo',
          seat: 1,
          abilities: [ability({ id: 'a5', roleId: 'flowergirl' })],
        });
        return {
          ...v,
          players: [v.players[0], holder],
          review: { ...v.review, facts: [fact(recorded)] },
        } as StorytellerView;
      };
      const { rerender } = render(<Review view={withFact('no')} />);
      expect(screen.queryByText('Did a Demon vote today?')).toBeNull();
      await add('aaaaaaaaaaaaaaaa');
      expect(screen.queryByText('Did a Demon vote today?')).toBeNull();
      await add('bbbbbbbbbbbbbbbb');
      await userEvent.click(screen.getByRole('button', { name: 'Yes' }));
      expect(run).toHaveBeenLastCalledWith({
        type: 'record_fact',
        abilityId: 'a5',
        action: 'demon_voted',
        values: ['yes'],
      });
      rerender(<Review view={withFact('yes')} />);
      await userEvent.click(screen.getByRole('button', { name: 'Cancel changes to Bo' }));
      expect(run).toHaveBeenLastCalledWith({
        type: 'record_fact',
        abilityId: 'a5',
        action: 'demon_voted',
        values: ['no'],
      });
    });

    it('keeps the cards in the browser, so a reload brings them back with what Cancel puts back', async () => {
      render(<Review view={withPlayers('G8')} />);
      await add('aaaaaaaaaaaaaaaa');
      const saved = localStorage.getItem('ct.review.cards:G8:2') as string;
      expect(JSON.parse(saved)[0][1].submission).toEqual({ a1: { values: ['bbbbbbbbbbbbbbbb'] } });
      cleanup();
      // A page that has just loaded, in the same game after Ann's choice was changed: G9 has no card in memory.
      localStorage.setItem('ct.review.cards:G9:2', saved);
      const changed = withPlayers('G9');
      (changed.board[0] as { submission: unknown }).submission = { a1: { values: ['aaaaaaaaaaaaaaaa'] } };
      render(<Review view={changed} />);
      await userEvent.click(screen.getByRole('button', { name: 'Cancel changes to Ann' }));
      expect(run).toHaveBeenLastCalledWith({
        type: 'submit_for',
        playerId: 'aaaaaaaaaaaaaaaa',
        actions: { a1: { values: ['bbbbbbbbbbbbbbbb'] } },
      });
      expect(localStorage.getItem('ct.review.cards:G9:2')).toBeNull();
    });

    it('drops a saved card from another game that had the same code', () => {
      const other = JSON.stringify([
        ['aaaaaaaaaaaaaaaa', { submission: null, answers: {}, overrides: {}, facts: {} }, 'a1,a2'],
      ]);
      localStorage.setItem('ct.review.cards:G10:2', other);
      render(<Review view={withPlayers('G10')} />);
      expect(screen.queryByRole('button', { name: /Cancel changes/ })).toBeNull();
    });

    it('says so when a player has nothing to change', async () => {
      render(<Review view={withPlayers('G5')} />);
      await add('bbbbbbbbbbbbbbbb');
      expect(
        screen.getByText('Bo has nothing to change tonight: no choice, no information and no fact from the day.'),
      ).toBeTruthy();
    });
  });
});
