export { clsx as cn } from 'clsx'

const intFmt = new Intl.NumberFormat('fr-FR')
export const fmtInt = (n: number) => intFmt.format(n)

export function fmtEur(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: n >= 1000 ? 0 : 2,
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  }).format(n)
}

export function fmtUsd(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'USD' }).format(n)
}

export function fmtPct(ratio: number): string {
  const pct = ratio >= 1 ? 100 : Math.floor(ratio * 1000) / 10
  return `${pct.toLocaleString('fr-FR', { maximumFractionDigits: 1 })} %`
}

export function fmtDate(iso?: string | null, style: 'long' | 'short' = 'long'): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('fr-FR', style === 'long' ? { day: 'numeric', month: 'long', year: 'numeric' } : { month: 'short', year: 'numeric' }).format(d)
}

export function fmtRelative(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000
  const rtf = new Intl.RelativeTimeFormat('fr-FR', { numeric: 'auto' })
  if (diff < 60) return 'à l’instant'
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), 'minute')
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), 'hour')
  if (diff < 86400 * 30) return rtf.format(-Math.round(diff / 86400), 'day')
  return fmtDate(iso, 'short')
}

/** Minuscules, sans accents ni ponctuation : pour comparer des noms. */
export function normalizeText(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Numéro de carte normalisé : « 025 » → « 25 », « TG05 » → « TG5 », « SWSH050 » → « SWSH50 ». */
export function normNum(s?: string | null): string {
  if (!s) return ''
  const t = s.toUpperCase().replace(/\s+/g, '')
  const m = t.match(/^([A-Z-]*?)0*(\d+)([A-Z]*)$/)
  return m ? `${m[1]}${m[2]}${m[3]}` : t
}

/** Similarité de Dice sur les bigrammes (0..1). */
export function similarity(a: string, b: string): number {
  const x = normalizeText(a).replace(/\s/g, '')
  const y = normalizeText(b).replace(/\s/g, '')
  if (!x || !y) return 0
  if (x === y) return 1
  if (x.length < 2 || y.length < 2) return 0
  const grams = new Map<string, number>()
  for (let i = 0; i < x.length - 1; i++) {
    const g = x.slice(i, i + 2)
    grams.set(g, (grams.get(g) ?? 0) + 1)
  }
  let hits = 0
  for (let i = 0; i < y.length - 1; i++) {
    const g = y.slice(i, i + 2)
    const n = grams.get(g) ?? 0
    if (n > 0) {
      grams.set(g, n - 1)
      hits++
    }
  }
  return (2 * hits) / (x.length + y.length - 2)
}

export function setIdFromCardId(cardId: string): string {
  const i = cardId.lastIndexOf('-')
  return i > 0 ? cardId.slice(0, i) : cardId
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** Exécute `fn` sur chaque élément avec une concurrence limitée. */
export async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
  onProgress?: (done: number, total: number) => void,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  let done = 0
  async function worker() {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i], i)
      done++
      onProgress?.(done, items.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

export function initials(text: string): string {
  const base = text.includes('@') ? text.split('@')[0] : text
  const parts = base.split(/[\s._-]+/).filter(Boolean)
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase()
}

export function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function readLocal<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

export function writeLocal(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota ou stockage bloqué : on ignore */
  }
}
