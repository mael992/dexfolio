import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Hash, Search, SearchX } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { CardGrid, CardGridSkeleton, CardTile } from '../components/cards'
import { EmptyState, Input, PageHeader } from '../components/ui'
import { useCardSheet } from '../lib/card-sheet'
import { useCollection, useWishlist } from '../lib/collection-hooks'
import { setQuery, useCatalog, type Catalog } from '../lib/queries'
import { useQuickAdd } from '../lib/quick-add'
import { useSettings } from '../lib/settings'
import { englishEnergyName, localizeCardName, tcgdex, type CardBrief, type Lang } from '../lib/tcgdex'
import { normNum, setIdFromCardId } from '../lib/utils'
import type { QueryClient } from '@tanstack/react-query'

const SUGGESTIONS = ['Pikachu', 'Dracaufeu', 'Évoli', 'Mew', 'Lucario', 'Rayquaza', 'Ectoplasma', 'Lugia']

/** « 25/165 » → recherche par numéro dans les extensions de 165 cartes. */
async function searchByNumber(qc: QueryClient, lang: Lang, catalog: Catalog, num: string, total: number): Promise<CardBrief[]> {
  const sets = catalog.sets.filter((s) => s.cardCount.official === total).slice(0, 12)
  const target = normNum(num)
  const results = await Promise.all(
    sets.map(async (s) => {
      try {
        const detail = await qc.fetchQuery(setQuery(lang, s.id))
        return detail.cards.filter((c) => normNum(c.localId) === target)
      } catch {
        return []
      }
    }),
  )
  return results.flat()
}

export default function SearchPage() {
  const [params, setParams] = useSearchParams()
  const [text, setText] = useState(params.get('q') ?? '')
  const deferred = useDeferredValue(text.trim())
  const [debounced, setDebounced] = useState(deferred)
  const { cardLang } = useSettings()
  const { catalog } = useCatalog()
  const { index } = useCollection()
  const { ids: wishIds } = useWishlist()
  const { openCard } = useCardSheet()
  const { add, removeOne } = useQuickAdd()
  const qc = useQueryClient()

  useEffect(() => {
    const t = setTimeout(() => setDebounced(deferred), 350)
    return () => clearTimeout(t)
  }, [deferred])

  useEffect(() => {
    setParams(
      (p) => {
        const next = new URLSearchParams(p)
        if (debounced) next.set('q', debounced)
        else next.delete('q')
        return next
      },
      { replace: true },
    )
  }, [debounced, setParams])

  const numberMatch = debounced.match(/^#?\s*([a-z]{0,4}\d{1,3}[a-z]?)\s*\/\s*([a-z]{0,4}\d{1,3})$/i)

  const { data, isFetching, isError } = useQuery({
    queryKey: ['search', cardLang, debounced, !!catalog],
    enabled: debounced.length >= 2 && (!numberMatch || !!catalog),
    staleTime: 10 * 60 * 1000,
    queryFn: async ({ signal }) => {
      if (numberMatch && catalog) return searchByNumber(qc, cardLang, catalog, numberMatch[1], Number(numberMatch[2].replace(/\D/g, '')))
      const found = await tcgdex.searchCards(cardLang, { name: debounced }, signal, 300)
      // Énergies de base : certaines éditions n'existent que dans la base anglaise (ex. Soleil et Lune)
      const enEnergy = cardLang !== 'en' ? englishEnergyName(debounced) : null
      if (!enEnergy) return found
      const known = new Set(found.map((c) => c.id))
      const en = await tcgdex.searchCards('en', { name: `eq:${enEnergy}` }, signal, 300).catch(() => [] as CardBrief[])
      return [...found, ...en.filter((c) => !known.has(c.id)).map((c) => ({ ...c, name: localizeCardName(c.name, cardLang), image: undefined }))]
    },
  })

  const results = useMemo(() => {
    const list = (data ?? []).filter((c) => !catalog || catalog.byId.has(setIdFromCardId(c.id)))
    return list.sort(
      (a, b) =>
        (catalog?.byId.get(setIdFromCardId(a.id))?.order ?? 9999) - (catalog?.byId.get(setIdFromCardId(b.id))?.order ?? 9999),
    )
  }, [data, catalog])
  const ids = useMemo(() => results.map((r) => r.id), [results])

  return (
    <div>
      <PageHeader eyebrow="Trouver une carte" title="Recherche" subtitle="Par nom (« Pikachu ») ou par numéro imprimé (« 25/165 »)." />

      <div className="sticky top-14 z-20 -mx-4 mb-6 border-b border-line/60 bg-bg/85 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-0 lg:mx-0 lg:rounded-2xl lg:border lg:px-3">
        <Input
          icon={numberMatch ? Hash : Search}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Nom de la carte ou numéro (ex. 025/165)"
          aria-label="Rechercher une carte"
          enterKeyHint="search"
          className="[&_input]:h-12 [&_input]:text-base"
        />
        {!debounced && (
          <div className="scrollbar-none mt-3 flex gap-2 overflow-x-auto">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setText(s)}
                className="h-8 shrink-0 rounded-full border border-line bg-elev px-3 text-[13px] font-semibold text-muted transition hover:border-brand hover:text-brand"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {debounced.length < 2 ? (
        <EmptyState icon={Search} title="Que cherches-tu ?">
          Tape le nom d’une carte dans la langue choisie dans les réglages, ou son numéro imprimé en bas de la carte.
        </EmptyState>
      ) : isFetching && !data ? (
        <CardGridSkeleton />
      ) : isError ? (
        <EmptyState icon={SearchX} title="Recherche impossible">
          L’API des cartes ne répond pas. Réessaie dans un instant.
        </EmptyState>
      ) : results.length === 0 ? (
        <EmptyState icon={SearchX} title="Aucune carte trouvée">
          Vérifie l’orthographe ou essaie une autre langue dans les réglages.
        </EmptyState>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted">
            {results.length} résultat{results.length > 1 ? 's' : ''} · du plus récent au plus ancien
          </p>
          <CardGrid>
            {results.map((c) => (
              <CardTile
                key={c.id}
                card={c}
                quantity={index.byCard.get(c.id)?.total ?? 0}
                wished={wishIds.has(c.id)}
                dimMissing={false}
                subtitle={catalog?.byId.get(setIdFromCardId(c.id))?.name}
                onOpen={() => openCard(c.id, ids)}
                onAdd={() => void add(c.id, { notify: true })}
                onRemove={() => removeOne(c.id)}
              />
            ))}
          </CardGrid>
        </>
      )}
    </div>
  )
}
