import {
  Check,
  Droplet,
  Eye,
  Flame,
  Gem,
  Heart,
  Leaf,
  Minus,
  Moon,
  Plus,
  Shield,
  Sparkles,
  Star,
  Swords,
  Zap,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from 'react'
import { cardImageSources } from '../lib/images'
import { useCardPhotos } from '../lib/photos'
import { useCatalog } from '../lib/queries'
import { useSettings } from '../lib/settings'
import { ENERGY, energyKey, type EnergyKey } from '../lib/taxonomy'
import type { ImageQuality } from '../lib/tcgdex'
import { cn } from '../lib/utils'
import { LogoMark } from './Logo'

/* ------------------------------------------------------------------ */
/* Image de carte (chargement progressif + repli)                       */
/* ------------------------------------------------------------------ */

export function CardImage({
  image,
  cardId,
  localId,
  name,
  quality = 'low',
  className,
  imgClassName,
  priority,
}: {
  image?: string | null
  /** Identifiant + numéro : permettent de trouver une image anglaise de secours */
  cardId?: string | null
  localId?: string | null
  name: string
  quality?: ImageQuality
  className?: string
  imgClassName?: string
  priority?: boolean
}) {
  const { catalog } = useCatalog()
  const { cardLang } = useSettings()
  const { data: photos } = useCardPhotos()
  const photo = cardId ? photos?.get(cardId) : undefined
  const sources = useMemo(
    () => cardImageSources({ image, id: cardId, localId }, catalog, quality, photo),
    [image, cardId, localId, catalog, quality, photo],
  )
  const key = sources.map((s) => s.url).join('|')
  const [index, setIndex] = useState(0)
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>(sources.length ? 'loading' : 'error')

  useEffect(() => {
    setIndex(0)
    setState(sources.length ? 'loading' : 'error')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const current = sources[index]
  const showEn = state === 'loaded' && current?.fallback && cardLang !== 'en'

  return (
    <div className={cn('relative aspect-[63/88] w-full overflow-hidden card-radius bg-sunken', className)}>
      {current && state !== 'error' && (
        <img
          key={current.url}
          src={current.url}
          alt={name}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          crossOrigin="anonymous"
          draggable={false}
          onLoad={() => setState('loaded')}
          onError={() => {
            if (index < sources.length - 1) setIndex(index + 1)
            else setState('error')
          }}
          className={cn(
            'absolute inset-0 size-full object-cover transition-opacity duration-300',
            state === 'loaded' ? 'opacity-100' : 'opacity-0',
            imgClassName,
          )}
        />
      )}
      {state === 'loaded' && current?.personal && (
        <span
          title="Ta photo (visible par toi seul)"
          className="pointer-events-none absolute bottom-[4%] left-[5%] rounded bg-brand/90 px-1 text-[9px] font-bold leading-4 tracking-wide text-white shadow"
        >
          PHOTO
        </span>
      )}
      {showEn && (
        <span
          title="Image anglaise : la version française n'est pas encore disponible"
          className="pointer-events-none absolute bottom-[4%] left-[5%] rounded bg-[#1d2c5e]/85 px-1 text-[9px] font-bold leading-4 tracking-wide text-white shadow"
        >
          EN
        </span>
      )}
      {state === 'loading' && <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-sunken to-line" />}
      {state === 'error' && <CardPlaceholder name={name} />}
    </div>
  )
}

/** Dos de carte maison (design original), affiché quand l'image n'existe pas. */
export function CardPlaceholder({ name }: { name: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 overflow-hidden bg-gradient-to-br from-[#1d2c5e] via-[#24357a] to-[#101a3d] p-3 text-center">
      <div
        className="absolute inset-0 opacity-20"
        style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, rgb(255 255 255 / .6) 1px, transparent 0)',
          backgroundSize: '12px 12px',
        }}
      />
      <LogoMark className="relative size-10 opacity-90" />
      <span className="relative line-clamp-3 font-display text-[13px] font-semibold leading-tight text-white">{name}</span>
      <span className="relative text-[10px] text-white/60">Image indisponible</span>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Effet holographique 3D (inclinaison + reflets suivant le pointeur)    */
/* ------------------------------------------------------------------ */

export function HoloCard({
  children,
  foil = 'soft',
  className,
}: {
  children: ReactNode
  foil?: 'none' | 'soft' | 'strong'
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const raf = useRef(0)

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(() => {
      el.classList.add('is-active')
      el.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`)
      el.style.setProperty('--my', `${(py * 100).toFixed(1)}%`)
      el.style.setProperty('--rx', `${((0.5 - py) * 20).toFixed(2)}deg`)
      el.style.setProperty('--ry', `${((px - 0.5) * 24).toFixed(2)}deg`)
      el.style.setProperty('--o', '1')
    })
  }

  const reset = () => {
    const el = ref.current
    if (!el) return
    cancelAnimationFrame(raf.current)
    el.classList.remove('is-active')
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
    el.style.setProperty('--o', '0')
  }

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  return (
    <div
      ref={ref}
      data-foil={foil}
      onPointerMove={onMove}
      onPointerLeave={reset}
      onPointerCancel={reset}
      onPointerUp={(e) => e.pointerType !== 'mouse' && reset()}
      className={cn('holo-card card-radius touch-none select-none', className)}
    >
      {children}
      <div className="holo-foil" aria-hidden />
      <div className="holo-glare" aria-hidden />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tuile de carte (grilles)                                            */
/* ------------------------------------------------------------------ */

export interface TileCard {
  id: string
  localId: string
  name: string
  image?: string | null
}

export function CardTile({
  card,
  quantity = 0,
  wished,
  onOpen,
  onAdd,
  onRemove,
  subtitle,
  dimMissing = true,
  showCaption = true,
  badge,
}: {
  card: TileCard
  quantity?: number
  wished?: boolean
  onOpen?(): void
  onAdd?(): void
  onRemove?(): void
  subtitle?: ReactNode
  dimMissing?: boolean
  showCaption?: boolean
  badge?: ReactNode
}) {
  const owned = quantity > 0
  return (
    <div className="group relative min-w-0">
      <div className="relative transition-transform duration-200 ease-out group-hover:-translate-y-1">
        <button
          type="button"
          onClick={onOpen}
          className="block w-full rounded-[6%] focus-visible:outline-offset-4"
          aria-label={`${card.name}, n° ${card.localId}${owned ? `, possédée en ${quantity} exemplaire${quantity > 1 ? 's' : ''}` : ', manquante'}`}
        >
          <CardImage
            image={card.image}
            cardId={card.id}
            localId={card.localId}
            name={card.name}
            className={cn(
              'shadow-[var(--shadow-card)] ring-1 ring-black/5 transition duration-300 dark:ring-white/5',
              owned ? 'group-hover:shadow-[var(--shadow-pop)]' : dimMissing && 'opacity-40 grayscale group-hover:opacity-80 group-hover:grayscale-0',
            )}
          />
        </button>

        {owned && (
          <span className="pointer-events-none absolute left-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-success text-white shadow-md ring-2 ring-white/80 dark:ring-black/40">
            <Check className="size-3" strokeWidth={3.5} />
          </span>
        )}
        {quantity > 1 && (
          <span
            key={quantity}
            className="pointer-events-none absolute -right-1.5 -top-1.5 animate-pop rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold tabular-nums text-white shadow-md ring-2 ring-bg"
          >
            ×{quantity}
          </span>
        )}
        {wished && !owned && (
          <span className="pointer-events-none absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-elev/90 text-brand shadow-md">
            <Heart className="size-3.5 fill-current" />
          </span>
        )}
        {badge}

        {(onAdd || onRemove) && (
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5 opacity-0 transition duration-200 group-hover:opacity-100 group-focus-within:opacity-100 touch:opacity-100">
            {onRemove && owned && (
              <button
                type="button"
                onClick={onRemove}
                aria-label={`Retirer un exemplaire de ${card.name}`}
                className="grid size-8 place-items-center rounded-full bg-black/55 text-white shadow-lg ring-1 ring-white/20 backdrop-blur transition hover:bg-black/75 active:scale-90"
              >
                <Minus className="size-4" strokeWidth={3} />
              </button>
            )}
            {onAdd && (
              <button
                type="button"
                onClick={onAdd}
                aria-label={`Ajouter ${card.name}`}
                className="grid size-8 place-items-center rounded-full bg-brand text-white shadow-lg ring-1 ring-white/30 transition hover:bg-brand-strong active:scale-90"
              >
                <Plus className="size-4" strokeWidth={3} />
              </button>
            )}
          </div>
        )}
      </div>

      {showCaption && (
        <button type="button" onClick={onOpen} className="mt-2 block w-full min-w-0 px-0.5 text-left" tabIndex={-1}>
          <div className="flex items-baseline gap-1.5">
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-subtle">{card.localId}</span>
            <span className={cn('truncate text-[13px] font-semibold', !owned && dimMissing && 'text-muted')}>{card.name}</span>
          </div>
          {subtitle && <div className="truncate text-[11px] text-subtle">{subtitle}</div>}
        </button>
      )}
    </div>
  )
}

export function CardGrid({ children, size = 'md', className }: { children: ReactNode; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  return (
    <div
      className={cn(
        'grid gap-x-3 gap-y-5 sm:gap-x-4',
        size === 'sm' && 'grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10',
        size === 'md' && 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-7',
        size === 'lg' && 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function CardGridSkeleton({ count = 14, size = 'md' }: { count?: number; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <CardGrid size={size}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <div className="aspect-[63/88] animate-pulse card-radius bg-sunken" />
          <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-sunken" />
        </div>
      ))}
    </CardGrid>
  )
}

/* ------------------------------------------------------------------ */
/* Types d'énergie                                                     */
/* ------------------------------------------------------------------ */

const ENERGY_ICONS: Record<EnergyKey, LucideIcon> = {
  grass: Leaf,
  fire: Flame,
  water: Droplet,
  lightning: Zap,
  psychic: Eye,
  fighting: Swords,
  darkness: Moon,
  metal: Shield,
  fairy: Sparkles,
  dragon: Gem,
  colorless: Star,
}

export function EnergyDot({ type, size = 'md' }: { type: string; size?: 'sm' | 'md' }) {
  const key = energyKey(type)
  const Icon = key ? ENERGY_ICONS[key] : Star
  const color = key ? ENERGY[key].color : 'var(--color-t-colorless)'
  return (
    <span
      title={key ? ENERGY[key].label : type}
      className={cn('inline-grid shrink-0 place-items-center rounded-full text-white shadow-sm ring-1 ring-black/10', size === 'sm' ? 'size-5' : 'size-6')}
      style={{ background: color }}
    >
      <Icon className={size === 'sm' ? 'size-3' : 'size-3.5'} strokeWidth={2.5} />
    </span>
  )
}

export function TypeBadge({ type }: { type: string }) {
  const key = energyKey(type)
  const color = key ? ENERGY[key].color : 'var(--color-t-colorless)'
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-xs font-semibold"
      style={{ background: `color-mix(in oklab, ${color} 16%, transparent)`, color: `color-mix(in oklab, ${color} 80%, var(--fg))` }}
    >
      <EnergyDot type={type} size="sm" />
      {key ? ENERGY[key].label : type}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Sélecteur de quantité                                               */
/* ------------------------------------------------------------------ */

export function QtyStepper({ value, onChange, label }: { value: number; onChange(delta: number): void; label: string }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-line bg-sunken p-0.5">
      <button
        type="button"
        onClick={() => onChange(-1)}
        disabled={value <= 0}
        aria-label={`Retirer une carte ${label}`}
        className="grid size-8 place-items-center rounded-lg text-muted transition hover:bg-elev hover:text-fg active:scale-90 disabled:opacity-30"
      >
        <Minus className="size-4" strokeWidth={2.5} />
      </button>
      <span key={value} className={cn('w-8 animate-pop text-center font-display text-lg font-semibold tabular-nums', value > 0 ? 'text-fg' : 'text-subtle')}>
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(1)}
        aria-label={`Ajouter une carte ${label}`}
        className="grid size-8 place-items-center rounded-lg bg-brand text-white shadow-sm transition hover:bg-brand-strong active:scale-90"
      >
        <Plus className="size-4" strokeWidth={2.5} />
      </button>
    </div>
  )
}
