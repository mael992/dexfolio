import type { CardBrief, CardDetail, CardMeta, SetDetail } from './tcgdex'
import { normalizeText } from './utils'

/**
 * Extensions « maison » : cartes réelles absentes des bases TCGdex (FR et EN).
 * Identifiants préfixés « dexfolio- » pour ne jamais entrer en collision avec TCGdex.
 */

interface ExtraSet {
  id: string
  name: string
  serieId: string
  serieName: string
  releaseDate: string
  note: string
  cards: { localId: string; name: string; type: string }[]
}

const ENERGY_TYPES = ['Plante', 'Feu', 'Eau', 'Électrique', 'Psy', 'Combat', 'Obscurité', 'Métal', 'Fée']

export const EXTRA_SETS: ExtraSet[] = [
  {
    id: 'dexfolio-sme19',
    name: 'Énergies de base 2019',
    serieId: 'sm',
    serieName: 'Soleil et Lune',
    releaseDate: '2019-02-01',
    note: 'Énergies de base non numérotées « ©2019 Pokémon » (fond à circuits), absentes des bases de cartes.',
    cards: ENERGY_TYPES.map((t, i) => ({ localId: String(i + 1), name: `Énergie ${t}`, type: t })),
  },
]

export const isExtraSetId = (setId: string) => setId.startsWith('dexfolio-')
export const isExtraCardId = (cardId: string) => cardId.startsWith('dexfolio-')

const byId = new Map(EXTRA_SETS.map((s) => [s.id, s]))

function briefs(s: ExtraSet): CardBrief[] {
  return s.cards.map((c) => ({ id: `${s.id}-${c.localId}`, localId: c.localId, name: c.name }))
}

export function extraSetDetail(setId: string): (SetDetail & { _lang: 'fr'; note: string }) | null {
  const s = byId.get(setId)
  if (!s) return null
  return {
    id: s.id,
    name: s.name,
    cardCount: { total: s.cards.length, official: s.cards.length },
    releaseDate: s.releaseDate,
    serie: { id: s.serieId, name: s.serieName },
    cards: briefs(s),
    note: s.note,
    _lang: 'fr',
  }
}

export function extraSetMeta(setId: string): Record<string, CardMeta> | null {
  const s = byId.get(setId)
  if (!s) return null
  const out: Record<string, CardMeta> = {}
  for (const c of briefs(s)) out[c.id] = { id: c.id, localId: c.localId, rarity: 'Common', dexId: [], variants: { normal: true } }
  return out
}

export function extraCardDetail(cardId: string): (CardDetail & { _lang: 'fr' }) | null {
  const setId = cardId.slice(0, cardId.lastIndexOf('-'))
  const s = byId.get(setId)
  const c = s?.cards.find((x) => `${s.id}-${x.localId}` === cardId)
  if (!s || !c) return null
  return {
    id: cardId,
    localId: c.localId,
    name: c.name,
    category: 'Énergie',
    energyType: 'Base',
    types: [c.type],
    rarity: 'Commune',
    description: s.note,
    set: { id: s.id, name: s.name, cardCount: { total: s.cards.length, official: s.cards.length } },
    variants: { normal: true },
    _lang: 'fr',
  }
}

/** Cartes maison dont le nom correspond à une recherche. */
export function searchExtraCards(query: string): CardBrief[] {
  const q = normalizeText(query)
  if (q.length < 3) return []
  return EXTRA_SETS.flatMap(briefs).filter((c) => normalizeText(c.name).includes(q))
}
