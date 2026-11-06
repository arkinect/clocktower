import { useCallback, useEffect, useState } from 'react';
import type { StorytellerView } from '@ct/protocol';
import { useNames } from '../app/store';
import { Button } from '../ui/ui';
import { Lines, Section } from './common';
import styles from './console.module.css';

export function Story({ view }: { view: StorytellerView }) {
  if (!view.story.length) return <p className="muted">Nothing has happened yet.</p>;
  return (
    <div>
      {view.story.map((e, i) => (
        <Section key={i} title={e.title}>
          <ul className={styles['rows']}>
            {e.rows.map((r, j) => (
              <li key={j}>
                <span className={styles['grow']}>
                  <b>{r.name}</b> <span className="muted small">{r.character}</span>
                  <Lines lines={r.lines} />
                </span>
              </li>
            ))}
          </ul>
          <Lines lines={e.summary} />
        </Section>
      ))}
    </div>
  );
}

interface Exported {
  engineVersion: number;
  log: { now: number; actor: string | null; command: { type: string } & Record<string, unknown> }[];
}

const clock = (at: number) => new Date(at).toLocaleTimeString();

/** Downloads the command log, which is what a bug report needs to replay the game. */
export function reportProblem(code: string, data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `clocktower-${code}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

// The log is not in the view, on purpose: it grows through the night. It comes from the same export a bug report uses.
export function Log({ view }: { view: StorytellerView }) {
  const names = useNames();
  const [data, setData] = useState<Exported | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    const res = await fetch(`/api/g/${encodeURIComponent(view.code)}/export`).catch(() => null);
    if (res?.ok) setData((await res.json()) as Exported);
    else setError('The log could not be loaded.');
  }, [view.code]);
  useEffect(() => {
    void load();
  }, [load]);
  const rows = data?.log ?? [];
  return (
    <Section title={`Command log (${rows.length})`}>
      <div className="row">
        <Button tiny onClick={() => void load()}>
          Refresh
        </Button>
        <Button tiny disabled={!data} onClick={() => reportProblem(view.code, data)}>
          Report a problem
        </Button>
      </div>
      {error && <p className="error">{error}</p>}
      <ol className={styles['events']}>
        {[...rows].reverse().map((e, i) => {
          const { type, ...args } = e.command;
          const detail = JSON.stringify(args);
          return (
            <li key={i}>
              <span className="muted small">{clock(e.now)}</span> <b>{type.replace(/_/g, ' ')}</b>{' '}
              {e.actor ? (names.players[e.actor] ?? 'Storyteller') : ''}
              {detail !== '{}' && <code className={styles['mono']}> {detail}</code>}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}
