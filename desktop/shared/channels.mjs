/**
 * Fixed IPC surface. Channel names never come from renderer input.
 */
export const IPC = Object.freeze({
  systemInfo: 'klar:system:info',
  runtimeStatus: 'klar:runtime:status',
  runtimeStart: 'klar:runtime:start',
  runtimeStop: 'klar:runtime:stop',
  aiGenerate: 'klar:ai:generate',
  aiCancel: 'klar:ai:cancel',
  diagnosticsReport: 'klar:diagnostics:report',
})

export const IPC_CHANNELS = Object.freeze(Object.values(IPC))
