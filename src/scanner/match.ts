import type { QueryClient } from '@tanstack/react-query'
import { setQuery, type Catalog } from '../lib/queries'
import { searchExtraCards } from '../lib/extra-sets'
import { englishEnergyName, localizeCardName, tcgdex, type CardBrief, type Lang, type Variant } from '../lib/tcgdex'
import { normNum, normalizeText, setIdFromCardId, similarity } from '../lib/utils'

/** Ce que le scanner (IA ou OCR) a pu lire sur la carte. */
export interface ScanGuess {
  name?: string
  number?: string
  total?: string
  setCode?: string
  lang?: Lang
  variantHint?: Variant | 'unknown'
  /** Autres lectures possibles du numéro (OCR) */
  altNumbers?: { number: string; total: string }[]
}

export interface Candidate {
  card: CardBrief
  setId: string
  setName: string
  lang: Lang
  score: number
  reasons: string[]
}

/** Score au-delà duquel on considère la correspondance comme sûre. */
export const CONFIDENT_SCORE = 10

function simplifyName(name?: string): string {
  return (name ?? '')
    .replace(/[’']/g, '’')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Rapproche une lecture de carte du catalogue TCGdex :
 *  A) recherche par nom, filtrée par numéro ;
 *  B) extensions dont le nombre de cartes officiel = total imprimé (« /165 »), puis numéro.
 */
export async function findCandidates(qc: QueryClient, guess: ScanGuess, catalog: Catalog, fallbackLang: Lang): Promise<Candidate[]> {
  const lang = guess.lang ?? fallbackLang
  const num = normNum(guess.number)
  const total = guess.total ? Number(guess.total.replace(/\D/g, '')) : NaN
  const name = simplifyName(guess.name)
  const maxOrder = Math.max(1, catalog.sets.length)
  const found = new Map<string, Candidate>()

  const consider = (card: CardBrief, setId: string, extra: number, reasons: string[]) => {
    const set = catalog.byId.get(setId)
    if (!set) return
    let score = extra
    const why = [...reasons]
    if (name) {
      const sim = Math.max(similarity(name, card.name), similarity(name.split(' ')[0] ?? '', card.name.split(/[\s-]/)[0] ?? ''))
      score += sim * 4
      if (sim > 0.85) why.push('nom')
    }
    if (num && normNum(card.localId) === num) {
      score += 5
      if (!why.includes('numéro')) why.push('numéro')
    }
    if (Number.isFinite(total) && total > 0 && set.cardCount.official === total) {
      score += 3
      if (!why.includes('total')) why.push('total')
    }
    score += (1 - set.order / maxOrder) * 0.5
    const prev = found.get(card.id)
    if (!prev || prev.score < score) found.set(card.id, { card, setId, setName: set.name, lang, score, reasons: why })
  }

  const tasks: Promise<void>[] = []

  // A) par nom
  if (name.length >= 3) {
    tasks.push(
      (async () => {
        // Nom complet d'abord, puis les mots les plus longs (l'OCR ajoute parfois des fragments parasites)
        const words = name
          .split(/[\s-]+/)
          .filter((w) => w.length >= 4)
          .sort((a, b) => b.length - a.length)
        // … et en dernier recours le début du mot le plus long (tolère une lettre mal lue à la fin)
        const prefix = words[0] && words[0].length >= 7 ? words[0].slice(0, 6) : null
        const queries = [...new Set([name, ...words.slice(0, 2), ...(prefix ? [prefix] : [])])]
        let results: CardBrief[] = []
        for (const q of queries) {
          results = await tcgdex.searchCards(lang, { name: q }).catch(() => [] as CardBrief[])
          if (results.length) break
        }
        // Cartes des extensions maison (ex. énergies de base 2019)
        const extras = searchExtraCards(name)
        if (extras.length) results = [...extras, ...results]
        // Énergies de base : certaines éditions n'existent que dans la base anglaise (ex. Soleil et Lune)
        const enEnergy = lang !== 'en' ? englishEnergyName(name) : null
        if (enEnergy) {
          const known = new Set(results.map((c) => c.id))
          const en = await tcgdex.searchCards('en', { name: `eq:${enEnergy}` }).catch(() => [] as CardBrief[])
          results = [...results, ...en.filter((c) => !known.has(c.id)).map((c) => ({ ...c, name: localizeCardName(c.name, lang), image: undefined }))]
        }
        const filtered = num ? results.filter((c) => normNum(c.localId) === num) : results
        for (const c of (filtered.length ? filtered : results).slice(0, 200)) consider(c, setIdFromCardId(c.id), 0, [])
      })(),
    )
  }

  // B) par total imprimé + numéro (lecture principale puis lectures alternatives de l'OCR)
  const pairs = [
    ...(num && Number.isFinite(total) && total > 0 ? [{ num, total, alt: false }] : []),
    ...(guess.altNumbers ?? []).map((p) => ({ num: normNum(p.number), total: Number(p.total.replace(/\D/g, '')), alt: true })),
  ].filter((p, i, all) => p.num && p.total > 0 && all.findIndex((q) => q.num === p.num && q.total === p.total) === i)
  for (const pair of pairs.slice(0, 4)) {
    const sets = catalog.sets.filter((s) => s.cardCount.official === pair.total).slice(0, 12)
    for (const s of sets) {
      tasks.push(
        (async () => {
          const detail = await qc.fetchQuery(setQuery(lang, s.id)).catch(() => null)
          if (!detail) return
          const card = detail.cards.find((c) => normNum(c.localId) === pair.num)
          if (!card) return
          const codeMatch =
            !!guess.setCode &&
            !!detail.abbreviation?.official &&
            normalizeText(detail.abbreviation.official) === normalizeText(guess.setCode)
          // Une lecture alternative compte comme le numéro / total principal
          const bonus = (codeMatch ? 4 : 0) + (pair.alt ? 8 : 0)
          consider(card, s.id, bonus, [...(codeMatch ? ['code extension'] : []), ...(pair.alt ? ['numéro', 'total'] : [])])
        })(),
      )
    }
  }

  await Promise.all(tasks)
  return [...found.values()].sort((a, b) => b.score - a.score).slice(0, 8)
}
