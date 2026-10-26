import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

// The only surface the page gets from the shell: update controls, the chess.com game fetch and
// the Claude coach (the API key itself stays in the main process).
// Shape must match DesktopBridge in src/lib/desktop.ts.
contextBridge.exposeInMainWorld('mirrorGambit', {
  desktop: true,
  updates: {
    get: () => ipcRenderer.invoke('updates:get'),
    check: () => ipcRenderer.invoke('updates:check'),
    download: () => ipcRenderer.invoke('updates:download'),
    install: () => ipcRenderer.invoke('updates:install'),
    onStatus: (listener: (status: unknown) => void) => {
      const handler = (_e: IpcRendererEvent, status: unknown) => listener(status)
      ipcRenderer.on('updates:status', handler)
      return () => {
        ipcRenderer.removeListener('updates:status', handler)
      }
    },
  },
  chessCom: {
    fetchGame: (kind: string, id: string) => ipcRenderer.invoke('chesscom:fetch', kind, id),
  },
  games: {
    fetch: (source: string, username: string, max: number) => ipcRenderer.invoke('games:fetch', source, username, max),
  },
  coach: {
    status: () => ipcRenderer.invoke('coach:status'),
    setKey: (key: string) => ipcRenderer.invoke('coach:setKey', key),
    clearKey: () => ipcRenderer.invoke('coach:clearKey'),
    setModel: (model: string) => ipcRenderer.invoke('coach:setModel', model),
    ask: (request: unknown) => ipcRenderer.invoke('coach:ask', request),
  },
})
