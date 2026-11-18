import { Layers, Search } from 'lucide-react'
import { useDeferredValue, useMemo, useState } from 'react'
import { SetLogo, SetTile, SetTileSkeleton } from '../components/sets'
import { EmptyState, Input, PageHeader, Segmented } from '../components/ui'
import { useCollection } from '../lib/collection-hooks'
import { useCatalog } from '../lib/queries'
import { fmtDate, fmtInt, normalizeText } from '../lib/utils'

type Filter = 'all' | 'started' | 'complete'

export default function SetsPage() {
  const { catalog, isLoading, error } = useCatalog()
  const { index } = useCollection()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const q = useDeferredValue(normalizeText(query))

  const series = useMemo(() => {
    if (!catalog) return []
    return catalog.series
      .map((s) => ({
        ...s,
        sets: s.sets.filter((set) => {
          const owned = index.bySet.get(set.id) ?? 0
          const total = set.cardCount.total || set.cardCount.official
          if (filter === 'started' && owned === 0) return false
          if (filter === 'complete' && owned < total) return false
          if (q && !normalizeText(`${set.name} ${s.name} ${set.id}`).includes(q)) return false
          return true
        }),
      }))
      .filter((s) => s.sets.length > 0)
  }, [catalog, index, filter, q])

  const counts = useMemo(() => {
    if (!catalog) return { all: 0, started: 0, complete: 0 }
    let started = 0
    let complete = 0
    for (const set of catalog.sets) {
      const owned = index.bySet.get(set.id) ?? 0
      if (owned > 0) started++
      if (owned > 0 && owned >= (set.cardCount.total || set.cardCount.official)) complete++
    }
    return { all: catalog.sets.length, started, complete }
  }, [catalog, index])

  return (
    <div>
      <PageHeader
        eyebrow="Collection"
        title="Extensions"
        subtitle={catalog ? `${fmtInt(catalog.sets.length)} extensions réparties en ${catalog.series.length} séries. Choisis-en une pour compléter ton classeur.` : 'Chargement du catalogue…'}
      />

      <div className="sticky top-14 z-20 -mx-4 mb-6 flex flex-col gap-3 border-b border-line/60 bg-bg/85 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:flex-row sm:items-center sm:px-6 lg:top-0 lg:mx-0 lg:rounded-2xl lg:border lg:px-3">
        <Input icon={Search} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une extension (ex. 151, Évolutions…)" className="flex-1" aria-label="Rechercher une extension" />
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          ariaLabel="Filtrer les extensions"
          className="self-start sm:self-auto"
          options={[
            { value: 'all', label: 'Toutes', count: counts.all },
            { value: 'started', label: 'Commencées', count: counts.started },
            { value: 'complete', label: 'Complètes', count: counts.complete },
          ]}
        />
      </div>

      {error && !catalog && (
        <EmptyState icon={Layers} title="Catalogue indisponible">
          Impossible de joindre l’API des cartes. Vérifie ta connexion puis recharge la page.
        </EmptyState>
      )}

      {isLoading && !catalog && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => (
            <SetTileSkeleton key={i} />
          ))}
        </div>
      )}

      {catalog && series.length === 0 && (
        <EmptyState icon={Layers} title="Aucune extension trouvée">
          {filter === 'complete' ? 'Pas encore d’extension complète… courage !' : 'Essaie une autre recherche.'}
        </EmptyState>
      )}

      <div className="space-y-12">
        {series.map((s) => {
          const owned = s.sets.reduce((sum, set) => sum + (index.bySet.get(set.id) ?? 0), 0)
          return (
            <section key={s.id} aria-labelledby={`serie-${s.id}`}>
              <div className="mb-4 flex items-center gap-4">
                {s.logo && <SetLogo logo={s.logo} name={s.name} className="hidden h-10 w-24 sm:grid" />}
                <div className="min-w-0 flex-1">
                  <h2 id={`serie-${s.id}`} className="text-2xl font-semibold">
                    {s.name}
                  </h2>
                  <p className="text-sm text-muted">
                    {s.sets.length} extension{s.sets.length > 1 ? 's' : ''}
                    {s.releaseDate ? ` · depuis ${fmtDate(s.releaseDate, 'short')}` : ''}
                    {owned > 0 ? ` · ${fmtInt(owned)} cartes possédées` : ''}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                {s.sets.map((set) => (
                  <SetTile key={set.id} set={set} owned={index.bySet.get(set.id) ?? 0} />
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
