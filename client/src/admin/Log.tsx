import { useEffect, useState } from 'react';
import { api, loadToken } from '../api';
import type { AdminCtx } from './AdminApp';

interface Ev { seq: number; ts: number; actor: string | null; type: string; payload: unknown }

export function LogPanel({ ctx, code }: { ctx: AdminCtx; code: string }) {
  const [events, setEvents] = useState<Ev[]>([]);
  const stamp = ctx.view.serverNow;
  useEffect(() => {
    api(code, '/events', undefined, loadToken(code)).then((r) => { if (r.ok) setEvents(r.events); });
  }, [code, stamp]);
  return (
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
  );
}
