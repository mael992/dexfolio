import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { isLang, isVariant } from '../lib/tcgdex'
import type { ScanGuess } from './match'

/** Réponse structurée renvoyée par l'Edge Function `scan-card` (voir supabase/functions). */
export interface AiCardReading {
  is_pokemon_card: boolean
  name: string
  collector_number: string
  set_total: string
  set_code: string
  regulation_mark: string
  language: string
  hp: string
  variant_hint: 'normal' | 'reverse' | 'holo' | 'unknown'
  confidence: number
  notes: string
}

export class AiScanError extends Error {
  readonly code: string
  readonly status: number
  constructor(code: string, status = 0, detail?: string) {
    super(detail ?? code)
    this.code = code
    this.status = status
  }
}

export function aiErrorMessage(e: AiScanError): string {
  switch (e.code) {
    case 'not_configured':
      return 'Le scanner IA n’est pas encore configuré (clé API Anthropic côté serveur). Utilise la lecture locale ou la saisie rapide.'
    case 'not_deployed':
      return 'La fonction « scan-card » n’est pas déployée sur ton projet Supabase.'
    case 'rate_limited':
      return 'Limite quotidienne de scans IA atteinte. Réessaie demain ou utilise la lecture locale.'
    case 'unauthorized':
      return 'Session expirée : reconnecte-toi.'
    case 'refused':
      return 'L’IA n’a pas pu analyser cette image.'
    case 'bad_image':
      return 'Image invalide ou trop lourde.'
    case 'network':
      return 'Impossible de joindre le serveur. Vérifie ta connexion.'
    default:
      return 'Le scanner IA a rencontré une erreur. Réessaie.'
  }
}

export async function scanWithAi(imageBase64: string, mediaType = 'image/jpeg'): Promise<{ reading: AiCardReading; model?: string }> {
  if (!supabase) throw new AiScanError('not_configured')
  const { data, error } = await supabase.functions.invoke('scan-card', { body: { image: imageBase64, mediaType } })
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const res = error.context as Response
      let code = 'unknown'
      try {
        code = ((await res.json()) as { error?: string }).error ?? code
      } catch {
        /* corps non JSON */
      }
      if (res.status === 404 && code === 'unknown') code = 'not_deployed'
      throw new AiScanError(code, res.status)
    }
    if (error instanceof FunctionsFetchError || error instanceof FunctionsRelayError) throw new AiScanError('network')
    throw new AiScanError('unknown', 0, (error as Error).message)
  }
  return data as { reading: AiCardReading; model?: string }
}

export function guessFromAi(r: AiCardReading): ScanGuess {
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
