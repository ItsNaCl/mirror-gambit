import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import * as kv from '../lib/store/kv'

export interface Settings {
  showAnalysis: boolean
  depth: number
  legalDots: boolean
  autoFlip: boolean
  blunderAlerts: boolean
  openingDetection: boolean
  principleReminders: boolean
  hints: boolean
  engineBuild: 'full' | 'lite'
  /** 0 means "pick automatically from the CPU core count". */
  threads: number
  /** Make the Hint button pulse after this many wrong tries on one move. 0 = off. */
  autoHintAfter: 0 | 2 | 3 | 5
  /** Board layers on the Board and Game review screens. */
  overlayControl: boolean
  overlayLines: boolean
  overlayLoose: boolean
  /** Monthly spending limit for the Claude coach in US dollars. 0 = no limit. */
  claudeMonthlyCap: 0 | 1 | 5 | 10 | 20
}

export const DEFAULT_SETTINGS: Settings = {
  showAnalysis: false,
  depth: 18,
  legalDots: true,
  autoFlip: false,
  blunderAlerts: true,
  openingDetection: true,
  principleReminders: true,
  hints: true,
  engineBuild: 'full',
  threads: 0,
  autoHintAfter: 0,
  overlayControl: false,
  overlayLines: false,
  overlayLoose: false,
  claudeMonthlyCap: 5,
}

const STORAGE_KEY = 'mirror-gambit.settings.v1'

function loadSettings(): Settings {
  try {
    const raw = kv.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed = JSON.parse(raw) as Partial<Settings>
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return DEFAULT_SETTINGS
  }
}

interface SettingsContextValue {
  settings: Settings
  update: (patch: Partial<Settings>) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings)
  useEffect(() => {
    try {
      kv.setItem(STORAGE_KEY, JSON.stringify(settings))
    } catch {
      /* storage may be unavailable; settings just will not persist */
    }
  }, [settings])
  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), [])
  const value = useMemo(() => ({ settings, update }), [settings, update])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider')
  return ctx
}
