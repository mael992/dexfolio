export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

/** Sans Supabase, l'app tourne en « mode local » (données dans le navigateur). */
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

export const APP_NAME = 'Dexfolio'

/** URL absolue de l'app (utile pour les redirections des e-mails d'authentification). */
export function appUrl(path = ''): string {
  const base = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`
  return `${window.location.origin}${base}${path.replace(/^\//, '')}`
}
