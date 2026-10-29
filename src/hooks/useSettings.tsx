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
  /** Hours a week the student can give to training. The coach sizes sessions from it. */
  weeklyHours: number
  /** The student's rapid rating when their imported games carry none. null = unknown. */
  ratingOverride: number | null
  /** How the coach talks. */
  coachVoice: 'direct' | 'playful' | 'calm'
}

// Phones and tablets start on the 2 MB engine: the full one is a 95 MB download and needs more memory.
const touchDevice = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches

export const DEFAULT_SETTINGS: Settings = {
  showAnalysis: false,
  depth: 18,
  legalDots: true,
  autoFlip: false,
  blunderAlerts: true,
  openingDetection: true,
  principleReminders: true,
  hints: true,
  engineBuild: touchDevice ? 'lite' : 'full',
  threads: 0,
  autoHintAfter: 0,
  overlayControl: false,
  overlayLines: false,
  overlayLoose: false,
  claudeMonthlyCap: 5,
  weeklyHours: 7,
  ratingOverride: null,
  coachVoice: 'direct',
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
