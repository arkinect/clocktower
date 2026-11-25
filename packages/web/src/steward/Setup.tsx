import type { RoleCard, RoleId, StewardView } from '@ct/protocol';
import { useCommand, useGame, useNames } from '../app/store';
import { typeName } from '../player/parts';
import styles from '../storyteller/console.module.css';
import { Section } from '../storyteller/common';
import { AutoplayToggle, CountsForm, EvilInfo, RoleChecks, SeatOrder, secondsOnBlur } from '../storyteller/Setup';
import { SCRIPT_TYPES, SECONDS, SETTING_LABELS } from '../storyteller/scriptFile';
import { Button, Card, HoldButton } from '../ui/ui';
import { seatedPlayers } from './common';
import { ScriptTransfer } from './ScriptTransfer';

/** Everything here is about the script and the table. Nothing says who holds what, before the deal or after it. */
export function Setup({ view }: { view: StewardView }) {
  const { run } = useCommand();
  const { kind } = view.phase;
  if (kind !== 'lobby' && kind !== 'setup') {
    return (
      <div>
        <Card>The characters are dealt, so only the settings can be changed now.</Card>
        <Settings view={view} />
      </div>
    );
  }
  return (
    <div>
      <AutoplayToggle on />
      <div className={styles['columns']}>
        <div>
          <DealCard view={view} />
          <Seating view={view} />
        </div>
        <div>
          <CountsForm
            target={view.setup.counts}
            overridden={view.setup.source === 'override'}
            players={seatedPlayers(view).length}
            onCounts={(counts) => run({ type: 'steward_counts', counts })}
          />
          <Settings view={view} />
          <Script view={view} />
        </div>
      </div>
    </div>
  );
}

function DealCard({ view }: { view: StewardView }) {
  const { run, pending } = useCommand();
  const { fit } = view.setup;
  return (
    <Section title="Deal">
      <ul className={styles['checks']}>
        {fit.map((line) => (
          <li key={line} className={styles['todo']}>
            ✗ {line}
          </li>
        ))}
        {!fit.length && <li className={styles['done']}>✓ This script can support this many players.</li>}
      </ul>
      {view.phase.kind === 'lobby' ? (
        <Button variant="primary" big disabled={pending} onClick={() => void run({ type: 'steward_open_setup' })}>
          Continue to setup
        </Button>
      ) : (
        <>
          <p className="muted small">Every phone gets its role, and you get yours. It cannot be dealt again.</p>
          <HoldButton
            variant="primary"
            disabled={fit.length > 0 || pending}
            onConfirm={() => void run({ type: 'deal' })}
          >
            Deal characters
          </HoldButton>
        </>
      )}
    </Section>
  );
}

function Seating({ view }: { view: StewardView }) {
  const { run, pending } = useCommand();
  const unseated = view.players.filter((p) => p.seat === null);
  return (
    <Section title="Seating">
      <SeatOrder
        seated={seatedPlayers(view)}
        meId={view.meId}
        pending={pending}
        onOrder={(order) => void run({ type: 'steward_seating', order })}
      />
      {unseated.length > 0 && <p className="muted small">Not seated: {unseated.map((p) => p.name).join(', ')}</p>}
      <div className="row">
        <Button disabled={pending} onClick={() => void run({ type: 'steward_shuffle' })}>
          Randomise
        </Button>
        <Button disabled={pending} onClick={() => void run({ type: 'steward_publish_seating' })}>
          {view.seatingPublished ? 'Republish' : 'Publish to phones'}
        </Button>
      </div>
    </Section>
  );
}

function Settings({ view }: { view: StewardView }) {
  const { run } = useCommand();
  const s = view.settings;
  const seconds = (field: 'countdownSeconds' | 'followUpExtensionSeconds') => ({
    type: 'number' as const,
    min: SECONDS.min,
    max: SECONDS.max,
    defaultValue: s[field],
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      const next = secondsOnBlur(e.target, s[field]);
      if (next !== null) void run({ type: 'steward_settings', [field]: next });
    },
  });
  return (
    <Section title="Settings">
      <EvilInfo
        value={s.evilInfoPolicy}
        onChange={(evilInfoPolicy) => void run({ type: 'steward_settings', evilInfoPolicy })}
      />
      <label className={styles['inline']}>
        <span>{SETTING_LABELS.countdownSeconds}</span>
        <input key={s.countdownSeconds} {...seconds('countdownSeconds')} />
      </label>
      <label className={styles['inline']}>
        <span>{SETTING_LABELS.followUpExtensionSeconds}</span>
        <input key={s.followUpExtensionSeconds} {...seconds('followUpExtensionSeconds')} />
      </label>
      <label className={styles['check']}>
        <input
          type="checkbox"
          checked={s.announceDeaths}
          onChange={(e) => void run({ type: 'steward_settings', announceDeaths: e.target.checked })}
        />
        {SETTING_LABELS.announceDeaths}
      </label>
    </Section>
  );
}

function Script({ view }: { view: StewardView }) {
  const { catalog } = useGame();
  const { run } = useCommand();
  const names = useNames();
  const inScript = catalog.filter((c) => SCRIPT_TYPES.includes(c.type));
  const set = (roleIds: RoleId[]) => void run({ type: 'steward_script', roleIds });
  const unfit = (c: RoleCard) => c.notInAutoplay;
  const reasons = inScript.filter((c) => c.notInAutoplay);
  return (
    <Section title={`Script (${view.script.length} roles)`}>
      {view.dropped.length > 0 && (
        <p className={styles['warning']}>
          Left off the script, as autoplay cannot use them: {view.dropped.map((r) => names.roles[r] ?? r).join(', ')}.
        </p>
      )}
      <div className="row">
        <Button tiny onClick={() => set(inScript.filter((c) => !c.notInAutoplay).map((c) => c.roleId))}>
          All roles
        </Button>
        <Button tiny onClick={() => set([])}>
          Clear
        </Button>
        <ScriptTransfer view={view} />
      </div>
      {SCRIPT_TYPES.map((t) => {
        const roles = inScript.filter((c) => c.type === t);
        if (!roles.length) return null;
        return (
          <div key={t}>
            <h3 className={`type-${t}`}>{typeName(t)}</h3>
            <RoleChecks
              roles={roles}
              on={view.script}
              unfit={unfit}
              onToggle={(id, checked) => set(checked ? [...view.script, id] : view.script.filter((r) => r !== id))}
            />
          </div>
        );
      })}
      {reasons.length > 0 && (
        <details>
          <summary>Roles autoplay cannot use</summary>
          <ul>
            {reasons.map((c) => (
              <li key={c.roleId}>
                {c.name}: {c.notInAutoplay}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Section>
  );
}
