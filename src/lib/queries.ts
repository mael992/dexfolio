import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useSettings } from './settings'
import {
  EXCLUDED_SERIES,
  localizeCardName,
  NotFoundError,
  tcgdex,
  type CardDetail,
  type CardMeta,
  type Lang,
  type SetBrief,
  type SetDetail,
} from './tcgdex'
import { mapLimit, readLocal, writeLocal } from './utils'
import { EXTRA_SETS, extraCardDetail, extraSetDetail, extraSetMeta, isExtraCardId, isExtraSetId } from './extra-sets'

/* ------------------------------------------------------------------ */
/* Catalogue : séries + extensions (mis en cache 12 h dans le navigateur) */
/* ------------------------------------------------------------------ */

export interface CatalogSet extends SetBrief {
  serieId: string
  serieName: string
  /** 0 = extension la plus récente */
  order: number
}

export interface CatalogSerie {
  id: string
  name: string
  logo?: string
  releaseDate?: string
  sets: CatalogSet[]
}

export interface Catalog {
  series: CatalogSerie[]
  sets: CatalogSet[]
  byId: Map<string, CatalogSet>
}

interface RawCatalog {
  savedAt: number
  series: Omit<CatalogSerie, 'sets'>[]
  sets: Omit<CatalogSet, 'order'>[][]
}

const CATALOG_TTL = 12 * 60 * 60 * 1000

async function fetchRawCatalog(lang: Lang, signal?: AbortSignal): Promise<RawCatalog> {
  const briefs = (await tcgdex.series(lang, signal)).filter((s) => !EXCLUDED_SERIES.has(s.id))
  const details = await mapLimit(briefs, 6, (b) => tcgdex.serie(lang, b.id, signal).catch(() => null))
  const ok = details.filter((d): d is NonNullable<typeof d> => !!d && d.sets?.length > 0)
  ok.sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''))
  // Certaines listes traduites sont incomplètes (ex. énergies de base) : on retient le total anglais s'il est plus grand.
  const enTotals = new Map<string, number>()
  if (lang !== 'en') {
    const en = await mapLimit(ok, 6, (s) => tcgdex.serie('en', s.id, signal).catch(() => null))
    for (const s of en) for (const set of s?.sets ?? []) enTotals.set(set.id, set.cardCount.total)
  }
  const raw: RawCatalog = {
    savedAt: Date.now(),
    series: ok.map((s) => ({ id: s.id, name: s.name, logo: s.logo, releaseDate: s.releaseDate })),
    sets: ok.map((s) =>
      [...s.sets].reverse().map((set) => ({
        ...set,
        cardCount: { ...set.cardCount, total: Math.max(set.cardCount.total, enTotals.get(set.id) ?? 0) },
        serieId: s.id,
        serieName: s.name,
      })),
    ),
  }
  writeLocal(`dexfolio:catalog:v2:${lang}`, raw)
  savedCatalogs.set(lang, raw)
  return raw
}

function buildCatalog(raw: RawCatalog): Catalog {
  let order = 0
  const series: CatalogSerie[] = raw.series.map((s, i) => {
    // Extensions maison (cartes absentes des bases) : rangées en tête de leur série
    const extras = EXTRA_SETS.filter((e) => e.serieId === s.id).map((e) => ({
      id: e.id,
      name: e.name,
      cardCount: { total: e.cards.length, official: e.cards.length },
      serieId: s.id,
      serieName: s.name,
    }))
    return { ...s, sets: [...extras, ...(raw.sets[i] ?? [])].map((set) => ({ ...set, order: order++ })) }
  })
  const sets = series.flatMap((s) => s.sets)
  return { series, sets, byId: new Map(sets.map((s) => [s.id, s])) }
}

const savedCatalogs = new Map<Lang, RawCatalog | null>()

function savedCatalog(lang: Lang): RawCatalog | null {
  if (!savedCatalogs.has(lang)) {
    const raw = readLocal<RawCatalog | null>(`dexfolio:catalog:v2:${lang}`, null)
    savedCatalogs.set(lang, raw && Array.isArray(raw.series) && Array.isArray(raw.sets) ? raw : null)
  }
  return savedCatalogs.get(lang) ?? null
}

export function catalogQuery(lang: Lang) {
  const cached = savedCatalog(lang)
  return queryOptions({
    queryKey: ['catalog', 2, lang],
    queryFn: ({ signal }) => fetchRawCatalog(lang, signal),
    staleTime: CATALOG_TTL,
    gcTime: 24 * 60 * 60 * 1000,
    initialData: cached ?? undefined,
    initialDataUpdatedAt: cached?.savedAt,
  })
}

export function useCatalog() {
  const { cardLang } = useSettings()
  const q = useQuery(catalogQuery(cardLang))
  const catalog = useMemo(() => (q.data ? buildCatalog(q.data) : undefined), [q.data])
  return { ...q, catalog }
}

/* ------------------------------------------------------------------ */
/* Extensions, cartes : repli sur l'anglais si la langue n'existe pas   */
/* ------------------------------------------------------------------ */

async function withFallback<T extends object>(lang: Lang, fn: (l: Lang) => Promise<T>): Promise<T & { _lang: Lang }> {
  try {
    return Object.assign(await fn(lang), { _lang: lang })
  } catch (e) {
    if (e instanceof NotFoundError && lang !== 'en') return Object.assign(await fn('en'), { _lang: 'en' as Lang })
    throw e
  }
}

/**
 * Extension dans la langue choisie, complétée par les cartes que seule la base anglaise connaît
 * (ex. les 9 énergies de base de Soleil et Lune, absentes de la liste française).
 */
async function fetchSetMerged(lang: Lang, setId: string, signal?: AbortSignal) {
  if (isExtraSetId(setId)) {
    const extra = extraSetDetail(setId)
    if (!extra) throw new NotFoundError(setId)
    return extra
  }
  const set = await withFallback<SetDetail>(lang, (l) => tcgdex.set(l, setId, signal))
  if (set._lang === 'en') return set
  const en = await tcgdex.set('en', setId, signal).catch(() => null)
  if (!en) return set
  const known = new Set(set.cards.map((c) => c.id))
  const extra = en.cards
    .filter((c) => !known.has(c.id))
    // image retirée : l'app affichera l'image anglaise avec le badge « EN »
    .map((c) => ({ ...c, name: localizeCardName(c.name, lang), image: undefined, enOnly: true }))
  if (!extra.length) return set
  const cards = [...set.cards, ...extra].sort((a, b) => a.localId.localeCompare(b.localId, undefined, { numeric: true }))
  return { ...set, cards, cardCount: { ...set.cardCount, total: Math.max(set.cardCount.total, cards.length) } }
}

export function setQuery(lang: Lang, setId: string) {
  return queryOptions({
    queryKey: ['set', 2, lang, setId],
    queryFn: ({ signal }) => fetchSetMerged(lang, setId, signal),
    staleTime: 6 * 60 * 60 * 1000,
  })
}

export function setMetaQuery(setId: string) {
  return queryOptions({
    queryKey: ['setMeta', setId],
    queryFn: ({ signal }) => (isExtraSetId(setId) ? Promise.resolve(extraSetMeta(setId) ?? {}) : tcgdex.setMeta(setId, signal)),
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  })
}

export function cardQuery(lang: Lang, cardId: string) {
  return queryOptions({
    queryKey: ['card', lang, cardId],
    queryFn: async ({ signal }) => {
      if (isExtraCardId(cardId)) {
        const extra = extraCardDetail(cardId)
        if (!extra) throw new NotFoundError(cardId)
        return extra
      }
      const card = await withFallback<CardDetail>(lang, (l) => tcgdex.card(l, cardId, signal))
      return card._lang === lang ? card : { ...card, name: localizeCardName(card.name, lang) }
    },
    staleTime: 6 * 60 * 60 * 1000,
  })
}

export function useSet(setId: string | undefined) {
  const { cardLang } = useSettings()
  return useQuery({ ...setQuery(cardLang, setId ?? ''), enabled: !!setId })
}

export function useSetMeta(setId: string | undefined) {
  return useQuery({ ...setMetaQuery(setId ?? ''), enabled: !!setId })
}

export function useCard(cardId: string | null | undefined) {
  const { cardLang } = useSettings()
  return useQuery({ ...cardQuery(cardLang, cardId ?? ''), enabled: !!cardId })
}

export function fetchCard(qc: QueryClient, lang: Lang, cardId: string) {
  return qc.fetchQuery(cardQuery(lang, cardId))
}

export type { CardMeta }
