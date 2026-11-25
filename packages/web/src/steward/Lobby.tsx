import { useState } from 'react';
import type { PlayerId, StewardView } from '@ct/protocol';
import { useCommand } from '../app/store';
import styles from '../storyteller/console.module.css';
import { InputSheet, Section } from '../storyteller/common';
import { JoinQr } from '../storyteller/Lobby';
import { Button, HoldButton } from '../ui/ui';

export function Lobby({ view }: { view: StewardView }) {
  const { run, pending } = useCommand();
  const [renaming, setRenaming] = useState<{ id: PlayerId; name: string } | null>(null);
  const { kind } = view.phase;
  const before = kind === 'lobby' || kind === 'setup';
  return (
    <div>
      <div className={styles['columns']}>
        <Section title={`Players (${view.players.length})`}>
          <ul className={styles['rows']}>
            {view.players.map((p) => (
              <li key={p.id}>
                <span
                  className={p.connected ? styles['dotOn'] : styles['dot']}
                  title={p.connected ? 'Online' : 'Offline'}
                />
                <span className={styles['grow']}>
                  {p.name}
                  {p.id === view.meId ? ' (you)' : ''}
                </span>
                {before && (
                  <>
                    <Button tiny onClick={() => setRenaming({ id: p.id, name: p.name })}>
                      Rename
                    </Button>
                    {p.id !== view.meId && (
                      <HoldButton onConfirm={() => void run({ type: 'steward_remove', playerId: p.id })}>
                        Remove
                      </HoldButton>
                    )}
                  </>
                )}
              </li>
            ))}
          </ul>
          {kind === 'lobby' && (
            <div className="row">
              <Button variant="primary" big disabled={pending} onClick={() => void run({ type: 'steward_open_setup' })}>
                Continue to setup
              </Button>
            </div>
          )}
        </Section>
        <Section title="Join">
          <p className="muted">Players open this link:</p>
          <JoinQr code={view.code} />
        </Section>
      </div>
      {renaming && (
        <InputSheet
          title={`Rename ${renaming.name}`}
          label="New name"
          initial={renaming.name}
          maxLength={24}
          onClose={() => setRenaming(null)}
          onSave={(name) => run({ type: 'steward_rename', playerId: renaming.id, name })}
        />
      )}
    </div>
  );
}
