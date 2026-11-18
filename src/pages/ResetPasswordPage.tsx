import { ArrowRight, Lock } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Logo } from '../components/Logo'
import { Button, Field, Input } from '../components/ui'
import { authErrorMessage, useAuth } from '../lib/auth'
import { supabase } from '../lib/supabase'
import { Splash } from '../router'

export default function ResetPasswordPage() {
  const { status, clearRecovery } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)

  if (status === 'loading') return <Splash />

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!supabase) return
    if (password.length < 8) return toast.error('Le mot de passe doit contenir au moins 8 caractères.')
    if (password !== confirm) return toast.error('Les deux mots de passe ne correspondent pas.')
    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({ password })
      if (error) throw error
      clearRecovery()
      toast.success('Mot de passe mis à jour !')
      navigate('/', { replace: true })
    } catch (err) {
      toast.error(authErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="pt-safe grid min-h-dvh place-items-center px-5 py-10">
      <div className="w-full max-w-[420px]">
        <Logo className="mb-8" />
        {status !== 'signedIn' ? (
          <div className="surface rounded-3xl p-8">
            <h1 className="text-2xl font-semibold">Lien expiré</h1>
            <p className="mt-2 text-sm text-muted">
              Ce lien de réinitialisation n’est plus valide (ou a été ouvert dans un autre navigateur). Redemande-en un
              depuis la page de connexion.
            </p>
            <Button className="mt-6" onClick={() => navigate('/connexion', { replace: true })}>
              Aller à la connexion
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="surface animate-fade-up space-y-4 rounded-3xl p-8">
            <div>
              <h1 className="text-2xl font-semibold">Nouveau mot de passe</h1>
              <p className="mt-1 text-sm text-muted">Choisis un mot de passe solide (8 caractères minimum).</p>
            </div>
            <Field label="Nouveau mot de passe" htmlFor="pwd">
              <Input id="pwd" type="password" icon={Lock} autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            <Field label="Confirmation" htmlFor="pwd2">
              <Input id="pwd2" type="password" icon={Lock} autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </Field>
            <Button type="submit" size="lg" className="w-full" loading={loading}>
              Enregistrer <ArrowRight className="size-4" />
            </Button>
          </form>
        )}
      </div>
    </div>
  )
}
