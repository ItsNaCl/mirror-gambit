import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, type LucideIcon } from 'lucide-react'

export interface Command {
  id: string
  group: string
  label: string
  description?: string
  keywords?: string
  icon?: LucideIcon
  /** Shown greyed out and skipped when false. */
  enabled?: boolean
  run: () => void
}

/** Every word typed must appear somewhere in the label, description or keywords. */
export function filterCommands(commands: Command[], query: string): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const usable = commands.filter((c) => c.enabled !== false)
  if (words.length === 0) return usable
  return usable
    .map((c) => {
      const label = c.label.toLowerCase()
      const hay = `${label} ${c.description ?? ''} ${c.keywords ?? ''}`.toLowerCase()
      if (!words.every((w) => hay.includes(w))) return null
      // Label matches first, then matches at the start of the label.
      const score = (words.every((w) => label.includes(w)) ? 2 : 0) + (label.startsWith(words[0]) ? 1 : 0)
      return { c, score }
    })
    .filter((x): x is { c: Command; score: number } => x !== null)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.c)
}

export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLUListElement | null>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)

  const results = useMemo(() => filterCommands(commands, query), [commands, query])

  useEffect(() => {
    if (!open) return
    restoreFocus.current = document.activeElement as HTMLElement | null
    setQuery('')
    setActive(0)
    requestAnimationFrame(() => inputRef.current?.focus())
    return () => restoreFocus.current?.focus?.()
  }, [open])

  useEffect(() => setActive(0), [query])

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  function run(c: Command | undefined) {
    if (!c) return
    onClose()
    c.run()
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => Math.min(results.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(results[active])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    } else if (e.key === 'Tab') {
      // Focus stays in the palette while it is open.
      e.preventDefault()
    }
  }

  let lastGroup = ''
  return (
    <div className="palette-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Go to or do anything" onKeyDown={onKeyDown}>
        <div className="palette-input">
          <Search aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={results[active] ? `cmd-${results[active].id}` : undefined}
            aria-autocomplete="list"
            placeholder="Type a screen or an action"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd>Esc</kbd>
        </div>
        {results.length === 0 ? (
          <div className="palette-empty">Nothing matches "{query}".</div>
        ) : (
          <ul className="palette-list" id="palette-list" role="listbox" ref={listRef}>
            {results.map((c, i) => {
              const header = c.group !== lastGroup && !query ? c.group : null
              lastGroup = c.group
              const Icon = c.icon
              return (
                <li key={c.id} role="presentation">
                  {header && (
                    <div className="palette-group" role="presentation">
                      {header}
                    </div>
                  )}
                  <div
                    id={`cmd-${c.id}`}
                    role="option"
                    aria-selected={i === active}
                    className="palette-item"
                    onMouseMove={() => setActive(i)}
                    onClick={() => run(c)}
                  >
                    {Icon && <Icon aria-hidden="true" />}
                    <span className="text">
                      {c.label}
                      {c.description && <span className="desc">{c.description}</span>}
                    </span>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
