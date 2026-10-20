import { createContext, useCallback, useContext, useEffect, useRef, useState, type ButtonHTMLAttributes, type ComponentProps, type ReactNode, type SelectHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, ArrowDownRight, ArrowUpRight, CheckCircle2, ChevronDown, Inbox, Loader2, Minus, RefreshCw, X } from 'lucide-react';
import { CARD_METHODS, cardTotal, isCardMethod, methodColor, methodLabel, money, percentChange } from '../lib/format';

export const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

// ---------- Buttons ----------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-primary-fg hover:opacity-90 shadow-soft',
  secondary: 'bg-surface text-ink border border-line hover:bg-surface-2 shadow-soft',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger: 'bg-danger text-white hover:opacity-90 shadow-soft',
  success: 'bg-success text-white hover:opacity-90 shadow-soft',
};

export function Button({ variant = 'secondary', size = 'md', loading, icon, children, className, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' | 'lg'; loading?: boolean; icon?: ReactNode }) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none select-none',
        size === 'sm' && 'h-8 px-3 text-[13px]',
        size === 'md' && 'h-9 px-3.5 text-sm',
        size === 'lg' && 'h-11 px-5 text-[15px]',
        variants[variant],
        className,
      )}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cx('inline-flex size-9 items-center justify-center rounded-lg text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink', className)}
    >
      {children}
    </button>
  );
}

// ---------- Surfaces ----------

export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={cx('rounded-xl border border-line bg-surface shadow-soft print-plain', padded && 'p-4 sm:p-5', className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-tight text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[13px] text-ink-3">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-[22px] font-semibold tracking-tight text-ink sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-ink-3">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ---------- Stats ----------

export function Delta({ current, previous, className }: { current: number; previous: number; className?: string }) {
  const change = percentChange(current, previous);
  if (change === null) return <span className={cx('text-xs font-medium text-ink-3', className)}>Yangi</span>;
  const rounded = Math.round(change * 10) / 10;
  const Icon = rounded > 0 ? ArrowUpRight : rounded < 0 ? ArrowDownRight : Minus;
  return (
    <span className={cx('inline-flex items-center gap-0.5 text-xs font-medium num', rounded > 0 ? 'text-up' : rounded < 0 ? 'text-down' : 'text-ink-3', className)}>
      <Icon className="size-3.5" />
      {Math.abs(rounded).toString().replace('.', ',')}%
    </span>
  );
}

export function StatCard({ label, value, previous, hint, accent, loading, format = money, onClick, expanded }: {
  label: string; value: number; previous?: number; hint?: ReactNode; accent?: string; loading?: boolean; format?: (n: number) => string;
  onClick?: () => void; expanded?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
        {accent && <span className="size-2 rounded-full" style={{ background: accent }} />}
        {label}
        {onClick && <ChevronDown className={cx('ml-auto size-4 text-ink-3 transition-transform', expanded && 'rotate-180')} />}
      </div>
      {loading ? (
        <div className="skeleton mt-3 h-7 w-3/4" />
      ) : (
        <div className="mt-2 text-lg font-semibold tracking-tight text-ink num min-[420px]:text-[22px] sm:text-2xl">{format(value)}</div>
      )}
      <div className="mt-1.5 flex min-h-5 items-center gap-2 text-xs text-ink-3">
        {!loading && previous !== undefined && <Delta current={value} previous={previous} />}
        {hint && <span className="truncate">{hint}</span>}
      </div>
    </>
  );
  if (!onClick) return <Card className="anim-rise min-w-0">{body}</Card>;
  return (
    <button type="button" onClick={onClick} aria-expanded={expanded}
      className={cx('anim-rise min-w-0 rounded-xl border bg-surface p-4 text-left shadow-soft transition-colors hover:bg-surface-2 sm:p-5', expanded ? 'border-[var(--card)]' : 'border-line')}>
      {body}
    </button>
  );
}

type MethodSums = { cash: number; card: number; yandex: number; pochta: number };

/** What the Karta total is made of: plain card, Yandex and Pochta. */
export function CardBreakdown({ t, p, className }: { t?: MethodSums | null; p?: MethodSums | null; className?: string }) {
  return (
    <div className={cx('anim-rise grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line', className)}>
      {CARD_METHODS.map((m) => (
        <div key={m.value} className="min-w-0 bg-surface px-3 py-2.5 sm:px-4">
          <div className="flex items-center gap-1.5 text-xs text-ink-3"><span className="size-1.5 rounded-full" style={{ background: m.color }} />{m.label}</div>
          <div className="mt-0.5 text-[13px] font-semibold leading-snug text-ink num sm:text-base">{money(t?.[m.value] || 0)}</div>
          {p && <div className="mt-0.5 text-xs"><Delta current={t?.[m.value] || 0} previous={p[m.value]} /></div>}
        </div>
      ))}
    </div>
  );
}

/** Naqd and Karta cards; tapping Karta opens its Karta / Yandex / Pochta split below. Place inside a grid. */
export function MethodStatCards({ t, p, loading, total }: { t?: MethodSums | null; p?: MethodSums | null; loading?: boolean; total?: number }) {
  const [open, setOpen] = useState(false);
  const card = cardTotal(t);
  const share = (v: number) => (total ? `${Math.round((v / total) * 100)}% ulush` : undefined);
  return (
    <>
      <StatCard label="Naqd" accent="var(--cash)" value={t?.cash || 0} previous={p ? p.cash : undefined} loading={loading} hint={share(t?.cash || 0)} />
      <StatCard label="Karta" accent="var(--card)" value={card} previous={p ? cardTotal(p) : undefined} loading={loading}
        hint={open ? 'Yopish uchun bosing' : [share(card), 'Yandex, Pochta ichida'].filter(Boolean).join(' · ')} onClick={() => setOpen((o) => !o)} expanded={open} />
      {open && <CardBreakdown t={t} p={p} className="col-span-full" />}
    </>
  );
}

/** Table header cells: Naqd, Karta (tap to show its Karta / Yandex / Pochta columns). */
export function MethodHeads({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <>
      <th className={cx(th, 'text-right')}>Naqd</th>
      <th className={cx(th, 'text-right')}>
        <button type="button" onClick={onToggle} aria-expanded={open} className="inline-flex items-center gap-1 font-medium hover:text-ink">
          Karta<ChevronDown className={cx('size-3.5 transition-transform', open && 'rotate-180')} />
        </button>
      </th>
      {open && CARD_METHODS.map((m) => <th key={m.value} className={cx(th, 'bg-surface-2 text-right font-normal')}>{m.value === 'card' ? 'shundan karta' : m.label}</th>)}
    </>
  );
}

export function MethodCells({ row, open, bold }: { row?: MethodSums | null; open: boolean; bold?: boolean }) {
  const cls = cx(td, 'text-right num', bold && 'font-semibold');
  return (
    <>
      <td className={cls}>{money(row?.cash || 0)}</td>
      <td className={cls}>{money(cardTotal(row))}</td>
      {open && CARD_METHODS.map((m) => <td key={m.value} className={cx(td, 'bg-surface-2/50 text-right text-ink-2 num', bold && 'font-semibold')}>{money(row?.[m.value] || 0)}</td>)}
    </>
  );
}

// ---------- Form controls ----------

export function Field({ label, error, hint, children, required, htmlFor }: { label: string; error?: string; hint?: ReactNode; children: ReactNode; required?: boolean; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-medium text-ink-2">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-xs text-danger anim-fade"><AlertCircle className="size-3.5" />{error}</p>
      ) : hint ? (
        <p className="text-xs text-ink-3">{hint}</p>
      ) : null}
    </div>
  );
}

const controlBase = 'rounded-lg border bg-surface-2 px-3 text-sm text-ink placeholder:text-ink-3 transition-colors outline-none focus:bg-surface focus:border-[var(--card)] focus:ring-4 focus:ring-[color-mix(in_srgb,var(--card)_15%,transparent)] disabled:bg-surface-2 disabled:text-ink-3';

export function Input({ invalid, className, ...rest }: ComponentProps<'input'> & { invalid?: boolean }) {
  return <input {...rest} className={cx(controlBase, 'w-full h-10', invalid ? 'border-danger' : 'border-line', className)} />;
}

export function Textarea({ invalid, className, ...rest }: ComponentProps<'textarea'> & { invalid?: boolean }) {
  return <textarea {...rest} className={cx(controlBase, 'w-full min-h-20 py-2', invalid ? 'border-danger' : 'border-line', className)} />;
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={cx(controlBase, 'h-9 border-line pr-8 appearance-none bg-[length:16px] bg-[right_8px_center] bg-no-repeat', className)}
      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%238a94a6' stroke-width='2'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")" }}>
      {children}
    </select>
  );
}

export function Segmented<T extends string>({ value, onChange, options, size = 'md', className }: {
  value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode }>; size?: 'md' | 'lg'; className?: string;
}) {
  return (
    <div role="radiogroup" className={cx('inline-flex rounded-lg border border-line bg-surface-2 p-0.5', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'flex flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 font-medium transition-all duration-150',
            size === 'lg' ? 'h-10 text-sm' : 'h-8 text-[13px]',
            value === o.value ? 'bg-surface text-ink shadow-soft' : 'text-ink-3 hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------- Feedback ----------

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'cash' | 'card' | 'yandex' | 'pochta' | 'danger' | 'success' | 'warn'; className?: string }) {
  const tones = {
    neutral: 'bg-surface-2 text-ink-2 border-line',
    cash: 'bg-[color-mix(in_srgb,var(--cash)_10%,transparent)] text-ink border-[color-mix(in_srgb,var(--cash)_30%,transparent)]',
    card: 'bg-[color-mix(in_srgb,var(--card)_10%,transparent)] text-ink border-[color-mix(in_srgb,var(--card)_30%,transparent)]',
    yandex: 'bg-[color-mix(in_srgb,var(--yandex)_12%,transparent)] text-ink border-[color-mix(in_srgb,var(--yandex)_35%,transparent)]',
    pochta: 'bg-[color-mix(in_srgb,var(--pochta)_10%,transparent)] text-ink border-[color-mix(in_srgb,var(--pochta)_30%,transparent)]',
    danger: 'bg-danger-soft text-danger border-[color-mix(in_srgb,var(--danger)_25%,transparent)]',
    success: 'bg-success-soft text-success border-[color-mix(in_srgb,var(--success)_25%,transparent)]',
    warn: 'bg-warn-soft text-warn border-[color-mix(in_srgb,var(--warn)_25%,transparent)]',
  };
  return <span className={cx('inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-xs font-medium whitespace-nowrap', tones[tone], className)}>{children}</span>;
}

export function MethodBadge({ method }: { method: string }) {
  return (
    <Badge tone={method === 'cash' ? 'cash' : isCardMethod(method) ? 'card' : 'neutral'}>
      <span className="size-1.5 rounded-full" style={{ background: methodColor(method) }} />
      {methodLabel(method)}
    </Badge>
  );
}

export function EmptyState({ title, description, action, icon }: { title: string; description?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center anim-fade">
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl border border-line bg-surface-2 text-ink-3">
        {icon || <Inbox className="size-5" />}
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-sm text-[13px] text-ink-3">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-10 text-center anim-fade">
      <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-danger-soft text-danger">
        <AlertCircle className="size-5" />
      </div>
      <p className="text-sm font-medium text-ink">Maʼlumotni yuklab boʻlmadi</p>
      <p className="mt-1 max-w-sm text-[13px] text-ink-3">{message}</p>
      {onRetry && <Button className="mt-4" size="sm" icon={<RefreshCw className="size-3.5" />} onClick={onRetry}>Qayta urinish</Button>}
    </div>
  );
}

export function Alert({ tone = 'danger', children }: { tone?: 'danger' | 'success' | 'warn'; children: ReactNode }) {
  const map = { danger: 'bg-danger-soft text-danger', success: 'bg-success-soft text-success', warn: 'bg-warn-soft text-warn' };
  const Icon = tone === 'success' ? CheckCircle2 : AlertCircle;
  return (
    <div className={cx('flex items-start gap-2 rounded-lg px-3 py-2.5 text-[13px] anim-fade', map[tone])}>
      <Icon className="mt-px size-4 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export function SkeletonRows({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3.5">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="skeleton h-3.5" style={{ width: `${c === 0 ? 18 : 100 / cols}%`, opacity: 1 - r * 0.12 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ---------- Modal ----------

export function Modal({ open, onClose, title, description, children, footer, size = 'md' }: {
  open: boolean; onClose: () => void; title: string; description?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg';
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Callers pass a new onClose on every render; reading it through a ref keeps the effect below
  // from re-running (and stealing focus back to the first field) while the user types.
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    const previous = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, select, textarea, button[data-autofocus]');
    first?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus?.();
    };
  }, [open]);
  if (!open) return null;
  // Portal to <body> so page wrappers (transforms, z-index) and the mobile tab bar never cover the dialog.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/25 backdrop-blur-sm anim-fade" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cx(
          'relative flex max-h-[92vh] max-h-[92dvh] w-full flex-col rounded-t-2xl border border-line bg-surface shadow-pop anim-pop sm:rounded-2xl',
          size === 'sm' && 'sm:max-w-sm', size === 'md' && 'sm:max-w-md', size === 'lg' && 'sm:max-w-2xl',
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
          </div>
          <IconButton label="Yopish" onClick={onClose} className="-mr-2 -mt-1"><X className="size-4" /></IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-line px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------- Toasts ----------

interface Toast { id: number; tone: 'success' | 'error'; title: string; description?: string }
const ToastContext = createContext<(t: Omit<Toast, 'id'>) => void>(() => undefined);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list.slice(-3), { ...t, id }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), t.tone === 'error' ? 6000 : 3500);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:pr-6">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-pop anim-pop">
            {t.tone === 'success' ? <CheckCircle2 className="mt-px size-5 shrink-0 text-success" /> : <AlertCircle className="mt-px size-5 shrink-0 text-danger" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">{t.title}</p>
              {t.description && <p className="mt-0.5 text-[13px] text-ink-3">{t.description}</p>}
            </div>
            <button aria-label="Yopish" className="text-ink-3 hover:text-ink" onClick={() => setToasts((l) => l.filter((x) => x.id !== t.id))}>
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ---------- Table primitives ----------

export const th = 'px-4 py-2.5 text-left text-xs font-medium text-ink-3 whitespace-nowrap';
export const td = 'px-4 py-3 text-sm text-ink whitespace-nowrap';

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]?.toUpperCase()).join('') || '?';
  return (
    <span className={cx('inline-flex shrink-0 items-center justify-center rounded-full border border-line bg-surface-2 font-semibold text-ink-2', size === 'sm' ? 'size-7 text-[11px]' : 'size-9 text-xs')}>
      {initials}
    </span>
  );
}
