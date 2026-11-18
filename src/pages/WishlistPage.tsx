import { useQueryClient } from '@tanstack/react-query'
import { Check, Heart, HeartOff, Search } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Link } from 'react-router'
import { CardGrid, CardTile } from '../components/cards'
import { buttonClass, EmptyState, PageHeader } from '../components/ui'
import { useCardSheet } from '../lib/card-sheet'
import { useCollection, useToggleWish, useWishlist } from '../lib/collection-hooks'
import { priceOf, refreshPrices, usePriceVersion } from '../lib/prices'
import { useCatalog } from '../lib/queries'
import { useQuickAdd } from '../lib/quick-add'
import { useSettings } from '../lib/settings'
import { fmtEur } from '../lib/utils'

export default function WishlistPage() {
  const { data: wishes = [], isLoading } = useWishlist()
  const { index } = useCollection()
  const { catalog } = useCatalog()
  const { openCard } = useCardSheet()
  const toggle = useToggleWish()
  const { add } = useQuickAdd()
  const { cardLang } = useSettings()
  const qc = useQueryClient()
  usePriceVersion()

  const ids = useMemo(() => wishes.map((w) => w.card_id), [wishes])
  useEffect(() => {
    if (ids.length) void refreshPrices(qc, cardLang, ids)
  }, [ids, qc, cardLang])

  const total = wishes.reduce((s, w) => s + (priceOf(w.card_id, 'normal') ?? 0), 0)

  return (
    <div>
      <PageHeader
        eyebrow="Collection"
        title="Liste d’envies"
        subtitle={
          wishes.length
            ? `${wishes.length} carte${wishes.length > 1 ? 's' : ''} recherchée${wishes.length > 1 ? 's' : ''} · budget estimé ${fmtEur(total)} (cote Cardmarket)`
            : 'Les cartes que tu recherches, au même endroit.'
        }
      />
      {!isLoading && wishes.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Ta liste d’envies est vide"
          action={
            <Link to="/recherche" className={buttonClass('primary', 'md')}>
              <Search className="size-4" /> Trouver des cartes
            </Link>
          }
        >
          Ouvre une carte et touche « Ajouter à ma liste d’envies » pour la retrouver ici.
        </EmptyState>
      ) : (
        <CardGrid size="lg">
          {wishes.map((w) => {
            const price = priceOf(w.card_id, 'normal')
            const owned = index.byCard.get(w.card_id)?.total ?? 0
            const snapshot = {
              cardId: w.card_id,
              setId: w.set_id,
              name: w.card_name,
              localId: w.card_local_id,
              image: w.card_image,
              rarity: null,
              dexIds: [],
            }
            return (
              <div key={w.card_id} className="flex flex-col">
                <CardTile
                  card={{ id: w.card_id, localId: w.card_local_id ?? '', name: w.card_name, image: w.card_image }}
                  quantity={owned}
                  dimMissing={false}
                  subtitle={
                    <span className="flex justify-between gap-2">
                      <span className="truncate">{catalog?.byId.get(w.set_id)?.name}</span>
                      {price != null && <strong className="shrink-0 text-success">{fmtEur(price)}</strong>}
                    </span>
                  }
                  onOpen={() => openCard(w.card_id, ids)}
                />
                <div className="mt-2 grid grid-cols-[1fr_auto] gap-1.5">
                  <button
                    type="button"
                    onClick={async () => {
                      const ok = await add(w.card_id, { notify: true })
                      if (ok) toggle.mutate({ card: snapshot, wished: true })
                    }}
                    className={buttonClass('soft', 'sm', 'w-full')}
                  >
                    <Check className="size-4" /> Je l’ai !
                  </button>
                  <button
                    type="button"
                    onClick={() => toggle.mutate({ card: snapshot, wished: true })}
                    aria-label={`Retirer ${w.card_name} de la liste d’envies`}
                    className={buttonClass('ghost', 'icon-sm')}
                  >
                    <HeartOff className="size-4" />
                  </button>
                </div>
              </div>
            )
          })}
        </CardGrid>
      )}
    </div>
  )
}
