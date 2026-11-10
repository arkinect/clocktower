// The small shared component set. Every game rule lives on the server; these only draw.
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import styles from './ui.module.css';

type Variant = 'plain' | 'primary' | 'danger';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  big?: boolean;
  tiny?: boolean;
  on?: boolean;
}

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

export function Button({ variant = 'plain', big, tiny, on, className, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={cx(
        styles['button'],
        variant !== 'plain' && styles[variant],
        big && styles['big'],
        tiny && styles['tiny'],
        on && styles['on'],
        className,
      )}
      {...rest}
    />
  );
}

/** Stacks every label in one cell and shows one, so a button keeps its width as its label changes. */
export function StableLabel({ labels, current }: { labels: ReactNode[]; current: number }) {
  return (
    <span className={styles['stable']}>
      {labels.map((l, i) => (
        <span
          key={i}
          className={i === current ? undefined : styles['stableOff']}
          aria-hidden={i === current ? undefined : true}
        >
          {l}
        </span>
      ))}
    </span>
  );
}

/** For consequential actions: starts a three-second countdown that a second press cancels. Works by keyboard too. */
export function HoldButton({
  onConfirm,
  children,
  disabled,
  seconds = 3,
  variant = 'danger',
  big,
}: {
  onConfirm: () => void;
  children: ReactNode;
  disabled?: boolean;
  seconds?: number;
  variant?: Variant;
  big?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  const action = useRef(onConfirm);
  action.current = onConfirm;
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const press = () => {
    if (armed) {
      window.clearTimeout(timer.current);
      setArmed(false);
      return;
    }
    setArmed(true);
    timer.current = window.setTimeout(() => {
      setArmed(false);
      action.current();
    }, seconds * 1000);
  };
  return (
    <Button
      variant={variant}
      big={big ?? false}
      disabled={disabled ?? false}
      onClick={press}
      className={armed ? styles['armed'] : ''}
    >
      <span className={styles['fill']} style={{ animationDuration: `${seconds}s` }} />
      <span className={styles['label']}>
        <span className={armed ? styles['off'] : ''} aria-hidden={armed || undefined}>
          {children}
        </span>
        <span className={armed ? '' : styles['off']} aria-hidden={!armed || undefined}>
          Cancel
        </span>
      </span>
    </Button>
  );
}

export function Card({ children, tone }: { children: ReactNode; tone?: 'warn' | 'notice' | 'dead' }) {
  return <div className={cx(styles['card'], tone && styles[tone])}>{children}</div>;
}

export function Segments<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; text: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <div className={styles['seg']} role="group" aria-label={label}>
      {options.map((o) => (
        <Button key={o.id} on={value === o.id} aria-pressed={value === o.id} onClick={() => onChange(o.id)}>
          {o.text}
        </Button>
      ))}
    </div>
  );
}

/** A bottom sheet. Escape closes it when it can be closed. */
export function Sheet({ title, children, onClose }: { title: ReactNode; children: ReactNode; onClose?: () => void }) {
  useEffect(() => {
    if (!onClose) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return (
    <div className={styles['sheet']} onClick={onClose}>
      <div
        className={styles['sheetBody']}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

export const SheetActions = ({ children }: { children: ReactNode }) => (
  <div className={styles['sheetActions']}>{children}</div>
);

function useNow(ms = 500) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

export function Countdown({ endsAt, offset }: { endsAt: number | null; offset: number }) {
  const now = useNow() + offset;
  if (!endsAt) return null;
  const left = Math.max(0, Math.round((endsAt - now) / 1000));
  const text = left === 0 ? 'Time is up' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
  return (
    <span className={styles['countdown']} role="timer">
      {text}
    </span>
  );
}

export function Banner({ tone, children }: { tone: 'warn' | 'gold'; children: ReactNode }) {
  return (
    <div className={cx(styles['banner'], styles[tone])} role="status">
      {children}
    </div>
  );
}

/** Says a new version is ready. Dismissing it only hides it until the next load. */
export function UpdateBar() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <Banner tone="gold">
      A new version is ready.{' '}
      <Button tiny onClick={() => location.reload()}>
        Reload
      </Button>{' '}
      <Button tiny aria-label="Dismiss" onClick={() => setDismissed(true)}>
        ×
      </Button>
    </Banner>
  );
}

export function ToastView({ text, onDone }: { text: string; onDone: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDone, 5000);
    return () => clearTimeout(t);
  }, [text, onDone]);
  return (
    <div className={styles['toast']} role="alert" onClick={onDone}>
      {text}
    </div>
  );
}
