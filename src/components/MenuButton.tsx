import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

export interface MenuItem {
  label: string
  icon?: LucideIcon
  disabled?: boolean
  title?: string
  onSelect: () => void
}

/** A button that opens a menu: arrow keys move, Enter picks, Escape or a click outside closes. */
export function MenuButton({ label, children, items }: { label: string; children: ReactNode; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const root = useRef<HTMLDivElement | null>(null)
  const button = useRef<HTMLButtonElement | null>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => {
    if (open) root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')[active]?.focus()
  }, [open, active])

  function openAt(i: number) {
    setActive(i)
    setOpen(true)
  }

  function close() {
    setOpen(false)
    button.current?.focus()
  }

  function onMenuKey(e: React.KeyboardEvent) {
    const n = items.length
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (i + 1) % n)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (i - 1 + n) % n)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setActive(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setActive(n - 1)
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault()
      close()
    }
  }

  return (
    <div className="menu-root" ref={root}>
      <button
        ref={button}
        className="btn small"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        aria-label={label}
        onClick={() => (open ? setOpen(false) : openAt(0))}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            openAt(0)
          } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            openAt(items.length - 1)
          }
        }}
      >
        {children}
      </button>
      {open && (
        <div className="menu" role="menu" id={id} aria-label={label} onKeyDown={onMenuKey}>
          {items.map((item, i) => {
            const Icon = item.icon
            return (
              <button
                key={item.label}
                role="menuitem"
                className="menu-item"
                tabIndex={i === active ? 0 : -1}
                disabled={item.disabled}
                title={item.title}
                onMouseEnter={() => setActive(i)}
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
              >
                {Icon && <Icon aria-hidden="true" />}
                {item.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
