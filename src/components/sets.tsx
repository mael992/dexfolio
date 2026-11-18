import { Crown } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router'
import type { CatalogSet } from '../lib/queries'
import { setLogoUrl, setSymbolUrl } from '../lib/tcgdex'
import { cn, fmtInt, fmtPct } from '../lib/utils'
import { ProgressBar } from './ui'

export function SetSymbol({ symbol, className }: { symbol?: string | null; className?: string }) {
  const [ok, setOk] = useState(true)
  if (!symbol || !ok) return null
  return (
    <img
      src={setSymbolUrl(symbol)}
      alt=""
      loading="lazy"
      crossOrigin="anonymous"
      onError={() => setOk(false)}
      className={cn('size-4 shrink-0 object-contain', className)}
    />
  )
}

export function SetLogo({ logo, name, className, imgClassName }: { logo?: string | null; name: string; className?: string; imgClassName?: string }) {
  // Les extensions très récentes n'ont parfois pas encore de logo traduit : on tente la version anglaise.
  const sources = logo ? [...new Set([setLogoUrl(logo), setLogoUrl(logo.replace(/\/(fr|de|es|it|pt)\//, '/en/'))])] : []
  const [attempt, setAttempt] = useState(0)
  const ok = attempt < sources.length
  return (
    <div className={cn('flex min-h-0 items-center justify-center', className)}>
      {logo && ok ? (
        <img
          key={sources[attempt]}
          src={sources[attempt]}
          alt={name}
          loading="lazy"
          crossOrigin="anonymous"
          onError={() => setAttempt((a) => a + 1)}
          className={cn('max-h-full max-w-full object-contain drop-shadow-[0_6px_12px_rgb(0_0_0/0.18)]', imgClassName)}
        />
      ) : (
        <span className="px-2 text-center font-display text-lg font-semibold leading-tight text-muted">{name}</span>
      )}
    </div>
  )
}

export function SetTile({ set, owned, className }: { set: CatalogSet; owned: number; className?: string }) {
  const total = set.cardCount.total || set.cardCount.official || 0
  const ratio = total ? owned / total : 0
  const complete = total > 0 && owned >= total
  return (
    <Link
      to={`/extensions/${set.id}`}
      className={cn(
        'group surface relative flex flex-col overflow-hidden rounded-2xl p-4 transition duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--shadow-pop)]',
        className,
      )}
    >
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-sunken to-transparent opacity-70" aria-hidden />
      {complete && (
        <span className="absolute right-3 top-3 z-10 inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-[#1d2c5e] shadow">
          <Crown className="size-3.5" /> Complète
        </span>
      )}
      <SetLogo logo={set.logo} name={set.name} className="relative h-20" imgClassName="transition duration-300 group-hover:scale-105" />
      <div className="relative mt-3 flex min-w-0 items-center gap-2">
        <SetSymbol symbol={set.symbol} />
        <span className="truncate text-sm font-semibold">{set.name}</span>
      </div>
      <div className="relative mt-2 flex items-center justify-between text-xs text-muted">
        <span className="tabular-nums">
          <strong className={cn('font-semibold', owned > 0 ? 'text-fg' : 'text-muted')}>{fmtInt(owned)}</strong> / {fmtInt(total)}
        </span>
        <span className="tabular-nums">{owned > 0 ? fmtPct(ratio) : `${set.cardCount.official} cartes`}</span>
      </div>
      <ProgressBar value={ratio} size="sm" className="relative mt-1.5" />
    </Link>
  )
}

export function SetTileSkeleton() {
  return (
    <div className="surface rounded-2xl p-4">
      <div className="mx-auto h-20 w-3/4 animate-pulse rounded-xl bg-sunken" />
      <div className="mt-3 h-4 w-2/3 animate-pulse rounded bg-sunken" />
      <div className="mt-3 h-1.5 w-full animate-pulse rounded-full bg-sunken" />
    </div>
  )
}
