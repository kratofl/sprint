export interface DeviceBindingListenState {
  listeningCommandId: string | null
}

export interface DeviceBindingAssignment {
  commandId: string
  button: number
}

export function buttonNumberFromKeyboardKey(key: string): number | null {
  if (/^[1-9]$/.test(key)) return Number(key)
  if (key === '0') return 10
  return null
}

export function startDeviceBindingListen(
  state: DeviceBindingListenState,
  commandId: string,
): DeviceBindingListenState {
  if (state.listeningCommandId === commandId) {
    return { listeningCommandId: null }
  }
  return { listeningCommandId: commandId }
}

export function cancelDeviceBindingListen(
  _state: DeviceBindingListenState,
): DeviceBindingListenState {
  return { listeningCommandId: null }
}

export function reduceDeviceBindingKey(
  state: DeviceBindingListenState,
  key: string,
): { state: DeviceBindingListenState; assignment: DeviceBindingAssignment | null } {
  if (!state.listeningCommandId) {
    return { state, assignment: null }
  }

  if (key === 'Escape') {
    return {
      state: cancelDeviceBindingListen(state),
      assignment: null,
    }
  }

  const button = buttonNumberFromKeyboardKey(key)
  if (button === null) {
    return { state, assignment: null }
  }

  return {
    state: { listeningCommandId: null },
    assignment: {
      commandId: state.listeningCommandId,
      button,
    },
  }
}
