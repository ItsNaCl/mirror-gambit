import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { desktop, type UpdateStatus } from '../lib/desktop'
import { applyWebUpdate, canInstall, checkWebUpdate, onWebChange, promptInstall, webAppEnabled, webStatus } from '../lib/pwa'

/** Update status from the desktop shell, or from the service worker in the installed web app; null otherwise. */
export function useUpdates() {
  const bridge = desktop()
  const web = !bridge && webAppEnabled()
  const [status, setStatus] = useState<UpdateStatus | null>(null)
  const webState = useSyncExternalStore(onWebChange, webStatus)
  const installable = useSyncExternalStore(onWebChange, canInstall)

  useEffect(() => {
    if (!bridge) return
    let alive = true
    void bridge.updates.get().then((s) => {
      if (alive) setStatus(s)
    })
    const off = bridge.updates.onStatus(setStatus)
    return () => {
      alive = false
      off()
    }
  }, [bridge])

  const check = useCallback(() => {
    if (bridge) void bridge.updates.check().then(setStatus)
    else if (web) void checkWebUpdate()
  }, [bridge, web])
  const download = useCallback(() => void bridge?.updates.download(), [bridge])
  const install = useCallback(() => (bridge ? void bridge.updates.install() : applyWebUpdate()), [bridge])
  const installApp = useCallback(() => void promptInstall(), [])

  return {
    available: !!bridge || web,
    web,
    status: web ? webState : status,
    check,
    download,
    install,
    /** The browser offers to install the web app as an app (Android Chrome, desktop Chrome and Edge). */
    installable,
    installApp,
  }
}

export type UpdatesApi = ReturnType<typeof useUpdates>
