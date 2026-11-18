import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router'

interface CardSheetContextValue {
  cardId: string | null
  /** Liste ordonnée pour naviguer carte précédente / suivante */
  list: string[]
  openCard(cardId: string, list?: string[]): void
  goTo(cardId: string): void
  closeCard(): void
}

const Ctx = createContext<CardSheetContextValue | null>(null)

/** La fiche carte est pilotée par l'URL (?carte=…) : partageable et compatible bouton « retour ». */
export function CardSheetProvider({ children }: { children: ReactNode }) {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [list, setList] = useState<string[]>([])
  const cardId = params.get('carte')

  const withCard = useCallback(
    (id: string | null) => {
      const next = new URLSearchParams(params)
      if (id) next.set('carte', id)
      else next.delete('carte')
      const s = next.toString()
      return { pathname: location.pathname, search: s ? `?${s}` : '' }
    },
    [params, location.pathname],
  )

  const openCard = useCallback(
    (id: string, l?: string[]) => {
      setList(l ?? [])
      navigate(withCard(id), { state: { ...(location.state as object), cardSheet: true } })
    },
    [navigate, withCard, location.state],
  )

  const goTo = useCallback((id: string) => navigate(withCard(id), { replace: true, state: location.state }), [navigate, withCard, location.state])

  const closeCard = useCallback(() => {
    if ((location.state as { cardSheet?: boolean } | null)?.cardSheet) navigate(-1)
    else navigate(withCard(null), { replace: true })
  }, [location.state, navigate, withCard])

  const value = useMemo(() => ({ cardId, list, openCard, goTo, closeCard }), [cardId, list, openCard, goTo, closeCard])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCardSheet(): CardSheetContextValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useCardSheet doit être utilisé dans <CardSheetProvider>')
  return ctx
}
