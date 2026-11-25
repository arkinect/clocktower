// Export and Import, as the Storyteller's Setup has them. Files are read and written by the same code. An imported
// script loses the roles autoplay cannot use, and says so first.
import { useRef, useState } from 'react';
import type { StewardView } from '@ct/protocol';
import { useCommand, useGame, useNames } from '../app/store';
import styles from '../storyteller/console.module.css';
import { downloadJson } from '../storyteller/common';
import {
  MAX_BYTES,
  TOO_BIG,
  buildScript,
  parseScript,
  settingChanges,
  type GameSettings,
  type ScriptFile,
} from '../storyteller/scriptFile';
import { Button, Sheet, SheetActions } from '../ui/ui';

/** Autoplay always tells a player what they have become, so the file's setting for it changes nothing. */
const settingsOf = (view: StewardView): GameSettings => ({ ...view.settings, notifyOnRoleChange: true });

export function ScriptTransfer({ view }: { view: StewardView }) {
  const { catalog } = useGame();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<ScriptFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const read = async (picked: File) => {
    setFile(null);
    setError(null);
    if (picked.size > MAX_BYTES) return setError(TOO_BIG);
    const text = await picked.text().catch(() => null);
    if (text === null) return setError('That file could not be read.');
    const parsed = parseScript(text, catalog);
    if (parsed.ok) setFile(parsed);
    else setError(parsed.error);
  };
  return (
    <>
      <Button
        tiny
        disabled={!view.script.length}
        onClick={() => downloadJson('clocktower-script.json', buildScript(view.script, settingsOf(view), catalog))}
      >
        Export
      </Button>
      <Button tiny onClick={() => input.current?.click()}>
        Import
      </Button>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        aria-label="Script file"
        hidden
        onChange={(e) => {
          const picked = e.target.files?.[0];
          if (picked) void read(picked);
          // So that picking the same file again counts as a change.
          e.target.value = '';
        }}
      />
      {error && (
        <p className={styles['warning']} role="alert">
          {error}
        </p>
      )}
      {file && <ImportSheet view={view} file={file} onClose={() => setFile(null)} />}
    </>
  );
}

function ImportSheet({ view, file, onClose }: { view: StewardView; file: ScriptFile; onClose: () => void }) {
  const { catalog } = useGame();
  const { run, pending } = useCommand();
  const names = useNames();
  const unfit = new Set(catalog.filter((c) => c.notInAutoplay).map((c) => c.roleId));
  const roles = file.roles.filter((r) => !unfit.has(r));
  const lost = file.roles.filter((r) => unfit.has(r));
  const wanted = file.settings && { ...file.settings, notifyOnRoleChange: true };
  const { changes, lines } = settingChanges(settingsOf(view), wanted);
  const apply = async () => {
    if (!(await run({ type: 'steward_script', roleIds: roles })).ok) return;
    if (lines.length && !(await run({ type: 'steward_settings', ...changes })).ok) return;
    onClose();
  };
  return (
    <Sheet title="Import script" onClose={onClose}>
      <p>
        {roles.length} {roles.length === 1 ? 'role' : 'roles'} will replace the {view.script.length} on the script now.
      </p>
      {lost.length > 0 && (
        <p className={styles['warning']}>
          Left out, as autoplay cannot use them: {lost.map((r) => names.roles[r] ?? r).join(', ')}.
        </p>
      )}
      {file.ignored > 0 && <p className="muted">Left out, as they are not in this app: {file.ignored}.</p>}
      {lines.length > 0 ? (
        <ul>
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">The settings stay as they are.</p>
      )}
      <SheetActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={pending} onClick={() => void apply()}>
          Apply
        </Button>
      </SheetActions>
    </Sheet>
  );
}
