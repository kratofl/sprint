// Mirrors pkg/dto/engineer.go — keep in sync with the Go source of truth.

export type CommandType = 'set_target_lap' | 'send_note' | 'request_sync'

export interface SetTargetLapPayload {
  lapTime: number
  lapNum: number
}

export interface NotePayload {
  text: string
}

export interface EngineerCommand {
  id: string
  type: CommandType
  payload: SetTargetLapPayload | NotePayload
  timestamp: number
  from: string
}

export type EventType =
  | 'telemetry_frame'
  | 'target_changed'
  | 'lap_completed'
  | 'session_changed'

export interface EngineerEvent {
  type: EventType
  payload: unknown
  timestamp: number
}
