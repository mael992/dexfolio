import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { isLang, type Lang } from './tcgdex'
import { readLocal, writeLocal } from './utils'

export type ThemePref = 'system' | 'light' | 'dark'
export type GridSize = 'sm' | 'md' | 'lg'

interface Settings {
  cardLang: Lang
  theme: ThemePref
  gridSize: GridSize
}

interface SettingsContextValue extends Settings {
  resolvedTheme: 'light' | 'dark'
  setCardLang(l: Lang): void
  setTheme(t: ThemePref): void
  setGridSize(g: GridSize): void
}

const KEY = 'dexfolio:settings'
const THEME_KEY = 'dexfolio:theme'

const SettingsContext = createContext<SettingsContextValue | null>(null)

function systemDark() {
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => {
    const saved = readLocal<Partial<Settings>>(KEY, {})
    let theme: ThemePref = 'system'
    try {
      const t = localStorage.getItem(THEME_KEY)
      if (t === 'light' || t === 'dark' || t === 'system') theme = t
    } catch {
      /* ignore */
    }
    return {
      cardLang: isLang(saved.cardLang) ? saved.cardLang : 'fr',
      theme,
      gridSize: saved.gridSize === 'sm' || saved.gridSize === 'lg' ? saved.gridSize : 'md',
    }
  })
  const [isSystemDark, setIsSystemDark] = useState(systemDark)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setIsSystemDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolvedTheme: 'light' | 'dark' =
    settings.theme === 'system' ? (isSystemDark ? 'dark' : 'light') : settings.theme

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme)
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', resolvedTheme === 'dark' ? '#090d1a' : '#E3350D')
  }, [resolvedTheme])

  const persist = useCallback((next: Settings) => {
    writeLocal(KEY, { cardLang: next.cardLang, gridSize: next.gridSize })
    try {
      localStorage.setItem(THEME_KEY, next.theme)
    } catch {
      /* ignore */
    }
  }, [])

  const update = useCallback(
    (patch: Partial<Settings>) =>
      setSettings((prev) => {
        const next = { ...prev, ...patch }
        persist(next)
        return next
      }),
    [persist],
  )

  const value = useMemo<SettingsContextValue>(
    () => ({
      ...settings,
      resolvedTheme,
      setCardLang: (cardLang) => update({ cardLang }),
      setTheme: (theme) => update({ theme }),
      setGridSize: (gridSize) => update({ gridSize }),
    }),
    [settings, resolvedTheme, update],
  )

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings doit être utilisé dans <SettingsProvider>')
  return ctx
}
