import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BookImage, CircleQuestionMark as HelpCircle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { CardGrid, CardImage, CardTile } from '../components/cards'
import { EmptyState, PageHeader, ProgressBar, ProgressRing, Segmented, Sheet, Skeleton } from '../components/ui'
import { useCardSheet } from '../lib/card-sheet'
import { useCollection, type OwnedCard } from '../lib/collection-hooks'
import { cardQuery, englishImage, useCatalog } from '../lib/queries'
import { useSettings } from '../lib/settings'
import { DEX_TOTAL, dexLabel, GENERATIONS, speciesName } from '../lib/taxonomy'
import { tcgdex } from '../lib/tcgdex'
import { cn, fmtInt, fmtPct, mapLimit, readLocal, setIdFromCardId, writeLocal } from '../lib/utils'

type Filter = 'all' | 'owned' | 'missing'

const OVERRIDES_KEY = 'dexfolio:dex-overrides'

/** Complète les n° de Pokédex manquants des cartes ajoutées sans métadonnées. */
function useDexBackfill(cards: OwnedCard[]) {
  const qc = useQueryClient()
  const { cardLang } = useSettings()
  const [overrides, setOverrides] = useState<Record<string, number[]>>(() => readLocal(OVERRIDES_KEY, {}))
  useEffect(() => {
    const todo = cards.filter((c) => !c.dexIds.length && !(c.cardId in overrides)).map((c) => c.cardId)
    if (!todo.length) return
    let cancelled = false
    void (async () => {
      const found: Record<string, number[]> = {}
      await mapLimit(todo.slice(0, 120), 6, async (id) => {
        try {
          const d = await qc.fetchQuery(cardQuery(cardLang, id))
          found[id] = d.dexId ?? []
        } catch {
          found[id] = []
        }
      })
      if (cancelled) return
      setOverrides((prev) => {
        const next = { ...prev, ...found }
        writeLocal(OVERRIDES_KEY, next)
        return next
      })
    })()
    return () => {
      cancelled = true
    }
  }, [cards, overrides, qc, cardLang])
  return overrides
}

export default function DexPage() {
  const { index } = useCollection()
  const [gen, setGen] = useState(1)
  const [filter, setFilter] = useState<Filter>('all')
  const [species, setSpecies] = useState<number | null>(null)
  const ownedCards = useMemo(() => [...index.byCard.values()], [index])
  const overrides = useDexBackfill(ownedCards)

  const byDex = useMemo(() => {
    const map = new Map<number, OwnedCard[]>()
    for (const c of ownedCards) {
      const ids = c.dexIds.length ? c.dexIds : (overrides[c.cardId] ?? [])
      for (const n of ids) {
        if (n < 1 || n > DEX_TOTAL) continue
        const list = map.get(n)
        if (list) list.push(c)
        else map.set(n, [c])
      }
    }
    return map
  }, [ownedCards, overrides])

  const owned = byDex.size
  const g = GENERATIONS.find((x) => x.gen === gen) ?? GENERATIONS[0]
  const numbers = useMemo(() => {
    const list: number[] = []
    for (let n = g.from; n <= g.to; n++) {
      const has = byDex.has(n)
      if (filter === 'owned' && !has) continue
      if (filter === 'missing' && has) continue
      list.push(n)
    }
    return list
  }, [g, filter, byDex])

  return (
    <div>
      <PageHeader
        eyebrow="Collection"
        title="Dex national"
        subtitle="Attrape-les tous… en cartes ! Chaque Pokémon dont tu possèdes au moins une carte est révélé."
      />

      <section className="surface mb-6 grid gap-6 rounded-[28px] p-5 sm:p-7 lg:grid-cols-[auto_1fr]">
        <div className="flex items-center gap-5">
          <ProgressRing value={owned / DEX_TOTAL} size={128} stroke={12}>
            <div>
              <div className="font-display text-2xl font-semibold tabular-nums leading-none">{fmtInt(owned)}</div>
              <div className="mt-1 text-xs text-muted">/ {fmtInt(DEX_TOTAL)}</div>
            </div>
          </ProgressRing>
          <div className="lg:hidden">
            <div className="font-display text-3xl font-semibold">{fmtPct(owned / DEX_TOTAL)}</div>
            <div className="text-sm text-muted">du Pokédex national</div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {GENERATIONS.map((x) => {
            let n = 0
            for (let i = x.from; i <= x.to; i++) if (byDex.has(i)) n++
            const size = x.to - x.from + 1
            return (
              <button
                key={x.gen}
                type="button"
                onClick={() => setGen(x.gen)}
                className={cn('rounded-xl px-3 py-2 text-left transition', gen === x.gen ? 'bg-brand-soft' : 'hover:bg-sunken')}
              >
                <div className="flex items-center justify-between text-sm">
                  <span className={cn('font-semibold', gen === x.gen && 'text-brand')}>
                    {x.label} <span className="font-normal text-muted">· {x.region}</span>
                  </span>
                  <span className="text-xs tabular-nums text-muted">
                    {n}/{size}
                  </span>
                </div>
                <ProgressBar value={n / size} size="sm" className="mt-1.5" />
              </button>
            )
          })}
        </div>
      </section>

      <div className="sticky top-14 z-20 -mx-4 mb-6 flex flex-col gap-3 border-b border-line/60 bg-bg/85 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:top-0 lg:mx-0 lg:rounded-2xl lg:border lg:px-3">
        <div className="scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1">
          {GENERATIONS.map((x) => (
            <button
              key={x.gen}
              type="button"
              onClick={() => setGen(x.gen)}
              className={cn(
                'h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-semibold transition',
                gen === x.gen ? 'border-brand bg-brand text-white' : 'border-line bg-elev text-muted hover:text-fg',
              )}
            >
              {x.label}
            </button>
          ))}
        </div>
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          ariaLabel="Filtrer les Pokémon"
          options={[
            { value: 'all', label: 'Tous' },
            { value: 'owned', label: 'Possédés' },
            { value: 'missing', label: 'Manquants' },
          ]}
        />
      </div>

      {numbers.length === 0 ? (
        <EmptyState icon={BookImage} title={filter === 'owned' ? 'Aucun Pokémon de cette génération' : 'Génération complète !'}>
          {filter === 'owned' ? 'Ajoute des cartes pour révéler des Pokémon.' : 'Tu as au moins une carte de chaque Pokémon de cette génération.'}
        </EmptyState>
      ) : (
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9">
          {numbers.map((n) => {
            const list = byDex.get(n)
            const best = list?.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0]
            return (
              <button
                key={n}
                type="button"
                onClick={() => setSpecies(n)}
                className={cn(
                  'group relative flex flex-col items-center rounded-2xl border p-2 pb-2.5 text-center transition hover:-translate-y-0.5',
                  best ? 'surface hover:shadow-[var(--shadow-pop)]' : 'border-dashed border-line bg-transparent hover:border-line-strong hover:bg-elev',
                )}
              >
                {best ? (
                  <CardImage image={best.image} name={best.name} className="w-full shadow-md" />
                ) : (
                  <div className="grid aspect-[63/88] w-full place-items-center card-radius bg-gradient-to-br from-sunken to-line/60">
                    <HelpCircle className="size-8 text-subtle/70 transition group-hover:scale-110 group-hover:text-brand" strokeWidth={1.5} />
                  </div>
                )}
                <div className="mt-2 font-mono text-[11px] tabular-nums text-subtle">{dexLabel(n)}</div>
                <div className={cn('w-full truncate text-xs font-semibold', !best && 'text-subtle')}>{best ? speciesName(best.name) : '???'}</div>
                {list && list.length > 1 && (
                  <span className="absolute right-1.5 top-1.5 rounded-full bg-brand px-1.5 text-[10px] font-bold text-white shadow">{list.length}</span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <SpeciesSheet dex={species} onClose={() => setSpecies(null)} />
    </div>
  )
}

function SpeciesSheet({ dex: requested, onClose }: { dex: number | null; onClose(): void }) {
  const { cardLang } = useSettings()
  const { catalog } = useCatalog()
  const { index } = useCollection()
  const { openCard } = useCardSheet()
  // Garde le dernier Pokémon affiché pendant l'animation de fermeture
  const [dex, setDex] = useState(requested)
  useEffect(() => {
    if (requested != null) setDex(requested)
  }, [requested])
  const { data, isLoading } = useQuery({
    queryKey: ['dex', cardLang, dex],
    queryFn: ({ signal }) => tcgdex.dexId(cardLang, dex!, signal),
    enabled: dex != null,
    staleTime: 6 * 60 * 60 * 1000,
  })

  const cards = useMemo(() => {
    const list = (data?.cards ?? []).filter((c) => !catalog || catalog.byId.has(setIdFromCardId(c.id)))
    return list.sort((a, b) => (catalog?.byId.get(setIdFromCardId(a.id))?.order ?? 9999) - (catalog?.byId.get(setIdFromCardId(b.id))?.order ?? 9999))
  }, [data, catalog])
  const ownedHere = cards.filter((c) => index.byCard.has(c.id)).length
  const name = cards[0] ? speciesName(cards[0].name) : ''

  return (
    <Sheet open={requested != null} onClose={onClose} size="xl" title="Cartes de ce Pokémon">
      <div className="p-5 pt-8 sm:p-8">
        <div className="mb-6 pr-10">
          <div className="font-mono text-sm text-subtle">{dex != null && dexLabel(dex)}</div>
          <h2 className="text-3xl font-semibold">{isLoading ? <Skeleton className="h-9 w-48" /> : name || 'Pokémon'}</h2>
          {!isLoading && (
            <p className="mt-1 text-sm text-muted">
              {cards.length} carte{cards.length > 1 ? 's' : ''} éditée{cards.length > 1 ? 's' : ''} · {ownedHere} dans ta collection
            </p>
          )}
        </div>
        {isLoading ? (
          <CardGrid size="md">
            {Array.from({ length: 10 }, (_, i) => (
              <Skeleton key={i} className="aspect-[63/88]" />
            ))}
          </CardGrid>
        ) : (
          <CardGrid size="md">
            {cards.map((c) => (
              <CardTile
                key={c.id}
                card={c}
                quantity={index.byCard.get(c.id)?.total ?? 0}
                fallbackImage={c.image ? null : englishImage(catalog, setIdFromCardId(c.id), c.localId)}
                subtitle={catalog?.byId.get(setIdFromCardId(c.id))?.name}
                onOpen={() => openCard(c.id, cards.map((x) => x.id))}
              />
            ))}
          </CardGrid>
        )}
      </div>
    </Sheet>
  )
}
