import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/jetbrains-mono/400.css'
import '@fontsource/sora/500.css'
import '@fontsource/sora/600.css'
import App from './App'
import { SettingsProvider } from './hooks/useSettings'
import { registerWebApp } from './lib/pwa'
import { hydrate } from './lib/store/kv'
import './styles.css'

// Load saved data (and move 1.x data into IndexedDB on the first run) before the first render,
// so every hook can read its state synchronously.
hydrate()
  .catch((e) => console.warn('Storage could not be loaded', e))
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <SettingsProvider>
          <App />
        </SettingsProvider>
      </StrictMode>,
    )
    void registerWebApp()
  })
