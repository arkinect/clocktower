import { useState } from 'react';
import type { StewardView } from '@ct/protocol';
import { MyRole as Card, TableNotes } from '../player/autoplay';
import { Messages } from '../player/parts';
import { Section } from '../storyteller/common';
import { Button } from '../ui/ui';
import styles from './steward.module.css';

/** The steward's own character and results, as their phone would have them. Covered, so they never read one out. */
export function MyRole({ view }: { view: StewardView }) {
  const [shown, setShown] = useState(false);
  const { me } = view;
  const results = me.me.messages.filter((m) => m.kind !== 'starting');
  return (
    <div>
      <TableNotes view={me} />
      <Section title="My role">
        <Card view={me} asks={false} />
      </Section>
      {me.phase.kind !== 'lobby' && me.phase.kind !== 'setup' && (
        <Section title="My information">
          {shown ? (
            <>
              {!me.me.alive && <p>You are dead.</p>}
              <Messages messages={results} emptyText="You have learned nothing." />
              <Button onClick={() => setShown(false)}>Hide</Button>
            </>
          ) : (
            <div className={styles['covered']}>
              <Button onClick={() => setShown(true)}>Show my information</Button>
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
