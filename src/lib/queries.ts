import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useSettings } from './settings'
import {
  EXCLUDED_SERIES,
  NotFoundError,
  tcgdex,
  type CardDetail,
  type CardMeta,
  type Lang,
  type SetBrief,
  type SetDetail,
} from './tcgdex'
import { mapLimit, readLocal, writeLocal } from './utils'

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
  const raw: RawCatalog = {
    savedAt: Date.now(),
    series: ok.map((s) => ({ id: s.id, name: s.name, logo: s.logo, releaseDate: s.releaseDate })),
    sets: ok.map((s) =>
      [...s.sets].reverse().map((set) => ({ ...set, serieId: s.id, serieName: s.name })),
    ),
  }
  writeLocal(`dexfolio:catalog:${lang}`, raw)
  savedCatalogs.set(lang, raw)
  return raw
}

function buildCatalog(raw: RawCatalog): Catalog {
  let order = 0
  const series: CatalogSerie[] = raw.series.map((s, i) => ({
    ...s,
    sets: (raw.sets[i] ?? []).map((set) => ({ ...set, order: order++ })),
  }))
  const sets = series.flatMap((s) => s.sets)
  return { series, sets, byId: new Map(sets.map((s) => [s.id, s])) }
}

const savedCatalogs = new Map<Lang, RawCatalog | null>()

function savedCatalog(lang: Lang): RawCatalog | null {
  if (!savedCatalogs.has(lang)) {
    const raw = readLocal<RawCatalog | null>(`dexfolio:catalog:${lang}`, null)
    savedCatalogs.set(lang, raw && Array.isArray(raw.series) && Array.isArray(raw.sets) ? raw : null)
  }
  return savedCatalogs.get(lang) ?? null
}

export function catalogQuery(lang: Lang) {
  const cached = savedCatalog(lang)
  return queryOptions({
    queryKey: ['catalog', lang],
    queryFn: ({ signal }) => fetchRawCatalog(lang, signal),
    staleTime: CATALOG_TTL,
    gcTime: 24 * 60 * 60 * 1000,
    initialData: cached ?? undefined,
    initialDataUpdatedAt: cached?.savedAt,
  })
}

/** Image anglaise de secours quand la carte n'a pas (encore) d'image dans la langue choisie. */
export function englishImage(catalog: Catalog | undefined, setId: string, localId: string | null | undefined): string | null {
  const s = catalog?.byId.get(setId)
  return s && localId ? `https://assets.tcgdex.net/en/${s.serieId}/${setId}/${localId}` : null
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

export function setQuery(lang: Lang, setId: string) {
  return queryOptions({
    queryKey: ['set', lang, setId],
    queryFn: ({ signal }) => withFallback<SetDetail>(lang, (l) => tcgdex.set(l, setId, signal)),
    staleTime: 6 * 60 * 60 * 1000,
  })
}

export function setMetaQuery(setId: string) {
  return queryOptions({
    queryKey: ['setMeta', setId],
    queryFn: ({ signal }) => tcgdex.setMeta(setId, signal),
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  })
}

export function cardQuery(lang: Lang, cardId: string) {
  return queryOptions({
    queryKey: ['card', lang, cardId],
    queryFn: ({ signal }) => withFallback<CardDetail>(lang, (l) => tcgdex.card(l, cardId, signal)),
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
