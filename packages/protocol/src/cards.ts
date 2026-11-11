// The idle card game played while a night resolves. It sits beside the game, never in it: no command, no view field,
// nothing stored. A phone is sent its own hand and, for the other seats, a count of cards and nothing else.
// A phone with no place at a table just now is sent null in place of a table.
import { z } from 'zod';

export const CardColour = z.enum(['red', 'yellow', 'green', 'blue']);
export type CardColour = z.infer<typeof CardColour>;

export const CardFace = z.enum([
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'skip',
  'reverse',
  'draw2',
  'wild',
  'wild4',
]);
export type CardFace = z.infer<typeof CardFace>;

const CardId = z.number().int().min(0);

/** Wild cards have no colour of their own. */
export const Card = z.object({ id: CardId, colour: CardColour.nullable(), face: CardFace });
export type Card = z.infer<typeof Card>;

export const CardsAction = z.discriminatedUnion('type', [
  /** Opening the game, or coming back to it. */
  z.strictObject({ type: z.literal('sit') }),
  z.strictObject({ type: z.literal('leave') }),
  z.strictObject({ type: z.literal('play'), card: CardId, colour: CardColour.optional() }),
  z.strictObject({ type: z.literal('draw') }),
  z.strictObject({ type: z.literal('pass') }),
]);
export type CardsAction = z.infer<typeof CardsAction>;

export const CardsView = z.object({
  serverNow: z.number(),
  /** Seats in table order, this phone's first. No seat says who, or what, is sitting in it. */
  seats: z.array(z.object({ count: z.number(), turn: z.boolean() })),
  direction: z.union([z.literal(1), z.literal(-1)]),
  top: Card,
  /** The colour to follow: the top card's, or the one named with a wild. */
  colour: CardColour,
  hand: z.array(Card.extend({ playable: z.boolean() })),
  myTurn: z.boolean(),
  canDraw: z.boolean(),
  canPass: z.boolean(),
  /** When this phone's turn runs out. */
  deadline: z.number().nullable(),
  result: z.enum(['won', 'lost']).nullable(),
  /** Who the top card landed on, when it cost a seat its turn: a +2 on the pile is not always for this phone. */
  note: z.string().nullable(),
});
export type CardsView = z.infer<typeof CardsView>;
