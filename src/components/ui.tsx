import { LoaderCircle, X, type LucideIcon } from 'lucide-react'
import {
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react'
import { cn } from '../lib/utils'

/* ------------------------------------------------------------------ */
/* Boutons                                                             */
/* ------------------------------------------------------------------ */

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'accent' | 'danger' | 'soft'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon' | 'icon-sm'

const BTN_BASE =
  'inline-flex items-center justify-center gap-2 font-semibold select-none whitespace-nowrap transition-[background-color,color,box-shadow,transform,border-color] duration-150 active:scale-[.97] disabled:pointer-events-none disabled:opacity-50'

const BTN_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-white shadow-[0_10px_24px_-12px_var(--brand)] hover:bg-brand-strong',
  secondary: 'surface text-fg hover:border-line-strong',
  ghost: 'text-muted hover:bg-sunken hover:text-fg',
  accent: 'bg-accent text-[#1d2c5e] shadow-[0_10px_24px_-12px_var(--accent-strong)] hover:bg-accent-strong',
  danger: 'border border-brand/30 text-brand hover:bg-brand-soft',
  soft: 'bg-brand-soft text-brand hover:bg-brand/20',
}

const BTN_SIZES: Record<ButtonSize, string> = {
  sm: 'h-8 rounded-lg px-3 text-[13px]',
  md: 'h-10 rounded-xl px-4 text-sm',
  lg: 'h-12 rounded-2xl px-5 text-[15px]',
  icon: 'h-10 w-10 rounded-xl',
  'icon-sm': 'h-8 w-8 rounded-lg',
}

export function buttonClass(variant: ButtonVariant = 'primary', size: ButtonSize = 'md', extra?: string) {
  return cn(BTN_BASE, BTN_VARIANTS[variant], BTN_SIZES[size], extra)
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: LucideIcon
  ref?: Ref<HTMLButtonElement>
}

export function Button({ variant = 'primary', size = 'md', loading, icon: Icon, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClass(variant, size, className)} disabled={disabled || loading} {...rest}>
      {loading ? <LoaderCircle className="size-4 animate-spin" /> : Icon ? <Icon className="size-4 shrink-0" /> : null}
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/* Champs                                                              */
/* ------------------------------------------------------------------ */

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon
  trailing?: ReactNode
  ref?: Ref<HTMLInputElement>
}

export function Input({ icon: Icon, trailing, className, ...rest }: InputProps) {
  return (
    <div className={cn('relative flex items-center', className)}>
      {Icon && <Icon className="pointer-events-none absolute left-3.5 size-[18px] text-subtle" aria-hidden />}
      <input
        className={cn(
          'h-11 w-full rounded-xl border border-line bg-elev text-[15px] text-fg shadow-[inset_0_1px_2px_rgb(0_0_0/0.04)] outline-none transition placeholder:text-subtle',
          'focus:border-info focus:ring-4 focus:ring-info/15',
          Icon ? 'pl-10' : 'pl-3.5',
          trailing ? 'pr-11' : 'pr-3.5',
        )}
        {...rest}
      />
      {trailing && <div className="absolute right-1.5 flex items-center">{trailing}</div>}
    </div>
  )
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-[13px] font-semibold text-muted">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-subtle">{hint}</p>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Contrôle segmenté                                                   */
/* ------------------------------------------------------------------ */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = 'md',
  className,
  ariaLabel,
}: {
  value: T
  onChange(v: T): void
  options: { value: T; label: ReactNode; count?: number; icon?: LucideIcon; title?: string }[]
  size?: 'sm' | 'md'
  className?: string
  ariaLabel?: string
}) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className={cn('inline-flex rounded-xl border border-line bg-sunken p-1', className)}>
      {options.map((o) => {
        const active = o.value === value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
              active ? 'bg-elev text-fg shadow-sm ring-1 ring-line' : 'text-muted hover:text-fg',
            )}
          >
            {Icon && <Icon className="size-4" />}
            {o.label}
            {o.count != null && (
              <span className={cn('rounded-md px-1.5 text-[11px] tabular-nums', active ? 'bg-brand-soft text-brand' : 'bg-elev/60 text-subtle')}>
                {o.count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Progression                                                         */
/* ------------------------------------------------------------------ */

export function ProgressBar({ value, className, size = 'md' }: { value: number; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const v = Math.max(0, Math.min(1, value))
  const complete = v >= 1
  return (
    <div
      className={cn('w-full overflow-hidden rounded-full bg-sunken', size === 'sm' ? 'h-1.5' : size === 'lg' ? 'h-3' : 'h-2', className)}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v * 100)}
    >
      <div
        className={cn('h-full rounded-full transition-[width] duration-700 ease-out', complete ? 'holo-fill' : 'bg-gradient-to-r from-brand via-[#ff7a3d] to-accent')}
        style={{ width: `${v * 100}%` }}
      />
    </div>
  )
}

export function ProgressRing({
  value,
  size = 96,
  stroke = 10,
  children,
  className,
}: {
  value: number
  size?: number
  stroke?: number
  children?: ReactNode
  className?: string
}) {
  const id = useId()
  const v = Math.max(0, Math.min(1, value))
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className={cn('relative inline-grid place-items-center', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={`g${id}`} x1="0" y1="0" x2="1" y2="1">
            {v >= 1 ? (
              <>
                <stop offset="0" stopColor="#ff7a59" />
                <stop offset=".35" stopColor="#ffcb05" />
                <stop offset=".65" stopColor="#5fd38d" />
                <stop offset="1" stopColor="#5aa2f0" />
              </>
            ) : (
              <>
                <stop offset="0" stopColor="var(--brand)" />
                <stop offset="1" stopColor="var(--accent)" />
              </>
            )}
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#g${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v)}
          style={{ transition: 'stroke-dashoffset .8s cubic-bezier(.22,1,.36,1)' }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">{children}</div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Fenêtre modale / feuille (élément <dialog> natif : focus, Échap…)   */
/* ------------------------------------------------------------------ */

export function Sheet({
  open,
  onClose,
  children,
  className,
  title,
  size = 'lg',
}: {
  open: boolean
  onClose(): void
  children: ReactNode
  className?: string
  title?: string
  size?: 'md' | 'lg' | 'xl'
}) {
  const ref = useRef<HTMLDialogElement>(null)
  // Le contenu reste affiché pendant l'animation de fermeture.
  const [rendered, setRendered] = useState(open)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    else if (!open && d.open) d.close()
    if (open) {
      setRendered(true)
      return
    }
    const t = setTimeout(() => setRendered(false), 320)
    return () => clearTimeout(t)
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose()
      }}
      className={cn(
        'fixed inset-x-0 bottom-0 top-auto m-0 max-h-[94dvh] w-full max-w-none overflow-hidden rounded-t-[28px] border border-line bg-elev p-0 text-fg shadow-[var(--shadow-pop)]',
        'sm:inset-0 sm:m-auto sm:max-h-[90dvh] sm:rounded-[28px]',
        size === 'md' && 'sm:max-w-lg',
        size === 'lg' && 'sm:max-w-3xl',
        size === 'xl' && 'sm:max-w-5xl',
        'translate-y-8 opacity-0 transition-[opacity,translate,overlay,display] transition-discrete duration-300 ease-out open:translate-y-0 open:opacity-100 starting:open:translate-y-8 starting:open:opacity-0',
        className,
      )}
    >
      {(open || rendered) && (
        <div className="relative flex max-h-[94dvh] flex-col sm:max-h-[90dvh]">
          <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-line-strong sm:hidden" aria-hidden />
          <button
            type="button"
            onClick={onClose}
            aria-label="Fermer"
            className="absolute right-3 top-3 z-20 grid size-9 place-items-center rounded-full bg-sunken/80 text-muted backdrop-blur transition hover:bg-sunken hover:text-fg"
          >
            <X className="size-5" />
          </button>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        </div>
      )}
    </dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Divers                                                              */
/* ------------------------------------------------------------------ */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-sunken', className)} />
}

export function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={cn('size-5 animate-spin text-brand', className)} />
}

export function PageSpinner() {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <Spinner className="size-8" />
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={cn('surface flex flex-col items-center rounded-3xl px-6 py-12 text-center', className)}>
      <div className="relative mb-4 grid size-16 place-items-center rounded-2xl bg-brand-soft text-brand">
        <Icon className="size-8" />
        <span className="absolute -right-1 -top-1 size-4 rounded-full border-2 border-elev bg-accent" />
      </div>
      <h3 className="text-xl font-semibold">{title}</h3>
      {children && <div className="mt-2 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'accent' | 'info' | 'success'; className?: string }) {
  const tones = {
    neutral: 'bg-sunken text-muted',
    brand: 'bg-brand-soft text-brand',
    accent: 'bg-accent-soft text-[#8a6100] dark:text-accent',
    info: 'bg-info-soft text-info',
    success: 'bg-success-soft text-success',
  }
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)}>{children}</span>
}

export function SectionHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-xl font-semibold sm:text-2xl">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

export function PageHeader({ title, subtitle, action, eyebrow }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4 sm:mb-8">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 text-xs font-bold uppercase tracking-[0.14em] text-brand">{eyebrow}</div>}
        <h1 className="text-3xl font-semibold sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1.5 max-w-2xl text-[15px] text-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </header>
  )
}
