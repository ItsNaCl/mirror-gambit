import { useCallback, useRef, useState } from 'react'

export type ToastKind = 'info' | 'good' | 'warn' | 'bad'

export interface Toast {
  id: number
  kind: ToastKind
  title: string
  body?: string
  /** Optional one-click action shown as a button (e.g. "Take it back"). */
  action?: { label: string; onClick: () => void }
}

export function useToasts(defaultTtlMs = 7000) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), [])

  const notify = useCallback(
    (toast: Omit<Toast, 'id'>, ttlMs: number = defaultTtlMs) => {
      const id = nextId.current++
      setToasts((list) => [...list.slice(-3), { ...toast, id }])
      if (ttlMs > 0) setTimeout(() => dismiss(id), ttlMs)
      return id
    },
    [defaultTtlMs, dismiss],
  )

  return { toasts, notify, dismiss }
}

export function ToastStack({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null
  return (
    <div className="toast-stack" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`} role="status">
          <div onClick={() => onDismiss(t.id)} style={{ cursor: 'pointer' }}>
            <strong>{t.title}</strong>
            {t.body && <div className="small-text muted">{t.body}</div>}
          </div>
          {t.action && (
            <button
              className="btn small primary"
              style={{ marginTop: 8 }}
              onClick={() => {
                t.action?.onClick()
                onDismiss(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
