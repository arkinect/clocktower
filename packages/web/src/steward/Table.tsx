import { useState } from 'react';
import type { PlayerId, StewardView } from '@ct/protocol';
import { useCommand } from '../app/store';
import { Section } from '../storyteller/common';
import { Button, HoldButton, Sheet, SheetActions } from '../ui/ui';
import { Circle, nameOf, phaseText, type StewardPlayer } from './common';

/** The circle as the table sees it, and what can be put right. No characters here, the steward's own included. */
export function Table({ view }: { view: StewardView }) {
  const { run, pending } = useCommand();
  const [open, setOpen] = useState<PlayerId | null>(null);
  const { kind } = view.phase;
  const playing = kind === 'night' || kind === 'day';
  const shown = view.players.find((p) => p.id === open);
  return (
    <div>
      <Circle view={view} label="The table" onPress={(p) => setOpen(p.id)}>
        {phaseText(view)}
      </Circle>
      <p className="muted small">Press a player to mark them away, or to hand them the game.</p>
      {view.offered && (
        <Section title="Waiting for a Storyteller">
          <p>{nameOf(view, view.offered)} has been asked to become the Storyteller. They have to agree.</p>
          <Button disabled={pending} onClick={() => void run({ type: 'offer_storyteller', playerId: null })}>
            Take it back
          </Button>
        </Section>
      )}
      {playing && !view.over && (
        <Section title="Abandon the game">
          <p className="muted">It ends with no winner, and everything is shown.</p>
          <HoldButton disabled={pending} onConfirm={() => void run({ type: 'abandon' })}>
            Abandon
          </HoldButton>
        </Section>
      )}
      {shown && <Seat view={view} p={shown} playing={playing} onClose={() => setOpen(null)} />}
    </div>
  );
}

function Seat({
  view,
  p,
  playing,
  onClose,
}: {
  view: StewardView;
  p: StewardPlayer;
  playing: boolean;
  onClose: () => void;
}) {
  const { run, pending } = useCommand();
  const me = p.id === view.meId;
  return (
    <Sheet title={p.name} onClose={onClose}>
      <p>{p.alive ? 'Alive.' : p.votesLeft ? 'Dead, with one vote left.' : 'Dead, with no vote left.'}</p>
      {playing && (
        <div>
          <Button
            disabled={pending}
            onClick={() => void run({ type: 'set_away', playerId: p.id, away: !p.away }).then((a) => a.ok && onClose())}
          >
            {p.away ? 'They are back' : 'Mark as away'}
          </Button>
          <p className="muted small">Away, they stay in the game and their nights are skipped.</p>
        </div>
      )}
      {!me && (
        <>
          <HoldButton
            disabled={pending}
            onConfirm={() => void run({ type: 'hand_steward', playerId: p.id }).then((a) => a.ok && onClose())}
          >
            Hand them the steward’s job
          </HoldButton>
          <p className="muted small">
            They sign in on this laptop with their name. You go back to playing from your phone.
          </p>
        </>
      )}
      {playing && !view.over && (
        <>
          <HoldButton
            disabled={pending}
            onConfirm={() => void run({ type: 'offer_storyteller', playerId: p.id }).then((a) => a.ok && onClose())}
          >
            {me ? 'Become the Storyteller' : 'Ask them to become the Storyteller'}
          </HoldButton>
          <p className="muted small">
            {me ? 'You agree to it on My role. ' : ''}They stop playing and see everything. It cannot be taken back, and
            every phone says so.
          </p>
        </>
      )}
      <SheetActions>
        <Button onClick={onClose}>Close</Button>
      </SheetActions>
    </Sheet>
  );
}
