import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'

// The only surface the page gets from the shell: update controls and the chess.com game fetch.
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
})
