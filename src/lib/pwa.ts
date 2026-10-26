import { desktop, type UpdateStatus } from './desktop'

/**
 * The installable web app (phones): service worker registration, updates and the install prompt.
 * The desktop app updates through electron-updater, and dev builds skip all of this.
 */

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let registration: ServiceWorkerRegistration | null = null
let status: UpdateStatus = { state: 'idle', current: __APP_VERSION__ }
let installPrompt: InstallPromptEvent | null = null
const listeners = new Set<() => void>()

function set(next: Partial<UpdateStatus>) {
  status = { ...status, ...next }
  for (const l of listeners) l()
}

export function webAppEnabled(): boolean {
  return import.meta.env.PROD && !desktop() && typeof navigator !== 'undefined' && 'serviceWorker' in navigator
}

export function webStatus(): UpdateStatus {
  return status
}

export function onWebChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The version that is downloaded and waiting, read from the network because the old worker still runs the page. */
async function markWaiting() {
  let version: string | undefined
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}version.json`, { cache: 'no-store' })
    version = ((await res.json()) as { version?: string }).version
  } catch {
    /* offline: the update still applies, only its number is unknown */
  }
  set({ state: 'downloaded', version })
}

function watch(worker: ServiceWorker | null) {
  if (!worker) return
  const check = () => {
    // A worker that installs while another controls the page is an update; the first install takes over by itself.
    if (worker.state === 'installed' && navigator.serviceWorker.controller) void markWaiting()
  }
  check()
  worker.addEventListener('statechange', check)
}

export async function registerWebApp(): Promise<void> {
  if (typeof window !== 'undefined' && !desktop()) {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()
      installPrompt = e as InstallPromptEvent
      set({})
    })
    window.addEventListener('appinstalled', () => {
      installPrompt = null
      set({})
    })
  }
  if (!webAppEnabled()) return
  // Ask the phone not to clear the app's data when space runs low; progress lives only on the device.
  void navigator.storage?.persist?.().catch(() => undefined)
  try {
    registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`)
  } catch (e) {
    console.warn('[pwa] service worker not registered', e)
    return
  }
  if (registration.waiting) void markWaiting()
  watch(registration.installing)
  registration.addEventListener('updatefound', () => {
    if (navigator.serviceWorker.controller) set({ state: 'downloading' })
    watch(registration?.installing ?? null)
  })
  // A new worker takes over after the first install (which also makes the page cross-origin
  // isolated, so the multi-threaded engine can load) or when the user applies an update.
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return
    reloading = true
    location.reload()
  })
  // Phones keep an installed app open for days; look for a new version when it comes back to the front.
  let lastCheck = Date.now()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastCheck > 60 * 60 * 1000) {
      lastCheck = Date.now()
      void registration?.update().catch(() => undefined)
    }
  })
}

export async function checkWebUpdate(): Promise<void> {
  if (!registration) return
  if (!navigator.onLine) {
    set({ state: 'error', message: 'You are offline. Updates download when you are back online.' })
    return
  }
  set({ state: 'checking', message: undefined })
  try {
    await registration.update()
    if (registration.waiting) await markWaiting()
    else if (registration.installing) set({ state: 'downloading' })
    else set({ state: 'not-available' })
  } catch (e) {
    set({ state: 'error', message: e instanceof Error ? e.message : String(e) })
  }
}

/** Switches to the waiting version; the controllerchange listener reloads the page. */
export function applyWebUpdate(): void {
  registration?.waiting?.postMessage('skip-waiting')
}

export function canInstall(): boolean {
  return installPrompt !== null
}

export async function promptInstall(): Promise<void> {
  const prompt = installPrompt
  if (!prompt) return
  await prompt.prompt()
  await prompt.userChoice
  installPrompt = null
  set({})
}
