import type { UpdatesApi } from '../hooks/useUpdates'
import { RELEASES_URL } from '../lib/desktop'

/** Slim bar under the header when an update is ready to download or install. */
export function UpdateBanner({ updates }: { updates: UpdatesApi }) {
  const s = updates.status
  if (!s || (s.state !== 'available' && s.state !== 'downloading' && s.state !== 'downloaded')) return null
  return (
    <div className="update-banner">
      {s.state === 'available' && (
        <>
          <span>Mirror Gambit {s.version} is available (you have {s.current}).</span>
          <button className="btn small primary" onClick={updates.download}>
            Download update
          </button>
        </>
      )}
      {s.state === 'downloading' && <span>Downloading {s.version}… {s.percent ?? 0}%</span>}
      {s.state === 'downloaded' && (
        <>
          <span>Version {s.version} is ready. Your progress is kept.</span>
          <button className="btn small primary" onClick={updates.install}>
            Restart and update
          </button>
        </>
      )}
    </div>
  )
}

/** The "Updates" section of the Settings tab. */
export function UpdateSettings({ updates }: { updates: UpdatesApi }) {
  if (!updates.available) {
    return (
      <p className="small-text muted">
        This is the browser version. The Windows app can update itself; download it from the{' '}
        <a href={RELEASES_URL} target="_blank" rel="noreferrer">
          releases page
        </a>
        .
      </p>
    )
  }
  const s = updates.status
  if (!s) return <p className="small-text muted">Checking the version…</p>
  const busy = s.state === 'checking' || s.state === 'downloading'
  return (
    <div>
      <div className="setting-row">
        <div>
          <div className="label">Version {s.current}</div>
          <div className="desc">{describe(s)}</div>
        </div>
        {s.state === 'available' ? (
          <button className="btn small primary" onClick={updates.download}>
            Download {s.version}
          </button>
        ) : s.state === 'downloaded' ? (
          <button className="btn small primary" onClick={updates.install}>
            Restart and update
          </button>
        ) : s.state === 'unsupported' ? (
          <a className="btn small" href={RELEASES_URL} target="_blank" rel="noreferrer">
            Open releases
          </a>
        ) : (
          <button className="btn small" onClick={updates.check} disabled={busy}>
            {s.state === 'checking' ? 'Checking…' : 'Check for updates'}
          </button>
        )}
      </div>
      {s.state === 'downloading' && (
        <div className="progress">
          <div style={{ width: `${s.percent ?? 0}%` }} />
        </div>
      )}
    </div>
  )
}

function describe(s: NonNullable<UpdatesApi['status']>): string {
  switch (s.state) {
    case 'checking':
      return 'Looking for a newer version on GitHub…'
    case 'available':
      return `Version ${s.version} is available.`
    case 'not-available':
      return 'You have the latest version.'
    case 'downloading':
      return `Downloading ${s.version}… ${s.percent ?? 0}%`
    case 'downloaded':
      return `Version ${s.version} is downloaded. Restart to finish; your progress is kept.`
    case 'error':
      return `Update check failed: ${s.message ?? 'unknown error'}`
    case 'unsupported':
      return s.message ?? 'Updates are not available in this version.'
    default:
      return 'The app checks GitHub for new versions automatically.'
  }
}
