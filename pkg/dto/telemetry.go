// Package dto defines the unified telemetry data transfer objects shared across all
// game adapters, the VoCore renderer, the engineer hub, and the web sync client.
// All values use SI units unless stated otherwise: speed in m/s, temps in °C, pressures in kPa.
package dto

// TelemetryFrame is the canonical telemetry snapshot emitted once per game tick.
type TelemetryFrame struct {
	Timestamp int64      // Unix nanoseconds
	Session   Session
	Car       CarState
	Tires     [4]TireState // indexed by TirePosition constants (FL=0, FR=1, RL=2, RR=3)
	Lap       LapState
	Flags     Flags
}

// Session holds metadata about the current game session.
type Session struct {
	Game        string
	Track       string
	Car         string
	SessionType SessionType
	SessionTime float64 // seconds elapsed in the session
	BestLapTime float64 // session best in seconds; 0 if no lap completed yet
}

// SessionType classifies the current session.
type SessionType string

const (
	SessionPractice SessionType = "practice"
	SessionQualify  SessionType = "qualify"
	SessionRace     SessionType = "race"
	SessionWarmup   SessionType = "warmup"
	SessionUnknown  SessionType = "unknown"
)

// CarState holds the real-time state of the player's car.
type CarState struct {
	SpeedMS    float32 // speed in m/s
	Gear       int8    // -1 = reverse, 0 = neutral, 1–8 = forward gears
	RPM        float32
	MaxRPM     float32
	Throttle   float32 // 0–1
	Brake      float32 // 0–1
	Clutch     float32 // 0–1
	Steering   float32 // -1 (full left) to 1 (full right)
	Fuel       float32 // litres remaining
	FuelPerLap float32 // rolling average litres per lap
	PositionX  float32 // world coordinates in metres
	PositionY  float32
	PositionZ  float32
}

// TirePosition indexes into the [4]TireState array.
type TirePosition int

const (
	FrontLeft  TirePosition = 0
	FrontRight TirePosition = 1
	RearLeft   TirePosition = 2
	RearRight  TirePosition = 3
)

// TireState holds per-corner tyre data.
type TireState struct {
	Position    TirePosition
	TempInner   float32 // °C
	TempMiddle  float32 // °C
	TempOuter   float32 // °C
	TempSurface float32 // °C
	TempCore    float32 // °C
	PressureKPa float32
	WearPercent float32 // 0–100
	Compound    string  // e.g. "Soft", "Medium", "Hard", "Wet"
}

// LapState holds lap timing and validity data for the current lap.
type LapState struct {
	CurrentLap    int
	CurrentLapTime float64 // seconds since lap start
	LastLapTime   float64 // seconds; 0 if no completed lap this session
	BestLapTime   float64 // personal best seconds; 0 if none
	TargetLapTime float64 // seconds; set by driver or engineer; 0 means unset
	Sector        int     // current sector (1-based)
	Sector1Time   float64 // last completed lap sector 1, seconds; 0 if unavailable
	Sector2Time   float64 // last completed lap sector 2, seconds
	IsInLap       bool
	IsOutLap      bool
	IsValid       bool    // false on track limit or other infringement
	TrackPosition float32 // 0–1, fraction of lap distance completed
}

// Flags holds the current flag state on track.
type Flags struct {
	Yellow       bool
	DoubleYellow bool
	Red          bool
	SafetyCar    bool
	VSC          bool // virtual safety car
	Checkered    bool
}
