import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { PlayerId, StorytellerView } from '@ct/protocol';
import { api } from '../app/http';
import { useCommand } from '../app/store';
import { Button, HoldButton } from '../ui/ui';
import { InputSheet, Section } from './common';
import styles from './console.module.css';

function JoinQr({ code }: { code: string }) {
  const [url, setUrl] = useState('');
  const [image, setImage] = useState('');
  useEffect(() => {
    void api.config().then((r) => {
      const base = (r.data?.publicUrl || location.origin).replace(/\/$/, '');
      const link = `${base}/g/${encodeURIComponent(code)}`;
      setUrl(link);
      void QRCode.toDataURL(link, { margin: 1, width: 220 }).then(setImage);
    });
  }, [code]);
  return (
    <div className={styles['qr']}>
      {image && <img src={image} alt="Join QR code" width={220} height={220} />}
      <div className={styles['mono']}>{url}</div>
    </div>
  );
}

export function Lobby({ view }: { view: StorytellerView }) {
  const { run, pending } = useCommand();
  const [renaming, setRenaming] = useState<{ id: PlayerId; name: string } | null>(null);
  const before = view.phase.kind === 'lobby' || view.phase.kind === 'setup';
  return (
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
                {p.rolePreference !== 'none' ? <span className="muted small"> wants {p.rolePreference}</span> : null}
              </span>
              {before && (
                <>
                  <Button tiny onClick={() => setRenaming({ id: p.id, name: p.name })}>
                    Rename
                  </Button>
                  <HoldButton onConfirm={() => void run({ type: 'remove_player', playerId: p.id })}>Remove</HoldButton>
                </>
              )}
            </li>
          ))}
        </ul>
        {view.phase.kind === 'lobby' && (
          <Button variant="primary" big disabled={pending} onClick={() => void run({ type: 'open_setup' })}>
            Continue to setup
          </Button>
        )}
      </Section>
      <Section title="Join">
        <p className="muted">Players open this link:</p>
        <JoinQr code={view.code} />
      </Section>
      {renaming && (
        <InputSheet
          title={`Rename ${renaming.name}`}
          label="New name"
          initial={renaming.name}
          maxLength={24}
          onClose={() => setRenaming(null)}
          onSave={(name) => run({ type: 'rename_player', playerId: renaming.id, name })}
        />
      )}
    </div>
  );
}
