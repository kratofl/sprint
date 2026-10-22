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
  exportLap: (sessionId: string, lapNumber: number): Promise<unknown> => ipcRenderer.invoke('sprint:lap-export', sessionId, lapNumber),
  importLap: (): Promise<unknown> => ipcRenderer.invoke('sprint:lap-import'),
  diagnosticsLogs: (minLevel: string, text: string): Promise<unknown> => ipcRenderer.invoke('sprint:diagnostics-logs', minLevel, text),
  planContext: (): Promise<unknown> => ipcRenderer.invoke('sprint:plan-context'),
  resultsImportScan: (includeDeclined: boolean): Promise<unknown> => ipcRenderer.invoke('sprint:results-import-scan', includeDeclined),
  resultsImport: (ids: readonly string[]): Promise<unknown> => ipcRenderer.invoke('sprint:results-import', ids),
  resultsImportDecline: (ids: readonly string[]): Promise<unknown> => ipcRenderer.invoke('sprint:results-import-decline', ids),
  checkUpdates: (force: boolean): Promise<unknown> => ipcRenderer.invoke('sprint:updates-check', force),
  installUpdate: (): Promise<unknown> => ipcRenderer.invoke('sprint:updates-install'),
  signIn: (serverUrl: string, email: string, password: string, createAccount: boolean): Promise<unknown> =>
    ipcRenderer.invoke('sprint:account-sign-in', serverUrl, email, password, createAccount),
  signInWithDiscord: (serverUrl: string): Promise<unknown> => ipcRenderer.invoke('sprint:account-discord', serverUrl),
  cancelDiscordSignIn: (): Promise<unknown> => ipcRenderer.invoke('sprint:account-discord-cancel'),
  serverInfo: (serverUrl: string): Promise<unknown> => ipcRenderer.invoke('sprint:cloud-server-info', serverUrl),
  signOut: (): Promise<unknown> => ipcRenderer.invoke('sprint:account-sign-out'),
  discoverServers: (): Promise<unknown> => ipcRenderer.invoke('sprint:cloud-discover'),
  syncUp: (): Promise<unknown> => ipcRenderer.invoke('sprint:cloud-push'),
  syncDown: (): Promise<unknown> => ipcRenderer.invoke('sprint:cloud-pull'),
  /** Pushed by the main process to the guide overlay window only. */
  subscribeGuide: (listener: (message: unknown) => void): (() => void) => {
    const onMessage = (_event: Electron.IpcRendererEvent, message: unknown): void => listener(message)
    ipcRenderer.on('sprint:guide', onMessage)
    return () => {
      ipcRenderer.removeListener('sprint:guide', onMessage)
    }
  },
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
