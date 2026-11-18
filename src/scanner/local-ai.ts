import { supabase } from '../lib/supabase'
import { isLang, isVariant, type Lang } from '../lib/tcgdex'
import type { ScanGuess } from './match'

/**
 * Scanner IA LOCAL : la photo est déposée dans ta base Supabase (table scan_jobs),
 * le scanner qui tourne sur ton PC la fait lire par Qwen (Ollama, carte graphique),
 * écrit le résultat et efface la photo. Aucun modèle distant.
 */

export interface CardReading {
  is_pokemon_card: boolean
  name: string
  collector_number: string
  set_total: string
  set_code: string
  regulation_mark: string
  language: string
  hp: string
  variant_hint: string
  confidence: number
  notes: string
}

export type LocalScanErrorCode = 'no_backend' | 'timeout' | 'failed' | 'rate_limited' | 'network'

export class LocalScanError extends Error {
  readonly code: LocalScanErrorCode
  constructor(code: LocalScanErrorCode, detail?: string) {
    super(detail ?? code)
    this.code = code
  }
}

export function localScanErrorMessage(e: LocalScanError): string {
  switch (e.code) {
    case 'no_backend':
      return 'Le scanner IA local passe par ta base Supabase : connecte l’app à Supabase pour l’utiliser.'
    case 'timeout':
      return 'Ton PC ne répond pas. Vérifie qu’il est allumé et que le scanner Dexfolio tourne (dossier scanner, « docker compose up -d »).'
    case 'rate_limited':
      return 'Trop de scans en une minute : patiente quelques secondes.'
    case 'failed':
      return `Qwen n’a pas pu lire la carte${e.message && e.message !== 'failed' ? ` (${e.message})` : ''}.`
    default:
      return 'Envoi impossible : vérifie ta connexion internet.'
  }
}

export interface ScannerStatus {
  online: boolean
  model: string | null
  lastSeen: string | null
  detail: string
}

/** Le scanner du PC envoie un signe de vie toutes les 20 s. */
export async function fetchScannerStatus(): Promise<ScannerStatus> {
  if (!supabase) return { online: false, model: null, lastSeen: null, detail: 'Base de données non configurée' }
  const { data, error } = await supabase
    .from('scanner_status')
    .select('last_seen, model, info')
    .order('last_seen', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return { online: false, model: null, lastSeen: null, detail: error.message }
  if (!data) return { online: false, model: null, lastSeen: null, detail: 'Le scanner du PC ne s’est encore jamais connecté' }
  const fresh = Date.now() - new Date(data.last_seen as string).getTime() < 75_000
  const info = (data.info ?? {}) as { ollama?: boolean; lastError?: string }
  return {
    online: fresh && info.ollama !== false,
    model: (data.model as string | null) ?? null,
    lastSeen: data.last_seen as string,
    detail: !fresh ? 'PC éteint ou scanner arrêté' : info.ollama === false ? info.lastError || 'Ollama indisponible' : '',
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function scanWithLocalAi(imageB64: string, lang: Lang, onStatus?: (s: string) => void): Promise<CardReading> {
  if (!supabase) throw new LocalScanError('no_backend')
  onStatus?.('Envoi de la photo à ton PC…')
  const { data: job, error } = await supabase.from('scan_jobs').insert({ image: imageB64, lang }).select('id').single()
  if (error) throw new LocalScanError(/Trop de scans/.test(error.message) ? 'rate_limited' : 'network', error.message)

  const started = Date.now()
  try {
    while (Date.now() - started < 90_000) {
      await sleep(900)
      const { data, error: readError } = await supabase.from('scan_jobs').select('status, result, error').eq('id', job.id).single()
      if (readError || !data) continue
      if (data.status === 'done') return data.result as CardReading
      if (data.status === 'error') throw new LocalScanError('failed', (data.error as string | null) ?? undefined)
      if (data.status === 'processing') onStatus?.('Qwen lit ta carte sur ton PC…')
      else if (Date.now() - started > 15_000) onStatus?.('En attente de ton PC…')
    }
    throw new LocalScanError('timeout')
  } finally {
    // La demande (et la photo, si elle n'a pas encore été effacée) est supprimée dans tous les cas.
    void supabase.from('scan_jobs').delete().eq('id', job.id).then(
      () => undefined,
      () => undefined,
    )
  }
}

export function guessFromReading(r: CardReading): ScanGuess {
  const lang = r.language?.toLowerCase()
  return {
    name: r.name || undefined,
    number: r.collector_number || undefined,
    total: r.set_total || undefined,
    setCode: r.set_code || undefined,
    lang: isLang(lang) ? lang : undefined,
    variantHint: isVariant(r.variant_hint) ? r.variant_hint : 'unknown',
  }
}
