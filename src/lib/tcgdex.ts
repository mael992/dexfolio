/**
 * Client minimal de l'API ouverte TCGdex (https://tcgdex.dev) — données et images des cartes.
 * Les identifiants de cartes/extensions sont identiques d'une langue à l'autre.
 */
const API = 'https://api.tcgdex.net/v2'

export type Lang = 'fr' | 'en' | 'de' | 'es' | 'it' | 'pt'

export const LANGS: { code: Lang; label: string; short: string }[] = [
  { code: 'fr', label: 'Français', short: 'FR' },
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'de', label: 'Deutsch', short: 'DE' },
  { code: 'es', label: 'Español', short: 'ES' },
  { code: 'it', label: 'Italiano', short: 'IT' },
  { code: 'pt', label: 'Português', short: 'PT' },
]

export function isLang(v: unknown): v is Lang {
  return typeof v === 'string' && LANGS.some((l) => l.code === v)
}

/** Séries exclues : jeu mobile « TCG Pocket » (cartes numériques, pas physiques). */
export const EXCLUDED_SERIES = new Set(['tcgp'])

export interface CardBrief {
  id: string
  localId: string
  name: string
  image?: string
}

export interface CardCount {
  total: number
  official: number
  normal?: number
  reverse?: number
  holo?: number
  firstEd?: number
}

export interface SetBrief {
  id: string
  name: string
  logo?: string
  symbol?: string
  cardCount: CardCount
}

export interface SerieBrief {
  id: string
  name: string
  logo?: string
}

export interface SerieDetail extends SerieBrief {
  releaseDate?: string
  sets: SetBrief[]
}

export interface SetDetail extends SetBrief {
  releaseDate?: string
  serie: { id: string; name: string }
  abbreviation?: { official?: string; localized?: string }
  legal?: { standard: boolean; expanded: boolean }
  cards: CardBrief[]
}

export interface CardVariants {
  normal?: boolean
  reverse?: boolean
  holo?: boolean
  firstEdition?: boolean
  wPromo?: boolean
}

export interface CardmarketPricing {
  unit?: string
  updated?: string
  idProduct?: number
  avg?: number | null
  low?: number | null
  trend?: number | null
  avg1?: number | null
  avg7?: number | null
  avg30?: number | null
  'avg-holo'?: number | null
  'low-holo'?: number | null
  'trend-holo'?: number | null
  'avg30-holo'?: number | null
}

export interface TcgplayerPrice {
  lowPrice?: number | null
  midPrice?: number | null
  highPrice?: number | null
  marketPrice?: number | null
}

export interface Pricing {
  cardmarket?: CardmarketPricing | null
  tcgplayer?: ({ unit?: string; updated?: string } & Record<string, TcgplayerPrice | string | undefined>) | null
}

export interface Attack {
  name: string
  cost?: string[]
  effect?: string
  damage?: string | number
}

export interface CardDetail extends CardBrief {
  category: string
  illustrator?: string
  rarity?: string
  set: SetBrief
  variants?: CardVariants
  dexId?: number[]
  hp?: number
  types?: string[]
  evolveFrom?: string
  description?: string
  stage?: string
  suffix?: string
  attacks?: Attack[]
  abilities?: { type?: string; name: string; effect?: string }[]
  weaknesses?: { type: string; value?: string }[]
  resistances?: { type: string; value?: string }[]
  retreat?: number
  regulationMark?: string
  effect?: string
  trainerType?: string
  energyType?: string
  legal?: { standard: boolean; expanded: boolean }
  pricing?: Pricing
}

/** Métadonnées indépendantes de la langue (rareté en anglais, variantes, n° de Pokédex). */
export interface CardMeta {
  id: string
  localId: string
  rarity?: string | null
  dexId?: number[] | null
  variants?: CardVariants | null
}

export class NotFoundError extends Error {
  constructor(path: string) {
    super(`Introuvable : ${path}`)
    this.name = 'NotFoundError'
  }
}

async function get<T>(lang: Lang, path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${API}/${lang}${path}`, { signal })
  if (res.status === 404) throw new NotFoundError(path)
  if (!res.ok) throw new Error(`TCGdex ${res.status} sur ${path}`)
  return (await res.json()) as T
}

export const tcgdex = {
  series: (lang: Lang, signal?: AbortSignal) => get<SerieBrief[]>(lang, '/series', signal),
  serie: (lang: Lang, id: string, signal?: AbortSignal) => get<SerieDetail>(lang, `/series/${encodeURIComponent(id)}`, signal),
  set: (lang: Lang, id: string, signal?: AbortSignal) => get<SetDetail>(lang, `/sets/${encodeURIComponent(id)}`, signal),
  card: (lang: Lang, id: string, signal?: AbortSignal) => get<CardDetail>(lang, `/cards/${encodeURIComponent(id)}`, signal),
  searchCards(lang: Lang, filters: Record<string, string>, signal?: AbortSignal, perPage = 250) {
    const qs = new URLSearchParams(filters)
    qs.set('pagination:page', '1')
    qs.set('pagination:itemsPerPage', String(perPage))
    return get<CardBrief[]>(lang, `/cards?${qs.toString()}`, signal)
  },
  dexId: (lang: Lang, n: number, signal?: AbortSignal) =>
    get<{ name: number | string; cards: CardBrief[] }>(lang, `/dex-ids/${n}`, signal),

  /** Rareté / variantes / n° de Pokédex de toutes les cartes d'une extension, en une requête GraphQL. */
  async setMeta(setId: string, signal?: AbortSignal): Promise<Record<string, CardMeta>> {
    const query = `{ cards(filters: { id: ${JSON.stringify(`${setId}-`)} }, pagination: { page: 1, itemsPerPage: 1000 }) { id localId rarity dexId variants { normal reverse holo firstEdition wPromo } } }`
    const res = await fetch(`${API}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
      signal,
    })
    if (!res.ok) throw new Error(`TCGdex GraphQL ${res.status}`)
    const json = (await res.json()) as { data?: { cards?: (CardMeta | null)[] } }
    const out: Record<string, CardMeta> = {}
    for (const c of json.data?.cards ?? []) {
      if (c && c.id.startsWith(`${setId}-`)) out[c.id] = c
    }
    return out
  },
}

export type ImageQuality = 'low' | 'high'

export function cardImageUrl(image: string | null | undefined, quality: ImageQuality = 'low'): string | undefined {
  return image ? `${image}/${quality}.webp` : undefined
}

export function setLogoUrl(logo?: string | null): string | undefined {
  return logo ? `${logo}.webp` : undefined
}

export function setSymbolUrl(symbol?: string | null): string | undefined {
  return symbol ? `${symbol}.webp` : undefined
}

export type Variant = 'normal' | 'reverse' | 'holo' | 'firstEdition' | 'wPromo'

export const VARIANTS: { key: Variant; label: string; short: string }[] = [
  { key: 'normal', label: 'Normale', short: 'N' },
  { key: 'reverse', label: 'Reverse', short: 'R' },
  { key: 'holo', label: 'Holo', short: 'H' },
  { key: 'firstEdition', label: '1ʳᵉ édition', short: '1' },
  { key: 'wPromo', label: 'Promo W', short: 'W' },
]

export function isVariant(v: unknown): v is Variant {
  return typeof v === 'string' && VARIANTS.some((x) => x.key === v)
}

export function availableVariants(v?: CardVariants | null): Variant[] {
  if (!v) return ['normal']
  const list = VARIANTS.map((x) => x.key).filter((k) => v[k])
  return list.length ? list : ['normal']
}

export type VariantSource = 'tcgplayer' | 'cardmarket' | 'tcgdex'

/**
 * Variantes VÉRIFIÉES d'une carte, de la source la plus sûre à la moins sûre :
 *  1. TCGplayer : chaque variante réellement vendue (normal / holofoil / reverse-holofoil / 1st-edition…) ;
 *  2. Cardmarket : un prix « holo » sur une carte non holo = une reverse existe ;
 *  3. sinon les indications de TCGdex (parfois incomplètes).
 * La 1ʳᵉ édition et le tampon W viennent toujours de TCGdex (plus précis sur les cartes anciennes).
 */
export function verifiedVariants(card: Pick<CardDetail, 'variants' | 'pricing'>): { list: Variant[]; source: VariantSource } {
  const base = card.variants ?? {}
  const tp = card.pricing?.tcgplayer
  const keys = tp ? Object.keys(tp).filter((k) => k !== 'unit' && k !== 'updated' && tp[k] && typeof tp[k] === 'object') : []
  const extras: Variant[] = []
  if (base.firstEdition || keys.some((k) => k.startsWith('1st-edition'))) extras.push('firstEdition')
  if (base.wPromo) extras.push('wPromo')
  const order = (list: Variant[]) => VARIANTS.map((v) => v.key).filter((k) => list.includes(k))

  if (keys.length) {
    const list: Variant[] = []
    if (keys.some((k) => k === 'normal' || k === 'unlimited' || k === '1st-edition' || k === '1st-edition-normal')) list.push('normal')
    if (keys.some((k) => k === 'holofoil' || k === 'unlimited-holofoil' || k === '1st-edition-holofoil')) list.push('holo')
    if (keys.includes('reverse-holofoil')) list.push('reverse')
    if (list.length) return { list: order([...list, ...extras]), source: 'tcgplayer' }
  }

  const listed = availableVariants(base)
  const cm = card.pricing?.cardmarket
  const holoPrice = [cm?.['avg-holo'], cm?.['trend-holo'], cm?.['low-holo']].some((p) => typeof p === 'number' && p > 0)
  if (cm && holoPrice && !listed.includes('reverse') && !listed.includes('holo')) {
    return { list: order([...listed, 'reverse', ...extras]), source: 'cardmarket' }
  }
  return { list: order([...listed, ...extras]), source: 'tcgdex' }
}

/** Variante « de base » : normale si elle existe, sinon holo, puis reverse… */
export function defaultVariant(v?: CardVariants | null): Variant {
  const avail = availableVariants(v)
  return pickDefault(avail)
}

export function pickDefault(avail: Variant[]): Variant {
  const order: Variant[] = ['normal', 'holo', 'reverse', 'firstEdition', 'wPromo']
  return order.find((k) => avail.includes(k)) ?? 'normal'
}

/** Prix Cardmarket (€) d'une variante : tendance, sinon moyennes. */
export function cardmarketPrice(pricing: Pricing | undefined | null, variant: Variant): number | null {
  const cm = pricing?.cardmarket
  if (!cm) return null
  const holoLike = variant === 'reverse' || variant === 'holo'
  const pick = (...vals: (number | null | undefined)[]) => vals.find((v) => typeof v === 'number' && v > 0) ?? null
  if (holoLike) {
    const h = pick(cm['trend-holo'], cm['avg-holo'], cm['avg30-holo'])
    if (h != null) return h
  }
  return pick(cm.trend, cm.avg, cm.avg30, cm.avg7)
}
