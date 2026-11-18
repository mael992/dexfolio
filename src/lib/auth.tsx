import type { Session, User } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { localRepo, SupabaseRepo, type Repo } from './collection'
import { isSupabaseConfigured } from './env'
import { supabase } from './supabase'

type Status = 'loading' | 'signedIn' | 'signedOut'

interface AuthContextValue {
  status: Status
  mode: 'supabase' | 'local'
  user: User | null
  session: Session | null
  /** Vrai quand l'utilisateur arrive via un lien « mot de passe oublié ». */
  recovery: boolean
  clearRecovery(): void
  signOut(): Promise<void>
  repo: Repo
  /** Identifiant stable pour les clés de cache (utilisateur ou « local »). */
  userKey: string
  displayName: string
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(isSupabaseConfigured ? 'loading' : 'signedIn')
  const [session, setSession] = useState<Session | null>(null)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    if (!supabase) return
    let cancelled = false
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      setSession(data.session)
      setStatus(data.session ? 'signedIn' : 'signedOut')
    })
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      // Ne jamais appeler l'API Supabase ici (risque d'interblocage) : on met juste l'état à jour.
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
      setSession(next)
      setStatus(next ? 'signedIn' : 'signedOut')
    })
    return () => {
      cancelled = true
      data.subscription.unsubscribe()
    }
  }, [])

  const value = useMemo<AuthContextValue>(() => {
    const user = session?.user ?? null
    const meta = (user?.user_metadata ?? {}) as Record<string, unknown>
    const displayName =
      (typeof meta.display_name === 'string' && meta.display_name) ||
      (user?.email ? user.email.split('@')[0] : 'Dresseur')
    return {
      status,
      mode: isSupabaseConfigured ? 'supabase' : 'local',
      user,
      session,
      recovery,
      clearRecovery: () => setRecovery(false),
      signOut: async () => {
        if (supabase) await supabase.auth.signOut()
      },
      repo: supabase && user ? new SupabaseRepo(supabase, user.id) : localRepo,
      userKey: user?.id ?? 'local',
      displayName,
    }
  }, [status, session, recovery])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans <AuthProvider>')
  return ctx
}

/** Traduit les erreurs d'authentification Supabase en messages clairs. */
// eslint-disable-next-line react-refresh/only-export-components
export function authErrorMessage(err: unknown): string {
  const e = err as { code?: string; message?: string; status?: number }
  const code = e?.code ?? ''
  const msg = (e?.message ?? '').toLowerCase()
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) return 'E-mail ou mot de passe incorrect.'
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed'))
    return 'Confirme d’abord ton adresse e-mail (vérifie ta boîte de réception).'
  if (code === 'user_already_exists' || msg.includes('already registered')) return 'Un compte existe déjà avec cet e-mail.'
  if (code === 'weak_password' || msg.includes('password should')) return 'Mot de passe trop faible : au moins 8 caractères, avec lettres et chiffres.'
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || e?.status === 429)
    return 'Trop de tentatives. Patiente quelques minutes avant de réessayer.'
  if (code === 'signup_disabled' || msg.includes('signups not allowed')) return 'Les inscriptions sont fermées sur cette instance.'
  if (code === 'same_password') return 'Le nouveau mot de passe doit être différent de l’ancien.'
  if (msg.includes('failed to fetch') || msg.includes('network')) return 'Connexion impossible. Vérifie ta connexion internet.'
  return e?.message || 'Une erreur est survenue.'
}
