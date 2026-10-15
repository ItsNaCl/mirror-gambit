import { DEFAULT_SETTINGS, useSettings, type Settings } from '../hooks/useSettings'

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

export function SettingsPanel({ engineInfo }: { engineInfo?: string }) {
  const { settings, update } = useSettings()
  const set = <K extends keyof Settings>(key: K) => (value: Settings[K]) => update({ [key]: value } as Partial<Settings>)
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2

  return (
    <div>
      <div className="section-title">Board</div>
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

      <div className="section-title">Engine</div>
      <SwitchRow
        label="Show analysis"
        desc="Show the eval bar, best lines and best-move arrow. Off by default so you think first."
        value={settings.showAnalysis}
        onChange={set('showAnalysis')}
      />
      <div className="setting-row">
        <div style={{ flex: 1 }}>
          <div className="label">Analysis depth: {settings.depth}</div>
          <div className="desc">Higher is stronger but slower. 18 is a good balance; game review always uses 14.</div>
          <input
            type="range"
            min={8}
            max={30}
            value={settings.depth}
            onChange={(e) => update({ depth: Number(e.target.value) })}
          />
        </div>
      </div>
      <div className="setting-row">
        <div style={{ flex: 1 }}>
          <div className="label">Engine build</div>
          <div className="desc">
            Full is the strongest but is about 100 MB and takes a few seconds to load. Lite is 2 MB, loads instantly
            and is still far stronger than any human. Changing this reloads the engine.
          </div>
          <select value={settings.engineBuild} onChange={(e) => update({ engineBuild: e.target.value as Settings['engineBuild'] })}>
            <option value="full">Full (strongest, ~100 MB)</option>
            <option value="lite">Lite (fast to load, ~2 MB)</option>
          </select>
        </div>
      </div>
      <div className="setting-row">
        <div style={{ flex: 1 }}>
          <div className="label">Engine threads</div>
          <div className="desc">
            Only used by the multi-threaded build. Your machine reports {cores} logical cores.{' '}
            {engineInfo && <span>Currently: {engineInfo}.</span>}
          </div>
          <select value={settings.threads} onChange={(e) => update({ threads: Number(e.target.value) })}>
            <option value={0}>Automatic</option>
            {[1, 2, 4, 6, 8, 12, 16].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="section-title">Tips</div>
      <SwitchRow
        label="Blunder alerts"
        desc="After each move, tell you if it was an inaccuracy, mistake or blunder, and what was better."
        value={settings.blunderAlerts}
        onChange={set('blunderAlerts')}
      />
      <SwitchRow
        label="Opening detection"
        desc="Show the name and ECO code of the opening you are playing."
        value={settings.openingDetection}
        onChange={set('openingDetection')}
      />
      <SwitchRow
        label="Principle reminders"
        desc="During the first 12 moves, remind you of basic opening principles when a move breaks one."
        value={settings.principleReminders}
        onChange={set('principleReminders')}
      />
      <SwitchRow
        label="Hint button"
        desc="Show a Hint button that reveals a tactic in three steps, only when you ask."
        value={settings.hints}
        onChange={set('hints')}
      />

      <div className="section-title">Practice</div>
      <div className="setting-row">
        <div style={{ flex: 1 }}>
          <div className="label">Auto offer hint after wrong tries</div>
          <div className="desc">
            In puzzles, opening drills and review cards, make the Hint button pulse after this many wrong tries on one
            move. It never shows the hint by itself.
          </div>
          <select
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

      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn small" onClick={() => update(DEFAULT_SETTINGS)}>
          Reset to defaults
        </button>
      </div>
    </div>
  )
}
