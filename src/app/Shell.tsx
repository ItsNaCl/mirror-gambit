import { useEffect, useRef, useState, type ReactNode } from 'react'
import { BookOpen, ChartLine, ChevronDown, Compass, GitBranch, GraduationCap, Grid3x3, Library, Swords, Layers, Menu, Puzzle, Search, Settings, TrendingUp, X, type LucideIcon } from 'lucide-react'
import { NAV, ROUTES, type RouteId } from './routes'

export const ROUTE_ICONS: Record<RouteId, LucideIcon> = {
  coach: Compass,
  play: Swords,
  games: Library,
  repertoire: GitBranch,
  courses: GraduationCap,
  board: Grid3x3,
  review: ChartLine,
  openings: BookOpen,
  puzzles: Puzzle,
  cards: Layers,
  progress: TrendingUp,
  settings: Settings,
}

/** The product's mark: two squares mirrored across the diagonal. */
export function BrandMark({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden="true">
      <rect x="0" y="0" width="10" height="10" rx="2" fill="var(--board-light)" />
      <rect x="10" y="10" width="10" height="10" rx="2" fill="var(--board-light)" />
      <rect x="10" y="0" width="10" height="10" rx="2" fill="var(--board-dark)" />
      <rect x="0" y="10" width="10" height="10" rx="2" fill="var(--board-dark)" />
    </svg>
  )
}

export interface SidebarProps {
  route: RouteId
  onNavigate: (id: RouteId) => void
  counts: Partial<Record<RouteId, number>>
  engine: { state: 'loading' | 'ready' | 'error'; text: string }
  open: boolean
  onClose: () => void
}

const COLLAPSED_KEY = 'mirror-gambit.nav-collapsed'

function loadCollapsed(): string[] {
  try {
    return JSON.parse(sessionStorage.getItem(COLLAPSED_KEY) ?? '[]') as string[]
  } catch {
    return []
  }
}

export function Sidebar({ route, onNavigate, counts, engine, open, onClose }: SidebarProps) {
  const [collapsed, setCollapsed] = useState<string[]>(loadCollapsed)
  const navRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    try {
      sessionStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed))
    } catch {
      /* ignore */
    }
  }, [collapsed])

  // Roving focus: Up/Down move between nav items, Home/End jump to the ends.
  function onKeyDown(e: React.KeyboardEvent) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    const items = Array.from(navRef.current?.querySelectorAll<HTMLElement>('.nav-item, .nav-group-toggle') ?? []).filter(
      (el) => el.offsetParent !== null,
    )
    const i = items.indexOf(document.activeElement as HTMLElement)
    if (i < 0) return
    e.preventDefault()
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1 : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
    items[next]?.focus()
  }

  return (
    <aside className={'sidebar' + (open ? ' open' : '')} aria-label="Main">
      <div className="brand">
        <span className="row" style={{ gap: 10, flexWrap: 'nowrap' }}>
          <BrandMark />
          <span className="brand-name">Mirror Gambit</span>
        </span>
        <button className="btn icon ghost sidebar-close" onClick={onClose} aria-label="Close menu">
          <X />
        </button>
      </div>
      <nav className="nav" ref={navRef} onKeyDown={onKeyDown}>
        {NAV.map((group) => {
          const isCollapsed = collapsed.includes(group.label) && !group.routes.includes(route)
          const listId = `nav-${group.label.toLowerCase()}`
          return (
            <div className="nav-group" key={group.label}>
              <button
                className="nav-group-toggle"
                aria-expanded={!isCollapsed}
                aria-controls={listId}
                onClick={() =>
                  setCollapsed((c) => (c.includes(group.label) ? c.filter((g) => g !== group.label) : [...c, group.label]))
                }
              >
                {group.label}
                <ChevronDown />
              </button>
              <div className="nav-items" id={listId} hidden={isCollapsed}>
                {group.routes.map((id) => (
                  <NavItem key={id} id={id} current={route === id} count={counts[id]} onNavigate={onNavigate} />
                ))}
              </div>
            </div>
          )
        })}
      </nav>
      <div className="sidebar-foot">
        <span className={`engine-state ${engine.state}`} title={engine.text}>
          <span className="dot" />
          <span className="engine-text">{engine.text}</span>
        </span>
      </div>
    </aside>
  )
}

/** One nav link. In the icon rail its label appears as a flyout after a short hover. */
function NavItem({ id, current, count, onNavigate }: { id: RouteId; current: boolean; count?: number; onNavigate: (id: RouteId) => void }) {
  const Icon = ROUTE_ICONS[id]
  const [flyout, setFlyout] = useState(false)
  const timer = useRef<number | null>(null)
  const label = ROUTES[id].label

  // Hover intent: open after 120 ms of resting on the item, close 80 ms after leaving.
  function schedule(show: boolean) {
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setFlyout(show), show ? 120 : 80)
  }
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])

  return (
    <a
      href={`#/${id}`}
      className="nav-item"
      aria-current={current ? 'page' : undefined}
      aria-label={count ? `${label}, ${count} due` : label}
      onClick={(e) => {
        e.preventDefault()
        onNavigate(id)
      }}
      onMouseEnter={() => schedule(true)}
      onMouseLeave={() => schedule(false)}
      onFocus={() => setFlyout(true)}
      onBlur={() => setFlyout(false)}
    >
      <Icon aria-hidden="true" />
      <span className="nav-label">{label}</span>
      {!!count && <span className="count">{count}</span>}
      {!!count && <span className="count-dot" aria-hidden="true" />}
      {flyout && (
        <span className="nav-flyout" aria-hidden="true">
          {label}
          {count ? ` · ${count} due` : ''}
        </span>
      )}
    </a>
  )
}

export interface TopBarProps {
  title: string
  sub?: ReactNode
  onOpenPalette: () => void
  onOpenMenu: () => void
  children?: ReactNode
}

export function TopBar({ title, sub, onOpenPalette, onOpenMenu, children }: TopBarProps) {
  return (
    <header className="topbar">
      <button className="btn icon ghost menu-toggle" onClick={onOpenMenu} aria-label="Open menu">
        <Menu />
      </button>
      <div className="title-block">
        <h1>{title}</h1>
        {sub && <span className="sub">{sub}</span>}
      </div>
      <span className="spacer" />
      {children}
      <button className="search-trigger" onClick={onOpenPalette} aria-label="Search and commands" aria-keyshortcuts="Control+K">
        <Search aria-hidden="true" />
        <span className="text">Go to or do anything</span>
        <kbd>Ctrl K</kbd>
      </button>
    </header>
  )
}
