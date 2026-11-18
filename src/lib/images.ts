import type { Catalog } from './queries'
import type { ImageQuality } from './tcgdex'
import { setIdFromCardId } from './utils'

/**
 * Sources d'images d'une carte, dans l'ordre :
 *  1. image TCGdex dans la langue choisie ;
 *  2. image TCGdex anglaise (même chemin, langue « en ») ;
 *  3. scan anglais pokemontcg.io pour les extensions que TCGdex n'illustre pas.
 * Les sources 2 et 3 sont signalées « EN » dans l'interface.
 */

/** Extensions TCGdex -> pokemontcg.io (vérifié le 18/11/2026). « strip » = numéro sans zéros initiaux. */
const PTCG: Record<string, [string, 'asis' | 'strip']> = {
  basep: ['basep', 'asis'],
  col1: ['col1', 'asis'],
  dpp: ['dpp', 'asis'],
  dp1: ['dp1', 'asis'],
  dp2: ['dp2', 'asis'],
  dp4: ['dp4', 'asis'],
  dp5: ['dp5', 'asis'],
  dp6: ['dp6', 'asis'],
  dp7: ['dp7', 'asis'],
  ecard2: ['ecard2', 'asis'],
  exu: ['ex10', 'asis'],
  hgss1: ['hgss1', 'asis'],
  hgss2: ['hgss2', 'asis'],
  hgss3: ['hgss3', 'asis'],
  hgss4: ['hgss4', 'asis'],
  '2011bw': ['mcd11', 'asis'],
  '2012bw': ['mcd12', 'asis'],
  '2016xy': ['mcd16', 'asis'],
  '2019sm-fr': ['mcd19', 'asis'],
  '2021swsh': ['mcd21', 'asis'],
  '2022swsh': ['mcd22', 'asis'],
  np: ['np', 'asis'],
  smp: ['smp', 'asis'],
  'sm3.5': ['sm35', 'asis'],
  'sm7.5': ['sm75', 'asis'],
  det1: ['det1', 'asis'],
  sm10: ['sm10', 'asis'],
  sm11: ['sm11', 'asis'],
  sma: ['sma', 'asis'],
  sm115: ['sm115', 'asis'],
  svp: ['svp', 'strip'],
  sve: ['sve', 'strip'],
  swshp: ['swshp', 'asis'],
  'swsh4.5sv': ['swsh45sv', 'asis'],
  cel25: ['cel25', 'asis'],
  swsh9tg: ['swsh9tg', 'asis'],
  swsh10tg: ['swsh10tg', 'asis'],
  swsh11tg: ['swsh11tg', 'asis'],
  swsh12tg: ['swsh12tg', 'asis'],
  'swsh12.5gg': ['swsh12pt5gg', 'asis'],
  xyp: ['xyp', 'asis'],
}

export interface ImageSource {
  url: string
  /** Image anglaise de secours */
  fallback: boolean
  /** Photo personnelle de l'utilisateur */
  personal?: boolean
}

export function cardImageSources(
  card: { image?: string | null; id?: string | null; localId?: string | null },
  catalog: Catalog | undefined,
  quality: ImageQuality,
  personalPhoto?: string | null,
): ImageSource[] {
  const out: ImageSource[] = []
  if (card.image) out.push({ url: `${card.image}/${quality}.webp`, fallback: false })
  // Ta photo passe avant les images anglaises de secours
  if (personalPhoto) out.push({ url: personalPhoto, fallback: false, personal: true })
  if (card.id && card.localId) {
    const setId = setIdFromCardId(card.id)
    const set = catalog?.byId.get(setId)
    if (set) out.push({ url: `https://assets.tcgdex.net/en/${set.serieId}/${setId}/${card.localId}/${quality}.webp`, fallback: true })
    const p = PTCG[setId]
    if (p) {
      const num = p[1] === 'strip' ? card.localId.replace(/^([A-Za-z-]*?)0+(\d)/, '$1$2') : card.localId
      out.push({ url: `https://images.pokemontcg.io/${p[0]}/${encodeURIComponent(num)}${quality === 'high' ? '_hires' : ''}.png`, fallback: true })
    }
  }
  // Pas de doublon (ex. langue anglaise choisie : la source 2 = la source 1)
  return out.filter((s, i) => out.findIndex((o) => o.url === s.url) === i)
}
