import { contextBridge, ipcRenderer } from 'electron'

/**
 * The entire renderer-facing surface. Sandboxed, context-isolated renderers
 * only ever see these methods on `window.sprint` — no ipcRenderer, no
 * Node globals, and no path to the bearer token guarding the native host.
 */
contextBridge.exposeInMainWorld('sprint', {
  getState: (): Promise<unknown> => ipcRenderer.invoke('sprint:get-state'),
  sendCommand: (command: unknown): Promise<unknown> => ipcRenderer.invoke('sprint:send-command', command),
  analysisTrace: (sessionId: string, lapNumber: number): Promise<unknown> => ipcRenderer.invoke('sprint:analysis-trace', sessionId, lapNumber),
  diagnosticsLogs: (minLevel: string, text: string): Promise<unknown> => ipcRenderer.invoke('sprint:diagnostics-logs', minLevel, text),
  planContext: (): Promise<unknown> => ipcRenderer.invoke('sprint:plan-context'),
  resultsImportScan: (includeDeclined: boolean): Promise<unknown> => ipcRenderer.invoke('sprint:results-import-scan', includeDeclined),
  resultsImport: (ids: readonly string[]): Promise<unknown> => ipcRenderer.invoke('sprint:results-import', ids),
  resultsImportDecline: (ids: readonly string[]): Promise<unknown> => ipcRenderer.invoke('sprint:results-import-decline', ids),
  checkUpdates: (force: boolean): Promise<unknown> => ipcRenderer.invoke('sprint:updates-check', force),
  installUpdate: (): Promise<unknown> => ipcRenderer.invoke('sprint:updates-install'),
  subscribe: (listener: (state: unknown) => void): (() => void) => {
    const onState = (_event: Electron.IpcRendererEvent, state: unknown): void => listener(state)
    ipcRenderer.on('sprint:state', onState)
    ipcRenderer.send('sprint:subscribe')
    return () => {
      ipcRenderer.removeListener('sprint:state', onState)
      ipcRenderer.send('sprint:unsubscribe')
    }
  },
})
