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
          <span>{s.version ? `Version ${s.version} is ready.` : 'A new version is ready.'} Your progress is kept.</span>
          <button className="btn small primary" onClick={updates.install}>
            {updates.web ? 'Reload and update' : 'Restart and update'}
          </button>
        </>
      )}
    </div>
  )
}

/** The "Updates" section of the Settings tab. */
export function UpdateSettings({ updates }: { updates: UpdatesApi }) {
  const install = updates.installable && (
    <div className="setting-row">
      <div>
        <div className="label">Install as an app</div>
        <div className="desc">Adds Mirror Gambit to your home screen or app list. It then opens in its own window and works offline.</div>
      </div>
      <button className="btn small primary" onClick={updates.installApp}>
        Install
      </button>
    </div>
  )
  if (!updates.available) {
    return (
      <div>
        {install}
        <p className="small-text muted">
          This is the browser version. The Windows app can update itself; download it from the{' '}
          <a href={RELEASES_URL} target="_blank" rel="noreferrer">
            releases page
          </a>
          .
        </p>
      </div>
    )
  }
  const s = updates.status
  if (!s) return <p className="small-text muted">Checking the version…</p>
  const busy = s.state === 'checking' || s.state === 'downloading'
  return (
    <div>
      {install}
      <div className="setting-row">
        <div>
          <div className="label">Version {s.current}</div>
          <div className="desc">{describe(s, updates.web)}</div>
        </div>
        {s.state === 'available' ? (
          <button className="btn small primary" onClick={updates.download}>
            Download {s.version}
          </button>
        ) : s.state === 'downloaded' ? (
          <button className="btn small primary" onClick={updates.install}>
            {updates.web ? 'Reload and update' : 'Restart and update'}
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

function describe(s: NonNullable<UpdatesApi['status']>, web: boolean): string {
  switch (s.state) {
    case 'checking':
      return web ? 'Looking for a newer version…' : 'Looking for a newer version on GitHub…'
    case 'available':
      return `Version ${s.version} is available.`
    case 'not-available':
      return 'You have the latest version.'
    case 'downloading':
      return `Downloading ${s.version}… ${s.percent ?? 0}%`
    case 'downloaded':
      if (web) return `${s.version ? `Version ${s.version}` : 'A new version'} is downloaded. Reload to finish; your progress is kept.`
      return `Version ${s.version} is downloaded. Restart to finish; your progress is kept.`
    case 'error':
      return `Update check failed: ${s.message ?? 'unknown error'}`
    case 'unsupported':
      return s.message ?? 'Updates are not available in this version.'
    default:
      return web
        ? 'New versions download by themselves while you are online. The app works offline.'
        : 'The app checks GitHub for new versions automatically.'
  }
}
