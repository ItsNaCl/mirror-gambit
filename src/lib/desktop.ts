/**
 * Bridge to the Electron shell (electron/preload.ts). Undefined in the browser build,
 * so every caller must handle the web case.
 */

export type UpdateState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'
  | 'unsupported'

export interface UpdateStatus {
  state: UpdateState
  /** Version currently running. */
  current: string
  /** Version offered by the latest release, when known. */
  version?: string
  /** Download progress 0..100 while downloading. */
  percent?: number
  message?: string
}

export interface DesktopBridge {
  desktop: true
  updates: {
    get(): Promise<UpdateStatus>
    check(): Promise<UpdateStatus>
    download(): Promise<void>
    install(): Promise<void>
    onStatus(listener: (status: UpdateStatus) => void): () => void
  }
  chessCom: {
    /** Raw JSON text of chess.com's game endpoint, fetched by the main process (no CORS there). */
    fetchGame(kind: 'live' | 'daily', id: string): Promise<string>
  }
}

export function desktop(): DesktopBridge | undefined {
  return (globalThis as { mirrorGambit?: DesktopBridge }).mirrorGambit
}

/** Where the installers live, for the browser build and the portable exe. */
export const RELEASES_URL = 'https://github.com/ItsNaCl/mirror-gambit/releases/latest'

/**
 * chess.com game JSON: through the desktop shell, or the Vite dev proxy in development.
 * The production browser build has no way around CORS, so it explains how to paste the PGN instead.
 */
export async function fetchChessComJson(kind: 'live' | 'daily', id: string): Promise<string> {
  const bridge = desktop()
  if (bridge) return bridge.chessCom.fetchGame(kind, id)
  if (import.meta.env.DEV) {
    const res = await fetch(`/chesscom/${kind}/game/${id}`)
    if (!res.ok) throw new Error(res.status === 404 ? 'chess.com could not find that game.' : `chess.com answered ${res.status}.`)
    return res.text()
  }
  throw new Error('Loading chess.com links works in the desktop app. Here, open the game on chess.com, choose Share, copy the PGN and use Import PGN.')
}

/** Errors from the desktop shell arrive as "Error invoking remote method 'x': Error: message". */
export function cleanError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}
