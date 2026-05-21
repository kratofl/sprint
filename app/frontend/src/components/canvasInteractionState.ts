export interface CanvasInteractionState {
  suppressNextClick: boolean
}

export interface CanvasClickConsumption {
  nextState: CanvasInteractionState
  shouldSuppressClick: boolean
}

export function createCanvasInteractionState(): CanvasInteractionState {
  return { suppressNextClick: false }
}

export function suppressNextCanvasClick(state: CanvasInteractionState): CanvasInteractionState {
  if (state.suppressNextClick) return state
  return { suppressNextClick: true }
}

export function consumeCanvasClick(state: CanvasInteractionState): CanvasClickConsumption {
  if (!state.suppressNextClick) {
    return {
      nextState: state,
      shouldSuppressClick: false,
    }
  }

  return {
    nextState: createCanvasInteractionState(),
    shouldSuppressClick: true,
  }
}
