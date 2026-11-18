import type { QueryClient } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import type { CollectionIndex } from './collection-hooks'
import { cardQuery } from './queries'
import { cardmarketPrice, type CardDetail, type Lang, type Variant } from './tcgdex'
import { mapLimit, readLocal, writeLocal } from './utils'

/**
 * Cache local des prix Cardmarket (€) — indicatifs, rafraîchis à la demande.
 * Clé : identifiant de carte. TTL : 3 jours.
 */
interface PriceEntry {
  at: number
  normal: number | null
  holo: number | null
}

const KEY = 'dexfolio:prices'
const TTL = 3 * 24 * 60 * 60 * 1000

let store: Record<string, PriceEntry> = readLocal(KEY, {})
let version = 0
const listeners = new Set<() => void>()
let saveTimer: ReturnType<typeof setTimeout> | undefined

function emit() {
  version++
  listeners.forEach((l) => l())
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => writeLocal(KEY, store), 400)
}

export function rememberPrice(detail: CardDetail) {
  if (!detail.pricing) return
  store = {
    ...store,
    [detail.id]: {
      at: Date.now(),
      normal: cardmarketPrice(detail.pricing, 'normal'),
      holo: cardmarketPrice(detail.pricing, 'holo'),
    },
  }
  emit()
}

export function priceOf(cardId: string, variant: Variant): number | null {
  const e = store[cardId]
  if (!e) return null
  if (variant === 'reverse' || variant === 'holo') return e.holo ?? e.normal
  return e.normal ?? e.holo
}

export function usePriceVersion(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => version,
  )
}

export function collectionValue(index: CollectionIndex): { value: number; priced: number; total: number; stale: number } {
  let value = 0
  let priced = 0
  let stale = 0
  const now = Date.now()
  for (const it of index.items) {
    const p = priceOf(it.card_id, it.variant)
    const e = store[it.card_id]
    if (!e || now - e.at > TTL) stale++
    if (p != null) {
      value += p * it.quantity
      priced++
    }
  }
  return { value, priced, total: index.items.length, stale }
}

/** Récupère les prix manquants ou périmés (requêtes limitées à 6 en parallèle). */
export async function refreshPrices(
  qc: QueryClient,
  lang: Lang,
  cardIds: string[],
  onProgress?: (done: number, total: number) => void,
): Promise<number> {
  const now = Date.now()
  const todo = [...new Set(cardIds)].filter((id) => !store[id] || now - store[id].at > TTL)
  await mapLimit(
    todo,
    6,
    async (id) => {
      try {
        const d = await qc.fetchQuery(cardQuery(lang, id))
        rememberPrice(d)
        if (!d.pricing) store = { ...store, [id]: { at: Date.now(), normal: null, holo: null } }
      } catch {
        /* carte introuvable : on ignore */
      }
    },
    onProgress,
  )
  emit()
  return todo.length
}
