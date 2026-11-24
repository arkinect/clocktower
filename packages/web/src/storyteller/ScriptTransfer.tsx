// Export and Import, in the Setup tab's Script section. The file is read here and never sent: applying one sends the
// same commands the checkboxes and settings fields do.
import { useRef, useState } from 'react';
import type { StorytellerView } from '@ct/protocol';
import { useCommand, useGame, useNames } from '../app/store';
import { Button, Sheet, SheetActions } from '../ui/ui';
import { downloadJson } from './common';
import styles from './console.module.css';
import { MAX_BYTES, TOO_BIG, buildScript, parseScript, settingChanges, type ScriptFile } from './scriptFile';

export function ScriptTransfer({ view }: { view: StorytellerView }) {
  const { catalog } = useGame();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<ScriptFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The script is fixed once the game starts, and a new countdown would move a running night's deadline.
  const canImport = view.phase.kind === 'lobby' || view.phase.kind === 'setup';

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
        onClick={() => downloadJson('clocktower-script.json', buildScript(view.script, view.settings, catalog))}
      >
        Export
      </Button>
      {canImport && (
        <>
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
        </>
      )}
      {error && (
        <p className={styles['warning']} role="alert">
          {error}
        </p>
      )}
      {file && canImport && <ImportSheet view={view} file={file} onClose={() => setFile(null)} />}
    </>
  );
}

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

function ImportSheet({ view, file, onClose }: { view: StorytellerView; file: ScriptFile; onClose: () => void }) {
  const { run, pending } = useCommand();
  const names = useNames();
  const { changes, lines } = settingChanges(view.settings, file.settings);
  const offScript = view.players.filter((p) => p.character && !file.roles.includes(p.character));
  const apply = async () => {
    if (!(await run({ type: 'set_script', roleIds: file.roles })).ok) return;
    if (lines.length && !(await run({ type: 'set_settings', ...changes })).ok) return;
    onClose();
  };
  return (
    <Sheet title="Import script" onClose={onClose}>
      <p>
        {count(file.roles.length, 'role')} will replace the {view.script.length} on the script now.
      </p>
      {file.ignored > 0 && (
        <p className="muted">
          {count(file.ignored, 'character')} in the file {file.ignored === 1 ? 'is' : 'are'} not in this app and will be
          left out.
        </p>
      )}
      {lines.length > 0 ? (
        <ul>
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : (
        <p className="muted">The settings stay as they are.</p>
      )}
      {offScript.map((p) => (
        <p key={p.id} className={styles['warning']}>
          ⚠ {p.name} is the {names.roles[p.character as string] ?? p.character}, which is not on this script. They keep
          it until you change it.
        </p>
      ))}
      <SheetActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={pending} onClick={() => void apply()}>
          Apply
        </Button>
      </SheetActions>
    </Sheet>
  );
}
