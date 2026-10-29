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
  /** The accent colour, see [data-accent] in styles.css. */
  accent: Accent
  boardTheme: BoardTheme
  /** 'auto' follows the device: rich on a pointer device, snappy on touch. */
  motion: 'auto' | 'rich' | 'snappy' | 'reduced'
  sound: boolean
  soundVolume: number
}

export type Accent = 'violet' | 'cyan' | 'emerald' | 'amber' | 'rose' | 'blue' | 'orange'
export type BoardTheme = 'violet' | 'classic' | 'walnut' | 'slate'

export const ACCENTS: { id: Accent; label: string; swatch: string }[] = [
  { id: 'violet', label: 'Violet', swatch: '#8b5cf6' },
  { id: 'cyan', label: 'Cyan', swatch: '#22d3ee' },
  { id: 'emerald', label: 'Emerald', swatch: '#34d399' },
  { id: 'amber', label: 'Amber', swatch: '#fbbf24' },
  { id: 'rose', label: 'Rose', swatch: '#fb7185' },
  { id: 'blue', label: 'Blue', swatch: '#60a5fa' },
  { id: 'orange', label: 'Orange', swatch: '#fb923c' },
]

export const BOARD_THEMES: { id: BoardTheme; label: string; light: string; dark: string }[] = [
  { id: 'violet', label: 'Violet', light: '#6e6a92', dark: '#3b375c' },
  { id: 'classic', label: 'Classic green', light: '#eeeed2', dark: '#769656' },
  { id: 'walnut', label: 'Walnut', light: '#e3d6bf', dark: '#9c8466' },
  { id: 'slate', label: 'Slate', light: '#8b93a7', dark: '#4b5366' },
]

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
  accent: 'violet',
  boardTheme: 'violet',
  motion: 'auto',
  sound: true,
  soundVolume: 0.6,
}

/** Rich motion on a pointer device, snappy on touch, unless the student chose. */
export function motionLevel(s: Pick<Settings, 'motion'>): 'rich' | 'snappy' | 'reduced' {
  if (s.motion !== 'auto') return s.motion
  if (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches) return 'reduced'
  return touchDevice ? 'snappy' : 'rich'
}

/** The motion level in force, as the theme effect wrote it to <html>. */
export function currentMotion(): 'rich' | 'snappy' | 'reduced' {
  if (typeof document === 'undefined') return 'reduced'
  const m = document.documentElement.dataset.motion
  return m === 'snappy' || m === 'reduced' ? m : 'rich'
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
  // The theme lives on <html> so every screen, the board and the shell pick it up from CSS.
  useEffect(() => {
    const el = document.documentElement
    el.dataset.accent = settings.accent
    el.dataset.board = settings.boardTheme
    const apply = () => {
      el.dataset.motion = motionLevel({ motion: settings.motion })
    }
    apply()
    // 'auto' follows the system setting, which can change while the app is open.
    if (settings.motion !== 'auto' || typeof matchMedia === 'undefined') return
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [settings.accent, settings.boardTheme, settings.motion])
  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), [])
  const value = useMemo(() => ({ settings, update }), [settings, update])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside SettingsProvider')
  return ctx
}
