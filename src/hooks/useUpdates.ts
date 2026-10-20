import { useCallback, useEffect, useState } from 'react'
import { desktop, type UpdateStatus } from '../lib/desktop'

/** Update status from the desktop shell; null in the browser build. */
export function useUpdates() {
  const bridge = desktop()
  const [status, setStatus] = useState<UpdateStatus | null>(null)

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
  }, [bridge])
  const download = useCallback(() => void bridge?.updates.download(), [bridge])
  const install = useCallback(() => void bridge?.updates.install(), [bridge])

  return { available: !!bridge, status, check, download, install }
}

export type UpdatesApi = ReturnType<typeof useUpdates>
