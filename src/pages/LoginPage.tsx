import { ArrowRight, Eye, EyeOff, KeyRound, Lock, Mail, ScanLine, ShieldCheck, Sparkles, TrendingUp } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router'
import { toast } from 'sonner'
import { CardImage } from '../components/cards'
import { Logo } from '../components/Logo'
import { Button, Field, Input, Segmented } from '../components/ui'
import { authErrorMessage, useAuth } from '../lib/auth'
import { appUrl, isSupabaseConfigured } from '../lib/env'
import { supabase } from '../lib/supabase'
import { cn } from '../lib/utils'

type Mode = 'signin' | 'signup' | 'magic' | 'forgot'

const SHOWCASE = [
  { image: 'https://assets.tcgdex.net/fr/sv/sv03.5/199', name: 'Dracaufeu-ex', r: '-9deg', d: '0s' },
  { image: 'https://assets.tcgdex.net/fr/sv/sv03.5/173', name: 'Pikachu', r: '4deg', d: '-2.5s' },
  { image: 'https://assets.tcgdex.net/fr/sv/sv03.5/205', name: 'Mew-ex', r: '12deg', d: '-4.5s' },
]

export default function LoginPage() {
  const { status } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/'

  // Erreurs renvoyées dans l'URL par un lien e-mail expiré / invalide
  useEffect(() => {
    const params = new URLSearchParams(window.location.search + window.location.hash.replace(/^#/, '&'))
    const desc = params.get('error_description')
    if (desc) toast.error('Lien invalide ou expiré', { description: desc.replace(/\+/g, ' ') })
  }, [])

  if (status === 'signedIn') return <Navigate to={from} replace />

  return (
    <div className="relative grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Panneau vitrine */}
      <div className="relative hidden overflow-hidden bg-[#0a0f1e] lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(900px_600px_at_15%_10%,rgb(227_53_13/0.55),transparent_60%),radial-gradient(700px_500px_at_90%_90%,rgb(42_117_187/0.45),transparent_60%),radial-gradient(500px_400px_at_70%_20%,rgb(255_203_5/0.25),transparent_60%)]" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '22px 22px' }}
        />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <Logo className="[&_span]:text-white" />
          <div className="relative mx-auto my-8 flex h-[400px] w-full max-w-[520px] items-center justify-center">
            {SHOWCASE.map((c, i) => (
              <div
                key={c.name}
                className="absolute w-[190px] animate-float"
                style={{
                  ['--r' as string]: c.r,
                  animationDelay: c.d,
                  left: `${8 + i * 30}%`,
                  top: i === 1 ? '2%' : '14%',
                  zIndex: i === 1 ? 2 : 1,
                }}
              >
                <CardImage image={c.image} name={c.name} quality="high" priority className="shadow-[0_30px_60px_-20px_rgb(0_0_0/0.8)] ring-1 ring-white/10" />
              </div>
            ))}
          </div>
          <div>
            <h1 className="max-w-md text-5xl font-semibold leading-[1.05]">
              Ta collection, <span className="holo-text">carte par carte.</span>
            </h1>
            <ul className="mt-6 grid max-w-lg gap-3 text-[15px] text-white/80">
              <li className="flex items-center gap-3">
                <Sparkles className="size-5 text-accent" /> Toutes les extensions, en français, à compléter.
              </li>
              <li className="flex items-center gap-3">
                <ScanLine className="size-5 text-accent" /> Scanner de cartes avec l’appareil photo.
              </li>
              <li className="flex items-center gap-3">
                <TrendingUp className="size-5 text-accent" /> Cote Cardmarket et valeur de ta collection.
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Formulaire */}
      <div className="pt-safe flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {isSupabaseConfigured ? <AuthForm /> : <NotConfigured />}
          <p className="mt-10 text-center text-[11px] leading-relaxed text-subtle">
            Projet de fan non officiel, sans lien avec Nintendo, Creatures Inc., GAME FREAK ou The Pokémon Company.
            Données et images de cartes : TCGdex.
          </p>
        </div>
      </div>
    </div>
  )
}

function AuthForm() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    setLoading(true)
    try {
      const cleanEmail = email.trim().toLowerCase()
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })
        if (error) throw error
      } else if (mode === 'signup') {
        if (password.length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.')
        const { data, error } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: { emailRedirectTo: appUrl() },
        })
        if (error) throw error
        if (!data.session) setSent('Compte créé ! Clique sur le lien de confirmation reçu par e-mail pour l’activer.')
      } else if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({
          email: cleanEmail,
          options: { emailRedirectTo: appUrl(), shouldCreateUser: false },
        })
        if (error) throw error
        setSent('Lien envoyé ! Ouvre l’e-mail sur cet appareil pour te connecter.')
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, { redirectTo: appUrl('nouveau-mot-de-passe') })
        if (error) throw error
        setSent('Si un compte existe pour cette adresse, un e-mail de réinitialisation vient d’être envoyé.')
      }
    } catch (err) {
      toast.error(authErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const titles: Record<Mode, { title: string; sub: string; cta: string }> = {
    signin: { title: 'Bon retour, dresseur !', sub: 'Connecte-toi pour retrouver ta collection.', cta: 'Se connecter' },
    signup: { title: 'Crée ton classeur', sub: 'Un compte gratuit, tes données synchronisées partout.', cta: 'Créer mon compte' },
    magic: { title: 'Lien de connexion', sub: 'Reçois un lien sécurisé à usage unique par e-mail.', cta: 'Envoyer le lien' },
    forgot: { title: 'Mot de passe oublié', sub: 'On t’envoie un lien pour en choisir un nouveau.', cta: 'Envoyer le lien' },
  }
  const t = titles[mode]

  if (sent) {
    return (
      <div className="surface animate-fade-up rounded-3xl p-8 text-center">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-success-soft text-success">
          <Mail className="size-7" />
        </div>
        <h2 className="mt-4 text-2xl font-semibold">Vérifie tes e-mails</h2>
        <p className="mt-2 text-sm text-muted">{sent}</p>
        <Button variant="secondary" className="mt-6" onClick={() => { setSent(null); setMode('signin') }}>
          Retour à la connexion
        </Button>
      </div>
    )
  }

  return (
    <div className="animate-fade-up">
      <h2 className="text-3xl font-semibold">{t.title}</h2>
      <p className="mt-1.5 text-muted">{t.sub}</p>

      {(mode === 'signin' || mode === 'signup') && (
        <Segmented
          className="mt-6 w-full [&>button]:flex-1"
          value={mode}
          onChange={(v) => setMode(v)}
          ariaLabel="Type de formulaire"
          options={[
            { value: 'signin', label: 'Connexion' },
            { value: 'signup', label: 'Inscription' },
          ]}
        />
      )}

      <form onSubmit={submit} className="mt-6 space-y-4">
        <Field label="Adresse e-mail" htmlFor="email">
          <Input
            id="email"
            type="email"
            icon={Mail}
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="sacha@exemple.fr"
          />
        </Field>
        {(mode === 'signin' || mode === 'signup') && (
          <Field
            label="Mot de passe"
            htmlFor="password"
            hint={mode === 'signup' ? 'Au moins 8 caractères. Évite un mot de passe déjà utilisé ailleurs.' : undefined}
          >
            <Input
              id="password"
              type={showPwd ? 'text' : 'password'}
              icon={Lock}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={mode === 'signup' ? 8 : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              trailing={
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  aria-label={showPwd ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                  className="grid size-8 place-items-center rounded-lg text-subtle hover:text-fg"
                >
                  {showPwd ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
                </button>
              }
            />
          </Field>
        )}
        {mode === 'signup' && <PasswordMeter password={password} />}

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {t.cta} <ArrowRight className="size-4" />
        </Button>
      </form>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-sm">
        {mode === 'signin' ? (
          <>
            <button type="button" className="font-semibold text-info hover:underline" onClick={() => setMode('forgot')}>
              Mot de passe oublié ?
            </button>
            <button type="button" className="inline-flex items-center gap-1.5 font-semibold text-muted hover:text-fg" onClick={() => setMode('magic')}>
              <KeyRound className="size-4" /> Lien magique
            </button>
          </>
        ) : mode !== 'signup' ? (
          <button type="button" className="font-semibold text-info hover:underline" onClick={() => setMode('signin')}>
            ← Retour à la connexion
          </button>
        ) : null}
      </div>

      <div className="mt-8 flex items-start gap-3 rounded-2xl bg-sunken p-4 text-xs text-muted">
        <ShieldCheck className="size-5 shrink-0 text-success" />
        <p>
          Connexion chiffrée (HTTPS), mots de passe hachés côté serveur et données isolées par compte grâce aux règles
          de sécurité de la base (Row Level Security).
        </p>
      </div>
    </div>
  )
}

function PasswordMeter({ password }: { password: string }) {
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  const level = Math.min(4, score)
  const labels = ['Très faible', 'Faible', 'Correct', 'Bon', 'Excellent']
  const colors = ['bg-brand', 'bg-brand', 'bg-accent', 'bg-success', 'bg-success']
  if (!password) return null
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 gap-1">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn('h-1.5 flex-1 rounded-full transition', i < level ? colors[level] : 'bg-sunken')} />
        ))}
      </div>
      <span className="w-20 text-right text-xs font-semibold text-muted">{labels[level]}</span>
    </div>
  )
}

function NotConfigured() {
  return (
    <div className="surface rounded-3xl p-8">
      <h2 className="text-2xl font-semibold">Base de données non configurée</h2>
      <p className="mt-2 text-sm text-muted">
        Renseigne <code className="rounded bg-sunken px-1">VITE_SUPABASE_URL</code> et{' '}
        <code className="rounded bg-sunken px-1">VITE_SUPABASE_ANON_KEY</code> pour activer la connexion. En attendant,
        l’app fonctionne en mode local.
      </p>
    </div>
  )
}
