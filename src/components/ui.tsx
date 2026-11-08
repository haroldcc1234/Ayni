import { useEffect, useRef, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from 'lucide-react';
import { cn, initials } from '../lib/utils';
import { useAppStore } from '../store/useAppStore';

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'outline'
  | 'danger'
  | 'crisis'
  | 'dark';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-slate-900 text-white hover:bg-slate-700 active:bg-black disabled:bg-slate-300 disabled:text-slate-500',
  secondary:
    'border border-slate-300 bg-white text-slate-900 hover:border-slate-900 hover:bg-slate-50 active:bg-slate-100',
  ghost: 'bg-transparent text-slate-600 hover:bg-slate-100 active:bg-slate-200',
  outline:
    'border border-slate-300 bg-transparent text-slate-700 hover:border-slate-900 hover:text-slate-900',
  danger:
    'bg-crisis-600 text-white hover:bg-crisis-700 active:bg-crisis-800 disabled:bg-crisis-100 disabled:text-crisis-400',
  crisis: 'bg-crisis-600 text-white hover:bg-crisis-700 active:bg-crisis-800',
  dark: 'bg-slate-900 text-white hover:bg-slate-700 active:bg-black',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-xs rounded-lg gap-1.5',
  md: 'h-11 px-4 text-sm rounded-lg gap-2',
  lg: 'h-12 px-5 text-sm rounded-lg gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  full?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  full = false,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center font-semibold tracking-tight transition-colors',
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900',
        'disabled:cursor-not-allowed',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        full && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : null}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

export function Card({
  className,
  children,
  onClick,
  as = 'div',
}: {
  className?: string;
  children: ReactNode;
  onClick?: () => void;
  as?: 'div' | 'button' | 'article';
}) {
  const Tag = as;
  return (
    <Tag
      className={cn(
        'rounded-xl border border-slate-200 bg-white p-4',
        onClick && 'text-left transition-colors hover:border-slate-400 active:bg-slate-50',
        className,
      )}
      onClick={onClick}
    >
      {children}
    </Tag>
  );
}

export function SectionHeader({
  title,
  action,
  description,
}: {
  title: string;
  action?: ReactNode;
  description?: string;
}) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold tracking-tight text-slate-900">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Badge & chips                                                       */
/* ------------------------------------------------------------------ */

type BadgeTone =
  | 'neutral'
  | 'brand'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'crisis';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-slate-50 text-slate-600 border-slate-200',
  brand: 'bg-slate-100 text-slate-700 border-slate-200',
  success: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  warning: 'bg-amber-50 text-amber-800 border-amber-200',
  danger: 'bg-crisis-50 text-crisis-700 border-crisis-200',
  info: 'bg-sky-50 text-sky-700 border-sky-200',
  crisis: 'bg-crisis-600 text-white border-crisis-600',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-5 tracking-wide',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Chip({
  active,
  children,
  onClick,
  className,
}: {
  active?: boolean;
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={Boolean(active)}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors',
        active
          ? 'border-slate-900 bg-slate-900 text-white'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400 hover:text-slate-900',
        className,
      )}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Avatar                                                              */
/* ------------------------------------------------------------------ */

const AVATAR_SIZES = {
  sm: 'h-9 w-9 text-[11px]',
  md: 'h-11 w-11 text-xs',
  lg: 'h-16 w-16 text-sm',
  xl: 'h-20 w-20 text-base',
};

const AVATAR_TONES = ['bg-slate-900', 'bg-stone-700', 'bg-zinc-800', 'bg-neutral-700'];

function avatarTone(seed: string) {
  const total = seed.split('').reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return AVATAR_TONES[total % AVATAR_TONES.length];
}

export function Avatar({
  name,
  color = '',
  size = 'md',
  verified = false,
  className,
}: {
  name: string;
  color?: string;
  size?: keyof typeof AVATAR_SIZES;
  verified?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span
        className={cn(
          'inline-flex items-center justify-center rounded-lg font-semibold tracking-tight text-white',
          avatarTone(name + color),
          AVATAR_SIZES[size],
        )}
        aria-hidden
      >
        {initials(name)}
      </span>
      {verified ? (
        <span
          className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-slate-900 text-white"
          aria-label="Vecino verificado" role="img" title="Vecino verificado"
        >
          <CheckCircle2 size={11} aria-hidden />
        </span>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Forms                                                               */
/* ------------------------------------------------------------------ */

const FIELD_BASE =
  'w-full rounded-lg border border-slate-300 bg-white px-3.5 text-slate-900 placeholder:text-slate-400 transition focus:border-slate-900 focus:outline-none focus:ring-1 focus:ring-slate-900 disabled:bg-slate-50';

export function Label({
  children,
  htmlFor,
  hint,
}: {
  children: ReactNode;
  htmlFor?: string;
  hint?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 flex items-baseline justify-between gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-slate-500"
    >
      <span>{children}</span>
      {hint ? <span className="normal-case tracking-normal text-slate-400">{hint}</span> : null}
    </label>
  );
}

export function Input({
  label,
  hint,
  error,
  className,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: string;
  hint?: string;
  error?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div>
      {label ? (
        <Label htmlFor={inputId} hint={hint}>
          {label}
        </Label>
      ) : null}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? inputId + '-error' : props['aria-describedby']}
        className={cn(FIELD_BASE, 'h-11 text-sm', error && 'border-crisis-500', className)}
        {...props}
      />
      {error ? <p role="alert" id={inputId + '-error'} className="mt-1 text-[11px] font-medium text-crisis-700">{error}</p> : null}
    </div>
  );
}

export function Textarea({
  label,
  hint,
  className,
  id,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label?: string;
  hint?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div>
      {label ? (
        <Label htmlFor={inputId} hint={hint}>
          {label}
        </Label>
      ) : null}
      <textarea
        id={inputId}
        className={cn(FIELD_BASE, 'min-h-[96px] py-3 text-sm', className)}
        {...props}
      />
    </div>
  );
}

export function Select({
  label,
  hint,
  className,
  id,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string;
  hint?: string;
}) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  return (
    <div>
      {label ? (
        <Label htmlFor={inputId} hint={hint}>
          {label}
        </Label>
      ) : null}
      <select
        id={inputId}
        className={cn(FIELD_BASE, 'h-11 appearance-none pr-10 text-sm', className)}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between gap-4 py-3 text-left"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-900">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[11px] text-slate-500">{description}</span>
        ) : null}
      </span>
      <span
        className={cn(
          'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors',
          checked ? 'bg-slate-900' : 'bg-slate-300',
        )}
      >
        <span
          className={cn(
            'inline-block h-5 w-5 rounded-full bg-white transition-transform',
            checked ? 'translate-x-5' : 'translate-x-0.5',
          )}
        />
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Sheet & modal                                                       */
/* ------------------------------------------------------------------ */

export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const root = document.getElementById('root');
    const wasInert = root?.inert ?? false;
    if (root) root.inert = true;
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab' || !panel.current) return;
      const items = Array.from(panel.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
      )).filter(item => item.getClientRects().length > 0 && item.tabIndex >= 0);
      const first = items[0], last = items[items.length - 1];
      if (!first || (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current))) {
        event.preventDefault(); (last ?? panel.current).focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
      if (root) root.inert = wasInert;
      previousFocus?.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-hidden="true" tabIndex={-1}
        className="absolute inset-0 bg-slate-950/45"
        onClick={onClose}
      />
      <div
        ref={panel} tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-[11px] text-slate-500">{description}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:border-slate-400 hover:text-slate-900"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>
        <div className="hide-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer ? (
          <div className="safe-bottom border-t border-slate-200 px-5 pt-3">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ */
/* Feedback                                                            */
/* ------------------------------------------------------------------ */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 px-6 py-10 text-center">
      {icon ? <div className="mb-3 text-slate-300">{icon}</div> : null}
      <p className="text-sm font-semibold text-slate-900">{title}</p>
      {description ? (
        <p className="mt-1 max-w-xs text-[11px] leading-relaxed text-slate-500">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function LoadingScreen({ label = 'Preparando tu barrio…' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas px-6">
      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold tracking-tight text-white">
        360
      </div>
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <Loader2 size={14} className="animate-spin" />
        {label}
      </div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin text-slate-900', className)} size={20} />;
}

const TOAST_ICONS = {
  success: CheckCircle2,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const TOAST_STYLES = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  error: 'border-crisis-200 bg-crisis-50 text-crisis-900',
  warning: 'border-amber-200 bg-amber-50 text-amber-900',
  info: 'border-sky-200 bg-sky-50 text-sky-900',
};

export function ToastHost() {
  const toasts = useAppStore((state) => state.toasts);
  const dismiss = useAppStore((state) => state.dismissToast);

  return createPortal(
    <div aria-live="polite" aria-relevant="additions" className="pointer-events-none fixed inset-x-0 top-0 z-[90] flex flex-col items-center gap-2 px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
      {toasts.map((toast) => {
        const Icon = TOAST_ICONS[toast.tone];
        return (
          <div
            key={toast.id}
            role="status"
            className={cn(
              'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-lg border px-4 py-3',
              TOAST_STYLES[toast.tone],
            )}
          >
            <Icon size={17} className="mt-0.5 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold leading-snug">{toast.title}</p>
              {toast.description ? (
                <p className="mt-0.5 text-[11px] leading-snug opacity-80">{toast.description}</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="shrink-0 rounded p-1 opacity-60 hover:opacity-100"
              aria-label="Cerrar aviso"
            >
              <X size={13} />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  return (
    <div className={cn('h-1.5 w-full overflow-hidden rounded-full bg-slate-200', className)}>
      <div
        className="h-full rounded-full bg-current transition-[width]"
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}
