import { useEffect, useState } from 'react';
import { api, loadToken } from '../api';
import type { AdminCtx } from './AdminApp';

interface Ev { seq: number; ts: number; actor: string | null; type: string; payload: unknown }
interface Build { version: string; commit: string | null; builtAt: string | null; startedAt: number }

const REPO = 'https://github.com/arkinect/clocktower';

function BuildInfo({ build }: { build: Build }) {
  const release = /^\d+\.\d+\.\d+/.test(build.version);
  const name = release ? `v${build.version}` : build.version === 'edge' ? 'edge (latest main, not a release)' : 'development build';
  return (
    <section className="card">
      <h2>Running version</h2>
      <p>
        <b>{release ? <a href={`${REPO}/tree/v${build.version}`} target="_blank" rel="noreferrer">{name}</a> : name}</b>
        {build.commit && <> · commit <a className="mono" href={`${REPO}/commit/${build.commit}`} target="_blank" rel="noreferrer">{build.commit.slice(0, 7)}</a></>}
      </p>
      <p className="muted small">
        {build.builtAt && <>Built {new Date(build.builtAt).toLocaleString()} · </>}
        Server started {new Date(build.startedAt).toLocaleString()}
      </p>
    </section>
  );
}

export function LogPanel({ ctx, code }: { ctx: AdminCtx; code: string }) {
  const [events, setEvents] = useState<Ev[]>([]);
  const [build, setBuild] = useState<Build | null>(null);
  const stamp = ctx.view.serverNow;
  useEffect(() => {
    api(code, '/events', undefined, loadToken(code)).then((r) => { if (r.ok) { setEvents(r.events); setBuild(r.build ?? null); } });
  }, [code, stamp]);
  return (
    <>
      {build && <BuildInfo build={build} />}
      <section className="card">
        <h2>Event log</h2>
        <table className="tbl log">
          <tbody>
            {events.map((e) => (
              <tr key={e.seq}>
                <td className="muted small">{e.seq}</td>
                <td className="small">{new Date(e.ts).toLocaleTimeString()}</td>
                <td>{e.actor ? ctx.names[e.actor] ?? e.actor : 'system'}</td>
                <td><b>{e.type}</b></td>
                <td className="small mono">{JSON.stringify(e.payload)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
