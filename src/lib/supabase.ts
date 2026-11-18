import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from './env'

/**
 * Client Supabase côté navigateur.
 * - flux PKCE : aucun jeton dans l'URL, protection contre l'interception des liens e-mail
 * - la clé utilisée est la clé publique (anon / publishable) : les données sont protégées par RLS
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'dexfolio-auth',
      },
    })
  : null
