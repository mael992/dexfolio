import { ArrowLeft, ClipboardCopy, Grid2x2, Grid3x3, LayoutGrid, Layers, MousePointerClick, Search, Zap } from 'lucide-react'
import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { CardGrid, CardGridSkeleton, CardTile } from '../components/cards'
import { SetLogo, SetSymbol } from '../components/sets'
import { Badge, Button, EmptyState, Input, ProgressRing, Segmented } from '../components/ui'
import { useCardSheet } from '../lib/card-sheet'
import { snapshotFromBrief } from '../lib/collection'
import { useCollection, useWishlist } from '../lib/collection-hooks'
import { useCatalog, useSet, useSetMeta } from '../lib/queries'
import { useQuickAdd } from '../lib/quick-add'
import { useSettings, type GridSize } from '../lib/settings'
import { RARITY_TIERS, rarityTier, type RarityTier } from '../lib/taxonomy'
import { NotFoundError } from '../lib/tcgdex'
import { cn, fmtDate, fmtInt, fmtPct, normalizeText } from '../lib/utils'

type OwnFilter = 'all' | 'owned' | 'missing'

export default function SetPage() {
  const { setId = '' } = useParams()
  const { data: set, isLoading, error } = useSet(setId)
  const { data: meta } = useSetMeta(setId)
  const { catalog } = useCatalog()
  const { index } = useCollection()
  const { ids: wishIds } = useWishlist()
  const { openCard } = useCardSheet()
  const { gridSize, setGridSize } = useSettings()
  const { add, removeOne } = useQuickAdd()

  const [own, setOwn] = useState<OwnFilter>('all')
  const [tier, setTier] = useState<RarityTier | 'all'>('all')
  const [query, setQuery] = useState('')
  const [quick, setQuick] = useState(false)
  const q = useDeferredValue(normalizeText(query))

  const cards = set?.cards ?? []
  const official = set?.cardCount.official ?? 0
  const total = set?.cardCount.total || cards.length
  const ownedCount = cards.filter((c) => index.byCard.has(c.id)).length
  const ratio = total ? ownedCount / total : 0
  const secretCount = Math.max(0, total - official)

  // Célébration quand l'extension est complétée
  const prevOwned = useRef<number | null>(null)
  useEffect(() => {
    if (!set || !total) return
    if (prevOwned.current != null && prevOwned.current < total && ownedCount >= total) {
      toast.success('Extension complétée !', { description: `${set.name} — ${total}/${total}, bravo !` })
    }
    prevOwned.current = ownedCount
  }, [ownedCount, total, set])

  const tiersPresent = useMemo(() => {
    if (!meta) return []
    const present = new Set(Object.values(meta).map((m) => rarityTier(m.rarity)))
    return RARITY_TIERS.filter((t) => present.has(t.key))
  }, [meta])

  const visible = useMemo(
    () =>
      cards.filter((c) => {
        const owned = index.byCard.has(c.id)
        if (own === 'owned' && !owned) return false
        if (own === 'missing' && owned) return false
        if (tier !== 'all' && rarityTier(meta?.[c.id]?.rarity) !== tier) return false
        if (q && !normalizeText(`${c.name} ${c.localId}`).includes(q)) return false
        return true
      }),
    [cards, index, own, tier, meta, q],
  )
  const visibleIds = useMemo(() => visible.map((c) => c.id), [visible])

  function quickAdd(c: (typeof cards)[number]) {
    const m = meta?.[c.id]
    void add(c.id, m ? { snapshot: snapshotFromBrief(c, setId, m), variants: m.variants ?? null } : {})
  }

  async function copyMissing() {
    const missing = cards.filter((c) => !index.byCard.has(c.id))
    const text = `${set?.name} — ${missing.length} carte(s) manquante(s)\n` + missing.map((c) => `${c.localId} ${c.name}`).join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Liste des manquantes copiée', { description: `${missing.length} cartes` })
    } catch {
      toast.error('Copie impossible sur ce navigateur')
    }
  }

  if (error) {
    return (
      <EmptyState
        icon={Layers}
        title={error instanceof NotFoundError ? 'Extension introuvable' : 'Chargement impossible'}
        action={
          <Link to="/extensions" className="font-semibold text-brand hover:underline">
            ← Retour aux extensions
          </Link>
        }
      >
        {error instanceof NotFoundError ? 'Cette extension n’existe pas (ou plus) dans le catalogue.' : 'Vérifie ta connexion puis réessaie.'}
      </EmptyState>
    )
  }

  const catalogSet = catalog?.byId.get(setId)

  return (
    <div>
      <Link to="/extensions" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-muted transition hover:text-brand">
        <ArrowLeft className="size-4" /> Extensions
      </Link>

      {/* ----------------------------- En-tête ----------------------------- */}
      <section className="surface relative isolate mb-6 overflow-hidden rounded-[28px] p-5 sm:p-8">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(600px_300px_at_0%_0%,var(--glow-1),transparent_70%),radial-gradient(500px_300px_at_100%_100%,var(--glow-2),transparent_70%)]" />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:gap-8">
          <SetLogo
            logo={set?.logo ?? catalogSet?.logo}
            name={set?.name ?? catalogSet?.name ?? ''}
            className="h-20 w-full shrink-0 sm:h-28 sm:w-56"
          />
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-brand">
                <SetSymbol symbol={set?.symbol} /> <span className="truncate">{set?.serie.name ?? catalogSet?.serieName ?? '…'}</span>
              </div>
              <h1 className="mt-1 text-3xl font-semibold sm:text-4xl">{set?.name ?? catalogSet?.name ?? 'Chargement…'}</h1>
              <div className="mt-3 flex flex-wrap gap-1.5 sm:gap-2">
                {set?.releaseDate && <Badge>Sortie le {fmtDate(set.releaseDate)}</Badge>}
                {official > 0 && <Badge>{official} cartes</Badge>}
                {secretCount > 0 && <Badge tone="accent">+ {secretCount} secrètes</Badge>}
                {set?.abbreviation?.official && <Badge tone="info">{set.abbreviation.official}</Badge>}
                {set?.legal?.standard && <Badge tone="success">Standard</Badge>}
              </div>
            </div>
            <ProgressRing value={ratio} size={96} stroke={9} className="shrink-0 self-start sm:self-center">
              <div>
                <div className="font-display text-lg font-semibold tabular-nums leading-none">{fmtPct(ratio).replace(' %', '%')}</div>
                <div className="mt-1 text-[11px] text-muted tabular-nums">
                  {fmtInt(ownedCount)}/{fmtInt(total)}
                </div>
              </div>
            </ProgressRing>
          </div>
        </div>
      </section>

      {/* ----------------------------- Barre d'outils ----------------------------- */}
      <div className="sticky top-14 z-20 -mx-4 mb-6 border-b border-line/60 bg-bg/85 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-0 lg:mx-0 lg:rounded-2xl lg:border lg:px-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<OwnFilter>
            value={own}
            onChange={setOwn}
            size="sm"
            className="w-full sm:w-auto [&>button]:flex-1 [&>button]:h-8"
            ariaLabel="Filtrer par possession"
            options={[
              { value: 'all', label: 'Toutes', count: cards.length },
              { value: 'owned', label: 'Possédées', count: ownedCount },
              { value: 'missing', label: 'Manquantes', count: cards.length - ownedCount },
            ]}
          />
          <Input
            icon={Search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Nom ou numéro"
            className="min-w-[160px] flex-1 [&_input]:h-10"
            aria-label="Filtrer les cartes"
          />
          <div className="flex items-center gap-2">
            <Button
              variant={quick ? 'primary' : 'secondary'}
              size="md"
              icon={quick ? Zap : MousePointerClick}
              onClick={() => {
                setQuick((v) => !v)
                if (!quick) toast('Mode ajout rapide activé', { description: 'Un appui sur une carte = +1 exemplaire.' })
              }}
              aria-pressed={quick}
              title="Ajout rapide : un appui ajoute la carte"
            >
              <span className="hidden sm:inline">Ajout rapide</span>
            </Button>
            <div className="hidden md:block">
              <Segmented<GridSize>
                value={gridSize}
                onChange={setGridSize}
                size="sm"
                ariaLabel="Taille des vignettes"
                options={[
                  { value: 'sm', label: '', icon: Grid3x3, title: 'Petites vignettes' },
                  { value: 'md', label: '', icon: LayoutGrid, title: 'Vignettes moyennes' },
                  { value: 'lg', label: '', icon: Grid2x2, title: 'Grandes vignettes' },
                ]}
              />
            </div>
            <Button variant="secondary" size="icon" icon={ClipboardCopy} onClick={copyMissing} aria-label="Copier la liste des cartes manquantes" title="Copier la liste des manquantes" />
          </div>
        </div>
        {tiersPresent.length > 1 && (
          <div className="scrollbar-none -mx-1 mt-2.5 flex gap-1.5 overflow-x-auto px-1">
            {[{ key: 'all' as const, label: 'Toutes raretés' }, ...tiersPresent].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTier(t.key)}
                className={cn(
                  'h-8 shrink-0 rounded-full border px-3 text-xs font-semibold transition',
                  tier === t.key ? 'border-brand bg-brand text-white' : 'border-line bg-elev text-muted hover:text-fg',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ----------------------------- Grille ----------------------------- */}
      {isLoading ? (
        <CardGridSkeleton size={gridSize} />
      ) : visible.length === 0 ? (
        <EmptyState icon={Layers} title={own === 'missing' ? 'Aucune carte manquante !' : 'Aucune carte'}>
          {own === 'missing' ? 'Tu possèdes toutes les cartes correspondant à ce filtre.' : 'Aucune carte ne correspond à ces filtres.'}
        </EmptyState>
      ) : (
        <CardGrid size={gridSize}>
          {visible.map((c) => {
            const owned = index.byCard.get(c.id)
            const isSecret = official > 0 && /^\d+$/.test(c.localId) && Number(c.localId) > official
            return (
              <CardTile
                key={c.id}
                card={c}
                quantity={owned?.total ?? 0}
                wished={wishIds.has(c.id)}
                onOpen={() => (quick ? quickAdd(c) : openCard(c.id, visibleIds))}
                onAdd={() => quickAdd(c)}
                onRemove={() => removeOne(c.id)}
                badge={
                  isSecret ? (
                    <span className="pointer-events-none absolute bottom-1.5 right-1.5 rounded-md bg-accent px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#1d2c5e] shadow">
                      Secrète
                    </span>
                  ) : null
                }
              />
            )
          })}
        </CardGrid>
      )}
    </div>
  )
}
