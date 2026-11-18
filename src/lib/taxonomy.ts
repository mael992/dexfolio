import { normalizeText } from './utils'

/* ------------------------------ Raretés ------------------------------ */

export type RarityTier = 'common' | 'uncommon' | 'rare' | 'ultra' | 'secret' | 'promo' | 'other'

export const RARITY_TIERS: { key: RarityTier; label: string }[] = [
  { key: 'common', label: 'Communes' },
  { key: 'uncommon', label: 'Peu communes' },
  { key: 'rare', label: 'Rares' },
  { key: 'ultra', label: 'Ultra rares' },
  { key: 'secret', label: 'Secrètes & illus.' },
  { key: 'promo', label: 'Promos' },
]

/** Classe une rareté (anglaise ou française) dans une grande famille. */
export function rarityTier(rarity?: string | null): RarityTier {
  if (!rarity) return 'other'
  const s = normalizeText(rarity)
  if (/promo/.test(s)) return 'promo'
  if (/illustration|secret|hyper|rainbow|arc en ciel|shiny|chromatique|crown|couronne|gold|black white|noir blanc/.test(s)) return 'secret'
  if (/double|ultra|ace spec|radiant|radieu|amazing|magnifique|full art|prime|legend|break|lv x|prism|vmax|vstar|\bv\b|\bgx\b|\bex\b/.test(s)) return 'ultra'
  if (/peu commune|uncommon/.test(s)) return 'uncommon'
  if (/commune|common/.test(s)) return 'common'
  if (/rare|holo/.test(s)) return 'rare'
  return 'other'
}

const RARITY_FR: Record<string, string> = {
  common: 'Commune',
  uncommon: 'Peu commune',
  rare: 'Rare',
  'rare holo': 'Rare holo',
  'holo rare': 'Rare holo',
  'double rare': 'Double rare',
  'ultra rare': 'Ultra rare',
  'illustration rare': 'Illustration rare',
  'special illustration rare': 'Illustration spéciale rare',
  'hyper rare': 'Hyper rare',
  'secret rare': 'Rare secrète',
  'ace spec rare': 'ACE SPEC',
  'shiny rare': 'Chromatique rare',
  'shiny ultra rare': 'Chromatique ultra rare',
  'radiant rare': 'Radieuse',
  'amazing rare': 'Magnifique',
  'rare holo v': 'Rare holo V',
  'rare holo vmax': 'Rare holo VMAX',
  'rare holo vstar': 'Rare holo VSTAR',
  'crown rare': 'Couronne',
  'classic collection': 'Collection classique',
  'mega hyper rare': 'Méga hyper rare',
  'black white rare': 'Rare noir & blanc',
  promo: 'Promo',
  none: 'Sans rareté',
}

export function rarityLabel(rarity?: string | null): string {
  if (!rarity) return ''
  return RARITY_FR[rarity.toLowerCase()] ?? rarity
}

/** Intensité de l'effet holo selon la rareté. */
export function foilLevel(rarity?: string | null): 'none' | 'soft' | 'strong' {
  const t = rarityTier(rarity)
  if (t === 'secret' || t === 'ultra') return 'strong'
  if (t === 'rare' || t === 'promo') return 'soft'
  return 'none'
}

/* ------------------------------ Types d'énergie ------------------------------ */

export type EnergyKey =
  | 'grass'
  | 'fire'
  | 'water'
  | 'lightning'
  | 'psychic'
  | 'fighting'
  | 'darkness'
  | 'metal'
  | 'fairy'
  | 'dragon'
  | 'colorless'

export const ENERGY: Record<EnergyKey, { label: string; color: string }> = {
  grass: { label: 'Plante', color: 'var(--color-t-grass)' },
  fire: { label: 'Feu', color: 'var(--color-t-fire)' },
  water: { label: 'Eau', color: 'var(--color-t-water)' },
  lightning: { label: 'Électrique', color: 'var(--color-t-lightning)' },
  psychic: { label: 'Psy', color: 'var(--color-t-psychic)' },
  fighting: { label: 'Combat', color: 'var(--color-t-fighting)' },
  darkness: { label: 'Obscurité', color: 'var(--color-t-darkness)' },
  metal: { label: 'Métal', color: 'var(--color-t-metal)' },
  fairy: { label: 'Fée', color: 'var(--color-t-fairy)' },
  dragon: { label: 'Dragon', color: 'var(--color-t-dragon)' },
  colorless: { label: 'Incolore', color: 'var(--color-t-colorless)' },
}

const ALIASES: Record<string, EnergyKey> = {}
const add = (key: EnergyKey, ...names: string[]) => names.forEach((n) => (ALIASES[normalizeText(n)] = key))
add('grass', 'grass', 'plante', 'pflanze', 'planta', 'erba', 'grama')
add('fire', 'fire', 'feu', 'feuer', 'fuego', 'fuoco', 'fogo')
add('water', 'water', 'eau', 'wasser', 'agua', 'acqua', 'água')
add('lightning', 'lightning', 'électrique', 'elektro', 'rayo', 'lampo', 'elétrico')
add('psychic', 'psychic', 'psy', 'psycho', 'psíquico', 'psico')
add('fighting', 'fighting', 'combat', 'kampf', 'lucha', 'lotta', 'luta')
add('darkness', 'darkness', 'obscurité', 'finsternis', 'oscuridad', 'oscurità', 'escuridão')
add('metal', 'metal', 'métal', 'metall', 'metálica', 'metallo')
add('fairy', 'fairy', 'fée', 'fee', 'hada', 'folletto', 'fada')
add('dragon', 'dragon', 'drache', 'dragón', 'drago', 'dragão')
add('colorless', 'colorless', 'incolore', 'farblos', 'incolora', 'incolor')

export function energyKey(type?: string | null): EnergyKey | null {
  if (!type) return null
  return ALIASES[normalizeText(type)] ?? null
}

/* ------------------------------ Pokédex national ------------------------------ */

export const DEX_TOTAL = 1025

export const GENERATIONS: { gen: number; label: string; from: number; to: number; region: string }[] = [
  { gen: 1, label: 'Gén. 1', from: 1, to: 151, region: 'Kanto' },
  { gen: 2, label: 'Gén. 2', from: 152, to: 251, region: 'Johto' },
  { gen: 3, label: 'Gén. 3', from: 252, to: 386, region: 'Hoenn' },
  { gen: 4, label: 'Gén. 4', from: 387, to: 493, region: 'Sinnoh' },
  { gen: 5, label: 'Gén. 5', from: 494, to: 649, region: 'Unys' },
  { gen: 6, label: 'Gén. 6', from: 650, to: 721, region: 'Kalos' },
  { gen: 7, label: 'Gén. 7', from: 722, to: 809, region: 'Alola' },
  { gen: 8, label: 'Gén. 8', from: 810, to: 905, region: 'Galar · Hisui' },
  { gen: 9, label: 'Gén. 9', from: 906, to: 1025, region: 'Paldea' },
]

const PREFIXES = /^(m[ée]ga[\s-]|m\s|dark\s|obscur\s|light\s|lumineux\s|radieu[xse]*\s|radiant\s|shining\s|brillant\s|alolan\s|galarian\s|hisuian\s|paldean\s)/i
const SUFFIXES =
  /([\s-]+(ex|EX|GX|V|VMAX|VSTAR|V-UNION|LV\.?\s?X|BREAK|Prime|LÉGENDE|LEGEND|δ|☆|◇|TAG\s?TEAM)|\s*&.*|\s+(d[e'’]|of)\s.*)$/u

/** « Dracaufeu-ex » → « Dracaufeu », « M Lucario-EX » → « Lucario ». */
export function speciesName(cardName: string): string {
  let n = cardName.trim()
  for (let i = 0; i < 3; i++) {
    const next = n.replace(PREFIXES, '').replace(SUFFIXES, '').trim()
    if (next === n) break
    n = next
  }
  return n || cardName
}

export function dexLabel(n: number): string {
  return `#${String(n).padStart(4, '0')}`
}
