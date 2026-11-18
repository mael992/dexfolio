import type { Worker } from 'tesseract.js'
import type { Lang } from '../lib/tcgdex'
import { cropForOcr } from './image'
import type { ScanGuess } from './match'

/**
 * Lecture locale (gratuite) avec Tesseract.js, chargé à la demande.
 * - Nom : la ligne de texte la plus haute (la plus grosse police) en haut de la carte.
 * - Numéro : « 025/165 » lu en bas de la carte (à gauche sur les cartes récentes, à droite sur les anciennes).
 */

const TESS_LANG: Record<Lang, string> = { fr: 'fra', en: 'eng', de: 'deu', es: 'spa', it: 'ita', pt: 'por' }

let workerPromise: Promise<Worker> | null = null
let workerLangs = ''

async function getWorker(lang: Lang, onProgress?: (p: number, status: string) => void): Promise<Worker> {
  const langs = [...new Set(['eng', TESS_LANG[lang]])]
  const key = langs.join('+')
  if (workerPromise && workerLangs === key) return workerPromise
  if (workerPromise) {
    const old = await workerPromise
    void old.terminate()
  }
  workerLangs = key
  workerPromise = import('tesseract.js').then(({ createWorker }) =>
    createWorker(langs, 1, {
      logger: (m) => {
        if (m.status && typeof m.progress === 'number') onProgress?.(m.progress, m.status)
      },
    }),
  )
  return workerPromise
}

// Seuls quelques préfixes existent réellement (Galerie de dresseurs, Galerie Galarienne, Coffre chromatique…)
const NUMBER_RE = /(?:^|[^A-Z0-9])((?:TG|GG|SV|RC|SH)?\d{1,3})\s*\/\s*((?:TG|GG|SV|RC)?\d{1,3})(?![0-9])/i
const PROMO_RE = /\b(SWSH|SM|XY|BW|SVP?|HGSS|DP|MEP)\s?-?\s?(\d{2,3})\b/i
// Lignes à ignorer : « Évolution de : … », « Evolves from … », etc.
const EVOLVES_RE = /(volution|evolves|entwickelt|evoluciona|evolve da|evolui)/i

/** Ne garde que les mots plausibles d'un nom de carte. */
function cleanName(line: string): string {
  return line
    .replace(/\b(PV|HP|KP|PS|PC)\s*\d+.*$/i, '')
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}'’.-]/gu, ''))
    .filter((w) => w.length >= 3 || /^(ex|V|GX|EX)$/i.test(w))
    .join(' ')
    .replace(/[-.]+$/, '')
    .trim()
}

interface OcrLine {
  text: string
  height: number
}

export async function readCardWithOcr(canvas: HTMLCanvasElement, lang: Lang, onProgress?: (p: number, status: string) => void): Promise<ScanGuess & { raw: string }> {
  const { PSM } = await import('tesseract.js')
  const worker = await getWorker(lang, onProgress)

  // 1) Bas de carte : numéro de collection
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    tessedit_char_whitelist: '0123456789/ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  })
  const bottomTexts: string[] = []
  for (const [x, w, scale] of [
    [0, 1, 2],
    [0, 0.5, 3],
    [0.5, 0.5, 3],
  ] as const) {
    const r = await worker.recognize(cropForOcr(canvas, x, 0.86, w, 0.13, scale))
    bottomTexts.push(r.data.text)
  }
  const bottomText = bottomTexts.join('\n')
  // Tous les « nnn/ttt » lus ; les plus plausibles (total à 2 chiffres ou plus) en premier
  const numberPairs = [...new Map(
    [...bottomText.replace(/O/g, '0').matchAll(new RegExp(NUMBER_RE.source, 'gi'))]
      .map((m) => ({ number: m[1], total: m[2] }))
      .sort((a, b) => Number(b.total.replace(/\D/g, '').length >= 2) - Number(a.total.replace(/\D/g, '').length >= 2))
      .map((p) => [`${p.number}/${p.total}`, p]),
  ).values()]

  // 2) Haut de carte : nom = ligne la plus haute
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK, tessedit_char_whitelist: '' })
  const top = await worker.recognize(cropForOcr(canvas, 0.04, 0.02, 0.74, 0.1, 2), {}, { blocks: true, text: true })
  const lines: OcrLine[] = (top.data.blocks ?? []).flatMap((b) =>
    b.paragraphs.flatMap((p) => p.lines.map((l) => ({ text: l.text.trim(), height: l.bbox.y1 - l.bbox.y0 }))),
  )
  const candidates = lines
    .filter((l) => !EVOLVES_RE.test(l.text))
    .map((l) => ({ ...l, name: cleanName(l.text) }))
    .filter((l) => l.name.replace(/[^\p{L}]/gu, '').length >= 3)
    .sort((a, b) => b.height - a.height)
  const name = candidates[0]?.name ?? ''

  const best = numberPairs[0]
  const promo = bottomText.match(PROMO_RE)
  return {
    name: name || undefined,
    number: best ? best.number : promo ? `${promo[1]}${promo[2]}` : undefined,
    total: best?.total,
    altNumbers: numberPairs.slice(1, 4),
    lang,
    raw: `${top.data.text}\n---\n${bottomText}`.trim(),
  }
}
