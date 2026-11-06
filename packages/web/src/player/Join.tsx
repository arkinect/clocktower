import { useCallback, useEffect, useState } from 'react';
import type { RolePreference } from '@ct/protocol';
import { api, type NameRow } from '../app/http';
import { Button, Card, Segments } from '../ui/ui';
import styles from './player.module.css';

const PREFERENCES: { id: RolePreference; text: string }[] = [
  { id: 'none', text: 'No preference' },
  { id: 'townsfolk', text: 'Townsfolk' },
  { id: 'outsider', text: 'Outsider' },
  { id: 'minion', text: 'Minion' },
  { id: 'demon', text: 'Demon' },
];

export function Join({
  code,
  passwordRequired,
  notice,
  onJoined,
}: {
  code: string;
  passwordRequired: boolean;
  notice: string | null;
  onJoined: (id: string) => void;
}) {
  const [mode, setMode] = useState<'join' | 'rejoin'>('join');
  const [name, setName] = useState('');
  const [preference, setPreference] = useState<RolePreference>('none');
  const [wantsStoryteller, setWantsStoryteller] = useState(false);
  const [password, setPassword] = useState('');
  const [unlocked, setUnlocked] = useState(!passwordRequired);
  const [players, setPlayers] = useState<NameRow[] | null>(null);
  const [hasStoryteller, setHasStoryteller] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    async (pw: string) => {
      const r = await api.names(code, pw);
      if (r.status === 404 || r.ok) {
        setPlayers(r.data?.players ?? []);
        setHasStoryteller(r.data?.hasStoryteller ?? false);
        setUnlocked(true);
        setError(null);
      } else {
        setError(r.error ?? 'Something went wrong.');
      }
    },
    [code],
  );

  useEffect(() => {
    if (unlocked) void load(password);
    // The password only matters when it is first entered.
  }, [unlocked, mode, load]);

  const title = (
    <h1 className={styles['title']}>
      Clocktower
      <br />
      <span>Night Assistant</span>
    </h1>
  );

  if (!unlocked) {
    const submit = () => void load(password.trim());
    return (
      <div className={styles['join']}>
        {title}
        <Card>
          <p>This game is private. Enter the password from your Storyteller.</p>
          <label>
            Password
            <input
              type="password"
              value={password}
              autoFocus
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submit();
              }}
            />
          </label>
          {error && <div className="error">{error}</div>}
          <Button variant="primary" big disabled={!password.trim()} onClick={submit}>
            Continue
          </Button>
        </Card>
      </div>
    );
  }

  const secret = password.trim() ? { password: password.trim() } : {};

  const join = async () => {
    setBusy(true);
    setError(null);
    const r = await api.join(code, {
      name: name.trim(),
      rolePreference: preference,
      wantsStoryteller: wantsStoryteller && !hasStoryteller,
      ...secret,
    });
    setBusy(false);
    if (r.ok && r.data) onJoined(r.data.playerId);
    else setError(r.error ?? 'Something went wrong.');
  };

  const rejoin = async (playerId: string) => {
    const r = await api.rejoin(code, { playerId, ...secret });
    if (r.ok && r.data) onJoined(r.data.playerId);
    else setError(r.error ?? 'Something went wrong.');
  };

  return (
    <div className={styles['join']}>
      {title}
      {notice && <Card tone="notice">{notice}</Card>}
      <Segments
        label="Join or rejoin"
        options={[
          { id: 'join', text: 'Join' },
          { id: 'rejoin', text: "I'm already in this game" },
        ]}
        value={mode}
        onChange={setMode}
      />
      {mode === 'join' ? (
        <Card>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim() && !busy) void join();
            }}
          >
            <label>
              Your name
              <input
                value={name}
                maxLength={24}
                autoFocus
                placeholder="Name"
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Role type you would like
              <select value={preference} onChange={(e) => setPreference(e.target.value as RolePreference)}>
                {PREFERENCES.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.text}
                  </option>
                ))}
              </select>
            </label>
            {players && !hasStoryteller && (
              <label className={styles['check']}>
                <input
                  type="checkbox"
                  checked={wantsStoryteller}
                  onChange={(e) => setWantsStoryteller(e.target.checked)}
                />
                I am the Storyteller
              </label>
            )}
            {error && <div className="error">{error}</div>}
            <Button type="submit" variant="primary" big disabled={busy || !name.trim()}>
              Join game
            </Button>
          </form>
        </Card>
      ) : (
        <Card>
          <p className="muted">Pick your name to continue on this device.</p>
          {error && <div className="error">{error}</div>}
          <div className={styles['nameList']}>
            {players?.length ? (
              players.map((p) => (
                <Button key={p.id} onClick={() => void rejoin(p.id)}>
                  {p.name}
                  {p.isStoryteller ? ' (Storyteller)' : ''}
                </Button>
              ))
            ) : (
              <p className="muted">Nobody has joined yet.</p>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
