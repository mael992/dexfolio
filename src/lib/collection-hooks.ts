import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { toast } from 'sonner'
import { useAuth } from './auth'
import { itemKey, type CardSnapshot, type CollectionItem, type WishlistItem } from './collection'
import type { Lang, Variant } from './tcgdex'

/* ------------------------------------------------------------------ */
/* Lecture de la collection                                            */
/* ------------------------------------------------------------------ */

export function useCollectionQuery() {
  const { repo, userKey, status } = useAuth()
  return useQuery({
    queryKey: ['collection', userKey],
    queryFn: () => repo.listCollection(),
    enabled: status === 'signedIn',
    staleTime: Infinity,
  })
}

export interface OwnedCard {
  cardId: string
  setId: string
  name: string
  localId: string | null
  image: string | null
  rarity: string | null
  dexIds: number[]
  total: number
  variants: Partial<Record<Variant, number>>
  langs: Lang[]
  updatedAt: string
  createdAt: string
}

export interface CollectionIndex {
  items: CollectionItem[]
  byCard: Map<string, OwnedCard>
  /** Nombre de cartes différentes possédées par extension */
  bySet: Map<string, number>
  /** Cartes possédées par n° de Pokédex national */
  byDex: Map<number, OwnedCard[]>
  totalCopies: number
  uniqueCards: number
  setsStarted: number
  recent: OwnedCard[]
}

export function buildIndex(items: CollectionItem[]): CollectionIndex {
  const byCard = new Map<string, OwnedCard>()
  let totalCopies = 0
  for (const it of items) {
    totalCopies += it.quantity
    let e = byCard.get(it.card_id)
    if (!e) {
      e = {
        cardId: it.card_id,
        setId: it.set_id,
        name: it.card_name,
        localId: it.card_local_id,
        image: it.card_image,
        rarity: it.rarity,
        dexIds: it.dex_ids ?? [],
        total: 0,
        variants: {},
        langs: [],
        updatedAt: it.updated_at,
        createdAt: it.created_at,
      }
      byCard.set(it.card_id, e)
    }
    e.total += it.quantity
    e.variants[it.variant] = (e.variants[it.variant] ?? 0) + it.quantity
    if (!e.langs.includes(it.lang)) e.langs.push(it.lang)
    if (it.updated_at > e.updatedAt) e.updatedAt = it.updated_at
    if (it.created_at < e.createdAt) e.createdAt = it.created_at
    if (!e.image && it.card_image) e.image = it.card_image
    if (!e.dexIds.length && it.dex_ids?.length) e.dexIds = it.dex_ids
  }
  const bySet = new Map<string, number>()
  const byDex = new Map<number, OwnedCard[]>()
  for (const c of byCard.values()) {
    bySet.set(c.setId, (bySet.get(c.setId) ?? 0) + 1)
    for (const n of c.dexIds) {
      const list = byDex.get(n)
      if (list) list.push(c)
      else byDex.set(n, [c])
    }
  }
  const recent = [...byCard.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  return { items, byCard, bySet, byDex, totalCopies, uniqueCards: byCard.size, setsStarted: bySet.size, recent }
}

const EMPTY: CollectionIndex = buildIndex([])

export function useCollection() {
  const q = useCollectionQuery()
  const index = useMemo(() => (q.data ? buildIndex(q.data) : EMPTY), [q.data])
  return { ...q, index }
}

/* ------------------------------------------------------------------ */
/* Ajout / retrait d'exemplaires (optimiste, opérations atomiques en BDD) */
/* ------------------------------------------------------------------ */

export interface AdjustVars {
  card: CardSnapshot
  lang: Lang
  variant: Variant
  delta: number
  /** Message affiché après succès (facultatif) */
  silent?: boolean
}

const pendingByKey = new Map<string, number>()

function applyDelta(items: CollectionItem[], v: AdjustVars): CollectionItem[] {
  const key = itemKey(v.card.cardId, v.lang, v.variant)
  const idx = items.findIndex((i) => itemKey(i.card_id, i.lang, i.variant) === key)
  const now = new Date().toISOString()
  if (idx >= 0) {
    const qty = items[idx].quantity + v.delta
    if (qty <= 0) return items.filter((_, i) => i !== idx)
    const copy = items.slice()
    copy[idx] = { ...items[idx], quantity: Math.min(qty, 9999), updated_at: now }
    return copy
  }
  if (v.delta <= 0) return items
  return [
    {
      id: `tmp-${key}`,
      card_id: v.card.cardId,
      set_id: v.card.setId,
      lang: v.lang,
      variant: v.variant,
      quantity: v.delta,
      card_name: v.card.name,
      card_local_id: v.card.localId,
      card_image: v.card.image,
      rarity: v.card.rarity,
      dex_ids: v.card.dexIds,
      created_at: now,
      updated_at: now,
    },
    ...items,
  ]
}

export function useAdjustCard() {
  const qc = useQueryClient()
  const { repo, userKey } = useAuth()
  const queryKey = ['collection', userKey]

  return useMutation({
    mutationFn: (v: AdjustVars) => repo.adjust(v.card, v.lang, v.variant, v.delta),
    onMutate: async (v) => {
      const key = itemKey(v.card.cardId, v.lang, v.variant)
      pendingByKey.set(key, (pendingByKey.get(key) ?? 0) + 1)
      await qc.cancelQueries({ queryKey })
      const previous = qc.getQueryData<CollectionItem[]>(queryKey)
      qc.setQueryData<CollectionItem[]>(queryKey, (old = []) => applyDelta(old, v))
      return { previous, key }
    },
    onError: (err, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKey, ctx.previous)
      toast.error('Impossible de mettre à jour la collection', { description: (err as Error).message })
    },
    onSuccess: (row, _v, ctx) => {
      // On ne réconcilie qu'avec la dernière réponse pour éviter les « sauts » lors de clics rapides.
      if (!ctx || (pendingByKey.get(ctx.key) ?? 0) > 1) return
      qc.setQueryData<CollectionItem[]>(queryKey, (old = []) => {
        const without = old.filter((i) => itemKey(i.card_id, i.lang, i.variant) !== ctx.key)
        return row ? [row, ...without] : without
      })
    },
    onSettled: (_d, _e, _v, ctx) => {
      if (!ctx) return
      const n = (pendingByKey.get(ctx.key) ?? 1) - 1
      if (n <= 0) pendingByKey.delete(ctx.key)
      else pendingByKey.set(ctx.key, n)
    },
  })
}

/* ------------------------------------------------------------------ */
/* Liste d'envies                                                      */
/* ------------------------------------------------------------------ */

export function useWishlist() {
  const { repo, userKey, status } = useAuth()
  const q = useQuery({
    queryKey: ['wishlist', userKey],
    queryFn: () => repo.listWishlist(),
    enabled: status === 'signedIn',
    staleTime: Infinity,
  })
  const ids = useMemo(() => new Set((q.data ?? []).map((w) => w.card_id)), [q.data])
  return { ...q, ids }
}

export function useToggleWish() {
  const qc = useQueryClient()
  const { repo, userKey } = useAuth()
  const queryKey = ['wishlist', userKey]
  return useMutation({
    mutationFn: async ({ card, wished }: { card: CardSnapshot; wished: boolean }) => {
      if (wished) await repo.removeWish(card.cardId)
      else await repo.addWish(card)
    },
    onMutate: async ({ card, wished }) => {
      await qc.cancelQueries({ queryKey })
      const previous = qc.getQueryData<WishlistItem[]>(queryKey)
      qc.setQueryData<WishlistItem[]>(queryKey, (old = []) =>
        wished
          ? old.filter((w) => w.card_id !== card.cardId)
          : [
              {
                card_id: card.cardId,
                set_id: card.setId,
                card_name: card.name,
                card_local_id: card.localId,
                card_image: card.image,
                priority: 0,
                created_at: new Date().toISOString(),
              },
              ...old.filter((w) => w.card_id !== card.cardId),
            ],
      )
      return { previous }
    },
    onError: (err, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(queryKey, ctx.previous)
      toast.error('Impossible de mettre à jour la liste d’envies', { description: (err as Error).message })
    },
    onSuccess: (_d, { wished, card }) => {
      toast(wished ? 'Retirée de tes envies' : 'Ajoutée à tes envies', { description: card.name })
    },
  })
}
