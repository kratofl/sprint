package dto

// CommandType identifies a command sent from an engineer to the driver's local app.
type CommandType string

const (
	CmdSetTargetLap CommandType = "set_target_lap"
	CmdSendNote     CommandType = "send_note"
	CmdRequestSync  CommandType = "request_sync"
)

// EngineerCommand is a message pushed from an engineer client to the driver's Wails app.
// The Payload field is decoded according to Type.
type EngineerCommand struct {
	ID        string      `json:"id"`        // UUID, set by sender
	Type      CommandType `json:"type"`
	Payload   any         `json:"payload"`   // SetTargetLapPayload | NotePayload
	Timestamp int64       `json:"timestamp"` // Unix milliseconds
	From      string      `json:"from"`      // engineer display name or client ID
}

// SetTargetLapPayload is the payload for CmdSetTargetLap.
// LapTime == 0 clears the target.
type SetTargetLapPayload struct {
	LapTime float64 `json:"lapTime"` // seconds
	LapNum  int     `json:"lapNum"`  // informational: source lap number
}

// NotePayload is the payload for CmdSendNote.
type NotePayload struct {
	Text string `json:"text"`
}

// EventType identifies a telemetry event pushed from the driver's app to engineers.
type EventType string

const (
	EvtTelemetryFrame EventType = "telemetry_frame"
	EvtTargetChanged  EventType = "target_changed"
	EvtLapCompleted   EventType = "lap_completed"
	EvtSessionChanged EventType = "session_changed"
)

// EngineerEvent is a message pushed from the driver's local app to all connected engineers.
type EngineerEvent struct {
	Type      EventType `json:"type"`
	Payload   any       `json:"payload"`   // TelemetryFrame | SetTargetLapPayload | LapState | Session
	Timestamp int64     `json:"timestamp"` // Unix milliseconds
}
