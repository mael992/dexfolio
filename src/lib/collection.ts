import type { SupabaseClient } from '@supabase/supabase-js'
import { isLang, isVariant, type CardDetail, type CardMeta, type Lang, type Variant } from './tcgdex'
import { chunk, readLocal, writeLocal } from './utils'

export interface CollectionItem {
  id: string
  card_id: string
  set_id: string
  lang: Lang
  variant: Variant
  quantity: number
  card_name: string
  card_local_id: string | null
  card_image: string | null
  rarity: string | null
  dex_ids: number[]
  created_at: string
  updated_at: string
}

export interface WishlistItem {
  card_id: string
  set_id: string
  card_name: string
  card_local_id: string | null
  card_image: string | null
  priority: number
  created_at: string
}

/** Instantané d'une carte, stocké avec la collection (affichage hors-ligne, Pokédex…). */
export interface CardSnapshot {
  cardId: string
  setId: string
  name: string
  localId: string | null
  image: string | null
  rarity: string | null
  dexIds: number[]
}

export interface ExportFile {
  app: 'dexfolio'
  version: 1
  exportedAt: string
  collection: CollectionItem[]
  wishlist: WishlistItem[]
}

export interface Repo {
  kind: 'supabase' | 'local'
  listCollection(): Promise<CollectionItem[]>
  /** Ajoute (delta > 0) ou retire (delta < 0) des exemplaires ; renvoie la ligne ou null si supprimée. */
  adjust(card: CardSnapshot, lang: Lang, variant: Variant, delta: number): Promise<CollectionItem | null>
  listWishlist(): Promise<WishlistItem[]>
  addWish(card: CardSnapshot): Promise<WishlistItem>
  removeWish(cardId: string): Promise<void>
  importData(data: Pick<ExportFile, 'collection' | 'wishlist'>, mode: 'merge' | 'replace'): Promise<void>
  clearAll(): Promise<void>
}

export const itemKey = (cardId: string, lang: string, variant: string) => `${cardId}|${lang}|${variant}`

export function snapshotFromDetail(d: CardDetail): CardSnapshot {
  return {
    cardId: d.id,
    setId: d.set.id,
    name: d.name,
    localId: d.localId ?? null,
    image: d.image ?? null,
    rarity: d.rarity ?? null,
    dexIds: d.dexId ?? [],
  }
}

export function snapshotFromBrief(
  brief: { id: string; localId: string; name: string; image?: string },
  setId: string,
  meta?: CardMeta | null,
): CardSnapshot {
  return {
    cardId: brief.id,
    setId,
    name: brief.name,
    localId: brief.localId ?? null,
    image: brief.image ?? null,
    rarity: meta?.rarity ?? null,
    dexIds: meta?.dexId ?? [],
  }
}

/* ------------------------------------------------------------------ */
/* Validation des imports                                              */
/* ------------------------------------------------------------------ */

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.slice(0, max) : null)

export function sanitizeImport(raw: unknown): Pick<ExportFile, 'collection' | 'wishlist'> {
  const obj = (raw ?? {}) as Record<string, unknown>
  const now = new Date().toISOString()
  const collection: CollectionItem[] = []
  for (const r of Array.isArray(obj.collection) ? obj.collection : []) {
    const x = r as Record<string, unknown>
    const cardId = str(x.card_id, 80)
    const setId = str(x.set_id, 80)
    const qty = Math.floor(Number(x.quantity))
    if (!cardId || !setId || !Number.isFinite(qty) || qty < 1) continue
    collection.push({
      id: crypto.randomUUID(),
      card_id: cardId,
      set_id: setId,
      lang: isLang(x.lang) ? x.lang : 'fr',
      variant: isVariant(x.variant) ? x.variant : 'normal',
      quantity: Math.min(qty, 9999),
      card_name: str(x.card_name, 120) ?? cardId,
      card_local_id: str(x.card_local_id, 20),
      card_image: str(x.card_image, 300),
      rarity: str(x.rarity, 60),
      dex_ids: Array.isArray(x.dex_ids) ? x.dex_ids.map(Number).filter((n) => Number.isInteger(n) && n > 0 && n < 5000) : [],
      created_at: str(x.created_at, 40) ?? now,
      updated_at: str(x.updated_at, 40) ?? now,
    })
  }
  const wishlist: WishlistItem[] = []
  for (const r of Array.isArray(obj.wishlist) ? obj.wishlist : []) {
    const x = r as Record<string, unknown>
    const cardId = str(x.card_id, 80)
    const setId = str(x.set_id, 80)
    if (!cardId || !setId) continue
    wishlist.push({
      card_id: cardId,
      set_id: setId,
      card_name: str(x.card_name, 120) ?? cardId,
      card_local_id: str(x.card_local_id, 20),
      card_image: str(x.card_image, 300),
      priority: Math.max(0, Math.min(3, Math.floor(Number(x.priority) || 0))),
      created_at: str(x.created_at, 40) ?? now,
    })
  }
  return { collection, wishlist }
}

/* ------------------------------------------------------------------ */
/* Supabase (Postgres + RLS)                                           */
/* ------------------------------------------------------------------ */

export class SupabaseRepo implements Repo {
  readonly kind = 'supabase' as const
  private readonly sb: SupabaseClient
  private readonly userId: string

  constructor(sb: SupabaseClient, userId: string) {
    this.sb = sb
    this.userId = userId
  }

  async listCollection(): Promise<CollectionItem[]> {
    const pageSize = 1000
    const all: CollectionItem[] = []
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await this.sb
        .from('collection_items')
        .select('*')
        .order('updated_at', { ascending: false })
        .order('id', { ascending: true })
        .range(from, from + pageSize - 1)
      if (error) throw error
      all.push(...((data ?? []) as CollectionItem[]))
      if (!data || data.length < pageSize) break
    }
    return all
  }

  async adjust(card: CardSnapshot, lang: Lang, variant: Variant, delta: number): Promise<CollectionItem | null> {
    const { data, error } = await this.sb.rpc('adjust_card_quantity', {
      p_card_id: card.cardId,
      p_set_id: card.setId,
      p_lang: lang,
      p_variant: variant,
      p_delta: delta,
      p_card_name: card.name,
      p_card_local_id: card.localId,
      p_card_image: card.image,
      p_rarity: card.rarity,
      p_dex_ids: card.dexIds,
    })
    if (error) throw error
    const rows = (Array.isArray(data) ? data : data ? [data] : []) as CollectionItem[]
    return rows[0] ?? null
  }

  async listWishlist(): Promise<WishlistItem[]> {
    const { data, error } = await this.sb.from('wishlist_items').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as WishlistItem[]
  }

  async addWish(card: CardSnapshot): Promise<WishlistItem> {
    const { data, error } = await this.sb
      .from('wishlist_items')
      .upsert(
        {
          user_id: this.userId,
          card_id: card.cardId,
          set_id: card.setId,
          card_name: card.name,
          card_local_id: card.localId,
          card_image: card.image,
        },
        { onConflict: 'user_id,card_id' },
      )
      .select()
      .single()
    if (error) throw error
    return data as WishlistItem
  }

  async removeWish(cardId: string): Promise<void> {
    const { error } = await this.sb.from('wishlist_items').delete().eq('user_id', this.userId).eq('card_id', cardId)
    if (error) throw error
  }

  async importData(data: Pick<ExportFile, 'collection' | 'wishlist'>, mode: 'merge' | 'replace'): Promise<void> {
    if (mode === 'replace') await this.clearAll()
    for (const batch of chunk(data.collection, 500)) {
      const rows = batch.map((i) => ({
        user_id: this.userId,
        card_id: i.card_id,
        set_id: i.set_id,
        lang: i.lang,
        variant: i.variant,
        quantity: i.quantity,
        card_name: i.card_name,
        card_local_id: i.card_local_id,
        card_image: i.card_image,
        rarity: i.rarity,
        dex_ids: i.dex_ids,
      }))
      const { error } = await this.sb.from('collection_items').upsert(rows, { onConflict: 'user_id,card_id,lang,variant' })
      if (error) throw error
    }
    for (const batch of chunk(data.wishlist, 500)) {
      const rows = batch.map((w) => ({
        user_id: this.userId,
        card_id: w.card_id,
        set_id: w.set_id,
        card_name: w.card_name,
        card_local_id: w.card_local_id,
        card_image: w.card_image,
        priority: w.priority,
      }))
      const { error } = await this.sb.from('wishlist_items').upsert(rows, { onConflict: 'user_id,card_id' })
      if (error) throw error
    }
  }

  async clearAll(): Promise<void> {
    const a = await this.sb.from('collection_items').delete().eq('user_id', this.userId)
    if (a.error) throw a.error
    const b = await this.sb.from('wishlist_items').delete().eq('user_id', this.userId)
    if (b.error) throw b.error
  }
}

/* ------------------------------------------------------------------ */
/* Mode local (navigateur) — utilisé tant que Supabase n'est pas branché */
/* ------------------------------------------------------------------ */

const KEY_COLLECTION = 'dexfolio:local:collection'
const KEY_WISHLIST = 'dexfolio:local:wishlist'

export class LocalRepo implements Repo {
  readonly kind = 'local' as const

  async listCollection(): Promise<CollectionItem[]> {
    return readLocal<CollectionItem[]>(KEY_COLLECTION, []).sort((a, b) => b.updated_at.localeCompare(a.updated_at))
  }

  async adjust(card: CardSnapshot, lang: Lang, variant: Variant, delta: number): Promise<CollectionItem | null> {
    const items = readLocal<CollectionItem[]>(KEY_COLLECTION, [])
    const key = itemKey(card.cardId, lang, variant)
    const idx = items.findIndex((i) => itemKey(i.card_id, i.lang, i.variant) === key)
    const now = new Date().toISOString()
    if (idx >= 0) {
      const qty = items[idx].quantity + delta
      if (qty <= 0) {
        items.splice(idx, 1)
        writeLocal(KEY_COLLECTION, items)
        return null
      }
      const updated: CollectionItem = {
        ...items[idx],
        quantity: Math.min(qty, 9999),
        card_name: card.name,
        card_image: card.image ?? items[idx].card_image,
        rarity: card.rarity ?? items[idx].rarity,
        dex_ids: card.dexIds.length ? card.dexIds : items[idx].dex_ids,
        updated_at: now,
      }
      items[idx] = updated
      writeLocal(KEY_COLLECTION, items)
      return updated
    }
    if (delta <= 0) return null
    const created: CollectionItem = {
      id: crypto.randomUUID(),
      card_id: card.cardId,
      set_id: card.setId,
      lang,
      variant,
      quantity: Math.min(delta, 9999),
      card_name: card.name,
      card_local_id: card.localId,
      card_image: card.image,
      rarity: card.rarity,
      dex_ids: card.dexIds,
      created_at: now,
      updated_at: now,
    }
    items.push(created)
    writeLocal(KEY_COLLECTION, items)
    return created
  }

  async listWishlist(): Promise<WishlistItem[]> {
    return readLocal<WishlistItem[]>(KEY_WISHLIST, []).sort((a, b) => b.created_at.localeCompare(a.created_at))
  }

  async addWish(card: CardSnapshot): Promise<WishlistItem> {
    const list = readLocal<WishlistItem[]>(KEY_WISHLIST, []).filter((w) => w.card_id !== card.cardId)
    const item: WishlistItem = {
      card_id: card.cardId,
      set_id: card.setId,
      card_name: card.name,
      card_local_id: card.localId,
      card_image: card.image,
      priority: 0,
      created_at: new Date().toISOString(),
    }
    list.push(item)
    writeLocal(KEY_WISHLIST, list)
    return item
  }

  async removeWish(cardId: string): Promise<void> {
    writeLocal(
      KEY_WISHLIST,
      readLocal<WishlistItem[]>(KEY_WISHLIST, []).filter((w) => w.card_id !== cardId),
    )
  }

  async importData(data: Pick<ExportFile, 'collection' | 'wishlist'>, mode: 'merge' | 'replace'): Promise<void> {
    const current = mode === 'replace' ? [] : readLocal<CollectionItem[]>(KEY_COLLECTION, [])
    const byKey = new Map(current.map((i) => [itemKey(i.card_id, i.lang, i.variant), i]))
    for (const i of data.collection) byKey.set(itemKey(i.card_id, i.lang, i.variant), i)
    writeLocal(KEY_COLLECTION, [...byKey.values()])
    const wishes = mode === 'replace' ? [] : readLocal<WishlistItem[]>(KEY_WISHLIST, [])
    const wByCard = new Map(wishes.map((w) => [w.card_id, w]))
    for (const w of data.wishlist) wByCard.set(w.card_id, w)
    writeLocal(KEY_WISHLIST, [...wByCard.values()])
  }

  async clearAll(): Promise<void> {
    writeLocal(KEY_COLLECTION, [])
    writeLocal(KEY_WISHLIST, [])
  }
}

export const localRepo = new LocalRepo()
