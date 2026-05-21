export type AppView =
  | 'home'
  | 'telemetry'
  | 'dash'
  | 'devices'
  | 'controls'
  | 'settings'
  | 'help'

export interface ViewHistory {
  stack: AppView[]
  index: number
  current: AppView
  canGoBack: boolean
  canGoForward: boolean
}

function toHistory(stack: AppView[], index: number): ViewHistory {
  return {
    stack,
    index,
    current: stack[index],
    canGoBack: index > 0,
    canGoForward: index < stack.length - 1,
  }
}

export function createViewHistory(initialView: AppView): ViewHistory {
  return toHistory([initialView], 0)
}

export function navigateToView(history: ViewHistory, nextView: AppView): ViewHistory {
  if (history.current === nextView) {
    return history
  }

  const truncatedStack = history.stack.slice(0, history.index + 1)
  truncatedStack.push(nextView)
  return toHistory(truncatedStack, truncatedStack.length - 1)
}

export function goBack(history: ViewHistory): ViewHistory {
  if (!history.canGoBack) {
    return history
  }

  return toHistory(history.stack, history.index - 1)
}

export function goForward(history: ViewHistory): ViewHistory {
  if (!history.canGoForward) {
    return history
  }

  return toHistory(history.stack, history.index + 1)
}
