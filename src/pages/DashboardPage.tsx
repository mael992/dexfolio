import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, BookImage, Coins, Heart, Layers, RefreshCw, ScanLine, Search, Sparkles, Trophy } from 'lucide-react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { CardTile } from '../components/cards'
import { SetLogo, SetSymbol, SetTile, SetTileSkeleton } from '../components/sets'
import { buttonClass, ProgressBar, ProgressRing, SectionHeader } from '../components/ui'
import { useAuth } from '../lib/auth'
import { useCardSheet } from '../lib/card-sheet'
import { useCollection, useWishlist } from '../lib/collection-hooks'
import { collectionValue, refreshPrices, usePriceVersion } from '../lib/prices'
import { useCatalog } from '../lib/queries'
import { useSettings } from '../lib/settings'
import { DEX_TOTAL } from '../lib/taxonomy'
import { cn, fmtEur, fmtInt, fmtPct, fmtRelative } from '../lib/utils'

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'Bonne nuit'
  if (h < 18) return 'Bonjour'
  return 'Bonsoir'
}

export default function DashboardPage() {
  const { displayName, mode } = useAuth()
  const { index, isLoading } = useCollection()
  const { catalog } = useCatalog()
  const { data: wishes } = useWishlist()
  const { openCard } = useCardSheet()
  const { cardLang } = useSettings()
  const qc = useQueryClient()
  usePriceVersion()
  const value = collectionValue(index)
  const [pricing, setPricing] = useState<number | null>(null)

  const setActivity = useMemo(() => {
    const last = new Map<string, string>()
    for (const c of index.byCard.values()) {
      const prev = last.get(c.setId)
      if (!prev || c.updatedAt > prev) last.set(c.setId, c.updatedAt)
    }
    return last
  }, [index])

  const inProgress = useMemo(() => {
    if (!catalog) return []
    return [...index.bySet.entries()]
      .map(([setId, owned]) => ({ set: catalog.byId.get(setId), owned, at: setActivity.get(setId) ?? '' }))
      .filter((x): x is { set: NonNullable<typeof x.set>; owned: number; at: string } => !!x.set)
      .sort((a, b) => b.at.localeCompare(a.at))
  }, [catalog, index, setActivity])

  const completed = inProgress.filter((x) => x.owned >= (x.set.cardCount.total || x.set.cardCount.official)).length
  const dexOwned = index.byDex.size
  const recent = index.recent.slice(0, 14)
  const empty = !isLoading && index.uniqueCards === 0

  async function updatePrices() {
    const ids = [...index.byCard.keys()]
    setPricing(0)
    try {
      const n = await refreshPrices(qc, cardLang, ids, (done, total) => setPricing(total ? done / total : 1))
      toast.success(n ? `Cotes mises à jour (${n} cartes)` : 'Les cotes sont déjà à jour')
    } finally {
      setPricing(null)
    }
  }

  return (
    <div className="space-y-10">
      {/* --------------------------- Héros --------------------------- */}
      <section className="relative isolate overflow-hidden rounded-[28px] bg-gradient-to-br from-[#ff6a3d] via-[#e3350d] to-[#8f1c06] p-6 text-white shadow-[0_30px_60px_-30px_rgb(227_53_13/0.8)] sm:p-8">
        <div className="absolute -right-16 -top-24 -z-10 size-72 rounded-full bg-accent/40 blur-3xl" />
        <div className="absolute -bottom-24 left-1/3 -z-10 size-72 rounded-full bg-[#2a75bb]/50 blur-3xl" />
        <div
          className="absolute inset-0 -z-10 opacity-[0.12]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '18px 18px' }}
        />
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="font-semibold text-white/80">{greeting()},</p>
            <h1 className="text-4xl font-semibold sm:text-5xl">{mode === 'local' ? 'Dresseur' : displayName}</h1>
            <p className="mt-2 max-w-md text-white/80">
              {empty ? 'Ton classeur t’attend. Ajoute ta première carte !' : 'Voici où en est ta collection aujourd’hui.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/scanner" className={buttonClass('secondary', 'lg', 'border-transparent bg-white text-brand hover:bg-white/90')}>
              <ScanLine className="size-5" /> Scanner une carte
            </Link>
            <Link to="/extensions" className={buttonClass('ghost', 'lg', 'bg-white/15 text-white ring-1 ring-white/25 hover:bg-white/25 hover:text-white')}>
              <Layers className="size-5" /> Extensions
            </Link>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <HeroStat label="Cartes uniques" value={fmtInt(index.uniqueCards)} icon={Sparkles} />
          <HeroStat label="Exemplaires" value={fmtInt(index.totalCopies)} icon={Layers} />
          <HeroStat label="Extensions" value={`${fmtInt(index.setsStarted)}`} hint={completed ? `${completed} complète${completed > 1 ? 's' : ''}` : 'commencées'} icon={Trophy} />
          <HeroStat
            label="Valeur estimée"
            value={value.priced ? fmtEur(value.value) : '—'}
            hint={
              pricing != null
                ? `Calcul… ${Math.round(pricing * 100)} %`
                : value.total
                  ? value.priced < value.total
                    ? `${value.priced}/${value.total} cotées`
                    : 'Cote Cardmarket'
                  : 'Cote Cardmarket'
            }
            icon={Coins}
            action={
              value.total > 0 && (
                <button
                  type="button"
                  onClick={updatePrices}
                  disabled={pricing != null}
                  aria-label="Mettre à jour la valeur"
                  className="grid size-8 place-items-center rounded-lg bg-white/15 transition hover:bg-white/25 disabled:opacity-60"
                >
                  <RefreshCw className={cn('size-4', pricing != null && 'animate-spin')} />
                </button>
              )
            }
          />
        </div>
      </section>

      {empty ? (
        <Onboarding />
      ) : (
        <>
          {/* ------------------ Extensions en cours + Dex ------------------ */}
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section>
              <SectionHeader
                title="Extensions en cours"
                subtitle="Reprends là où tu t’es arrêté"
                action={
                  <Link to="/extensions" className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline">
                    Tout voir <ArrowRight className="size-4" />
                  </Link>
                }
              />
              <div className="grid gap-3 sm:grid-cols-2">
                {!catalog
                  ? Array.from({ length: 4 }, (_, i) => <SetTileSkeleton key={i} />)
                  : inProgress.slice(0, 6).map(({ set, owned, at }) => {
                      const total = set.cardCount.total || set.cardCount.official
                      return (
                        <Link
                          key={set.id}
                          to={`/extensions/${set.id}`}
                          className="group surface flex items-center gap-4 rounded-2xl p-3 pr-4 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)]"
                        >
                          <SetLogo logo={set.logo} name={set.name} className="h-14 w-24 shrink-0 rounded-xl bg-sunken p-2" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <SetSymbol symbol={set.symbol} />
                              <span className="truncate font-semibold">{set.name}</span>
                            </div>
                            <div className="mt-0.5 flex justify-between text-xs text-muted">
                              <span className="tabular-nums">
                                {owned}/{total} · {fmtPct(owned / total)}
                              </span>
                              <span>{at ? fmtRelative(at) : ''}</span>
                            </div>
                            <ProgressBar value={owned / total} size="sm" className="mt-2" />
                          </div>
                        </Link>
                      )
                    })}
              </div>
            </section>

            <aside className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <Link to="/dex" className="group surface flex items-center gap-5 rounded-2xl p-5 transition hover:shadow-[var(--shadow-pop)]">
                <ProgressRing value={dexOwned / DEX_TOTAL} size={92} stroke={9}>
                  <span className="font-display text-lg font-semibold tabular-nums">{fmtPct(dexOwned / DEX_TOTAL).replace(' %', '%')}</span>
                </ProgressRing>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-semibold text-muted">
                    <BookImage className="size-4" /> Dex national
                  </div>
                  <div className="mt-1 font-display text-2xl font-semibold tabular-nums">
                    {fmtInt(dexOwned)} <span className="text-base text-subtle">/ {fmtInt(DEX_TOTAL)}</span>
                  </div>
                  <div className="text-xs text-muted">Pokémon différents dans ton classeur</div>
                </div>
              </Link>
              <Link to="/envies" className="group surface flex items-center gap-4 rounded-2xl p-5 transition hover:shadow-[var(--shadow-pop)]">
                <div className="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand">
                  <Heart className="size-7" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-muted">Liste d’envies</div>
                  <div className="font-display text-2xl font-semibold tabular-nums">{fmtInt(wishes?.length ?? 0)}</div>
                  <div className="truncate text-xs text-muted">
                    {wishes?.length ? wishes.slice(0, 3).map((w) => w.card_name).join(', ') : 'Ajoute les cartes que tu recherches'}
                  </div>
                </div>
                <ArrowRight className="size-5 text-subtle transition group-hover:translate-x-1 group-hover:text-brand" />
              </Link>
            </aside>
          </div>

          {/* ------------------------ Derniers ajouts ------------------------ */}
          <section>
            <SectionHeader title="Derniers ajouts" subtitle={`${fmtInt(index.uniqueCards)} cartes dans ton classeur`} />
            <div className="scrollbar-none -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
              {recent.map((c) => (
                <div key={c.cardId} className="w-[132px] shrink-0 snap-start sm:w-[150px]">
                  <CardTile
                    card={{ id: c.cardId, localId: c.localId ?? '', name: c.name, image: c.image }}
                    quantity={c.total}
                    onOpen={() => openCard(c.cardId, recent.map((r) => r.cardId))}
                    subtitle={catalog?.byId.get(c.setId)?.name}
                  />
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

function HeroStat({
  label,
  value,
  hint,
  icon: Icon,
  action,
}: {
  label: string
  value: string
  hint?: string
  icon: typeof Sparkles
  action?: ReactNode
}) {
  return (
    <div className="rounded-2xl bg-white/12 p-4 ring-1 ring-white/20 backdrop-blur-md">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/75">
          <Icon className="size-4" /> {label}
        </span>
        {action}
      </div>
      <div className="mt-1 font-display text-2xl font-semibold tabular-nums sm:text-3xl">{value}</div>
      {hint && <div className="text-xs text-white/70">{hint}</div>}
    </div>
  )
}

function Onboarding() {
  const { catalog } = useCatalog()
  const latest = catalog?.sets.slice(0, 4) ?? []
  const steps = [
    { icon: Layers, title: 'Choisis une extension', text: 'Toutes les séries, de Wizards à aujourd’hui, en français.' },
    { icon: ScanLine, title: 'Ajoute tes cartes', text: 'Un clic sur une carte, le scanner photo ou la recherche.' },
    { icon: Trophy, title: 'Complète ton classeur', text: 'Suis ta progression, tes manquantes et la valeur de ta collection.' },
  ]
  return (
    <div className="space-y-10">
      <section className="grid gap-4 sm:grid-cols-3">
        {steps.map((s, i) => (
          <div key={s.title} className="surface relative overflow-hidden rounded-2xl p-5">
            <span className="absolute -right-2 -top-6 font-display text-[96px] font-bold leading-none text-sunken">{i + 1}</span>
            <div className="relative grid size-11 place-items-center rounded-xl bg-brand-soft text-brand">
              <s.icon className="size-6" />
            </div>
            <h3 className="relative mt-4 text-lg font-semibold">{s.title}</h3>
            <p className="relative mt-1 text-sm text-muted">{s.text}</p>
          </div>
        ))}
      </section>
      <section>
        <SectionHeader
          title="Les dernières extensions"
          subtitle="Un bon point de départ"
          action={
            <Link to="/recherche" className={buttonClass('secondary', 'sm')}>
              <Search className="size-4" /> Chercher une carte
            </Link>
          }
        />
        <div className={cn('grid grid-cols-2 gap-3 lg:grid-cols-4')}>
          {latest.length ? latest.map((s) => <SetTile key={s.id} set={s} owned={0} />) : Array.from({ length: 4 }, (_, i) => <SetTileSkeleton key={i} />)}
        </div>
      </section>
    </div>
  )
}
