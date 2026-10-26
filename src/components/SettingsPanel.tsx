import type { ReactNode } from 'react'
import { DEFAULT_SETTINGS, useSettings, type Settings } from '../hooks/useSettings'
import type { UpdatesApi } from '../hooks/useUpdates'
import type { ClaudeCoachApi } from '../hooks/useClaudeCoach'
import { ClaudeSettings } from './ClaudeSettings'
import { UpdateSettings } from './UpdatePanel'

interface SwitchRowProps {
  label: string
  desc: string
  value: boolean
  onChange: (v: boolean) => void
}

function SwitchRow({ label, desc, value, onChange }: SwitchRowProps) {
  return (
    <div className="setting-row">
      <div>
        <div className="label">{label}</div>
        <div className="desc">{desc}</div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        className={'switch' + (value ? ' on' : '')}
        onClick={() => onChange(!value)}
      />
    </div>
  )
}

function Section({ title, about, children }: { title: string; about: ReactNode; children: ReactNode }) {
  return (
    <section className="settings-section">
      <div className="about">
        <h2>{title}</h2>
        <p>{about}</p>
      </div>
      <div className="panel">{children}</div>
    </section>
  )
}

export function SettingsPanel({ engineInfo, updates, claude }: { engineInfo?: string; updates: UpdatesApi; claude: ClaudeCoachApi }) {
  const { settings, update } = useSettings()
  const set = <K extends keyof Settings>(key: K) => (value: Settings[K]) => update({ [key]: value } as Partial<Settings>)
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2

  return (
    <div className="page">
      <Section title="Board" about="How pieces move and which way the board faces.">
        <SwitchRow
          label="Show legal move dots"
          desc="Mark the squares a selected piece can move to."
          value={settings.legalDots}
          onChange={set('legalDots')}
        />
        <SwitchRow
          label="Auto flip each turn"
          desc="Turn the board around so the side to move is always at the bottom."
          value={settings.autoFlip}
          onChange={set('autoFlip')}
        />
      </Section>

      <Section
        title="Engine"
        about={
          <>
            Stockfish 19 runs on this computer. {engineInfo ? `Currently: ${engineInfo}.` : ''} Your machine reports {cores} logical
            cores.
          </>
        }
      >
        <SwitchRow
          label="Show analysis"
          desc="The eval bar, best lines and best-move arrow. Off by default so you think first."
          value={settings.showAnalysis}
          onChange={set('showAnalysis')}
        />
        <div className="setting-row">
          <div style={{ flex: 1 }}>
            <label className="label" htmlFor="depth">
              Analysis depth: <span className="tabular">{settings.depth}</span>
            </label>
            <div className="desc">Higher is stronger but slower. 18 is a good balance; game review always uses 14.</div>
            <input id="depth" type="range" min={8} max={30} value={settings.depth} onChange={(e) => update({ depth: Number(e.target.value) })} />
          </div>
        </div>
        <div className="setting-row">
          <div style={{ flex: 1 }}>
            <label className="label" htmlFor="build">
              Engine build
            </label>
            <div className="desc">
              Full is the strongest but is about 100 MB and takes a few seconds to load. Lite is 2 MB, loads at once and is still far
              stronger than any human. Changing this reloads the engine.
            </div>
            <select id="build" value={settings.engineBuild} onChange={(e) => update({ engineBuild: e.target.value as Settings['engineBuild'] })}>
              <option value="full">Full (strongest, about 100 MB)</option>
              <option value="lite">Lite (fast to load, about 2 MB)</option>
            </select>
          </div>
        </div>
        <div className="setting-row">
          <div style={{ flex: 1 }}>
            <label className="label" htmlFor="threads">
              Engine threads
            </label>
            <div className="desc">Only used by the multi-threaded build.</div>
            <select id="threads" value={settings.threads} onChange={(e) => update({ threads: Number(e.target.value) })}>
              <option value={0}>Automatic</option>
              {[1, 2, 4, 6, 8, 12, 16].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Section>

      <Section title="Tips while you play" about="What the coach says on the board screen. Each one can be switched off.">
        <SwitchRow
          label="Move alerts"
          desc="After each move, say if it was an inaccuracy, mistake or blunder, and what was better."
          value={settings.blunderAlerts}
          onChange={set('blunderAlerts')}
        />
        <SwitchRow
          label="Opening names"
          desc="Show the name and ECO code of the opening you are playing."
          value={settings.openingDetection}
          onChange={set('openingDetection')}
        />
        <SwitchRow
          label="Principle reminders"
          desc="During the first 12 moves, remind you of opening principles when a move breaks one."
          value={settings.principleReminders}
          onChange={set('principleReminders')}
        />
        <SwitchRow
          label="Hint button"
          desc="A Hint button that reveals a tactic in three steps, only when you ask."
          value={settings.hints}
          onChange={set('hints')}
        />
      </Section>

      <Section
        title="Updates"
        about={
          updates.web
            ? 'New versions come from the project website and install when you reload.'
            : "New versions come from the project's GitHub releases and install when you restart."
        }
      >
        <div className="setting-row">
          <div style={{ flex: 1 }}>
            <UpdateSettings updates={updates} />
          </div>
        </div>
      </Section>

      <Section
        title="Claude coach"
        about="Optional. Ask Claude to explain a position or a move in your own words. It uses your own Anthropic API key and is only called when you press a coach button."
      >
        <ClaudeSettings coach={claude} />
      </Section>

      <Section title="Practice" about="Puzzles, opening drills and mistake cards all follow these rules.">
        <div className="setting-row">
          <div style={{ flex: 1 }}>
            <label className="label" htmlFor="autohint">
              Offer a hint after wrong tries
            </label>
            <div className="desc">
              Make the Hint button pulse after this many wrong tries on one move. It never shows the hint by itself.
            </div>
            <select
              id="autohint"
              value={settings.autoHintAfter}
              onChange={(e) => update({ autoHintAfter: Number(e.target.value) as Settings['autoHintAfter'] })}
            >
              <option value={0}>Off</option>
              <option value={2}>After 2 wrong tries</option>
              <option value={3}>After 3 wrong tries</option>
              <option value={5}>After 5 wrong tries</option>
            </select>
          </div>
        </div>
        <div className="setting-row">
          <div>
            <div className="label">Reset settings</div>
            <div className="desc">Puts every setting on this page back to its default. Your games, cards and stats are kept.</div>
          </div>
          <button className="btn small" onClick={() => update(DEFAULT_SETTINGS)}>
            Reset
          </button>
        </div>
      </Section>
    </div>
  )
}
