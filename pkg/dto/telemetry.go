// Package dto defines the unified telemetry data transfer objects shared across all
// game adapters, the VoCore renderer, the engineer hub, and the web sync client.
// All values use SI units unless stated otherwise: speed in m/s, temps in °C, pressures in kPa.
package dto

// TelemetryFrame is the canonical telemetry snapshot emitted once per game tick.
type TelemetryFrame struct {
	Timestamp   int64        `json:"timestamp"` // Unix nanoseconds
	Session     Session      `json:"session"`
	Car         CarState     `json:"car"`
	Tires       [4]TireState `json:"tires"` // indexed by TirePosition constants (FL=0, FR=1, RL=2, RR=3)
	Lap         LapState     `json:"lap"`
	Flags       Flags        `json:"flags"`
	Electronics Electronics  `json:"electronics"`
	Race        RaceState    `json:"race"`
	Energy      EnergyState  `json:"energy"`
	Penalties   Penalties    `json:"penalties"`
}

// Session holds metadata about the current game session.
type Session struct {
	Game        string      `json:"game"`
	Track       string      `json:"track"`
	Car         string      `json:"car"`
	SessionType SessionType `json:"sessionType"`
	SessionTime float64     `json:"sessionTime"` // seconds elapsed in the session
	BestLapTime float64     `json:"bestLapTime"` // session best in seconds; 0 if no lap completed yet
	MaxLaps     int32       `json:"maxLaps"`     // total laps for this session; 0 for time-based sessions
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
	SpeedMS       float32 `json:"speedMS"`       // speed in m/s
	Gear          int8    `json:"gear"`           // -1 = reverse, 0 = neutral, 1–8 = forward gears
	RPM           float32 `json:"rpm"`
	MaxRPM        float32 `json:"maxRPM"`
	Throttle      float32 `json:"throttle"`      // 0–1
	Brake         float32 `json:"brake"`         // 0–1
	Clutch        float32 `json:"clutch"`        // 0–1
	Steering      float32 `json:"steering"`      // -1 (full left) to 1 (full right)
	Fuel          float32 `json:"fuel"`          // litres remaining
	FuelPerLap    float32 `json:"fuelPerLap"`    // rolling average litres per lap
	PositionX     float32 `json:"positionX"`     // world coordinates in metres
	PositionY     float32 `json:"positionY"`
	PositionZ     float32 `json:"positionZ"`
	BrakeBiasRear float32 `json:"brakeBiasRear"` // rear brake bias fraction (0–1); 0 = front biased
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
	Position    TirePosition `json:"position"`
	TempInner   float32      `json:"tempInner"`   // °C
	TempMiddle  float32      `json:"tempMiddle"`  // °C
	TempOuter   float32      `json:"tempOuter"`   // °C
	TempSurface float32      `json:"tempSurface"` // °C
	TempCore    float32      `json:"tempCore"`    // °C
	PressureKPa float32      `json:"pressureKPa"`
	WearPercent float32      `json:"wearPercent"` // 0–100
	Compound    string       `json:"compound"`    // e.g. "Soft", "Medium", "Hard", "Wet"
}

// LapState holds lap timing and validity data for the current lap.
type LapState struct {
	CurrentLap     int     `json:"currentLap"`
	CurrentLapTime float64 `json:"currentLapTime"` // seconds since lap start
	LastLapTime    float64 `json:"lastLapTime"`    // seconds; 0 if no completed lap this session
	BestLapTime    float64 `json:"bestLapTime"`    // personal best seconds; 0 if none
	TargetLapTime  float64 `json:"targetLapTime"`  // seconds; set by driver or engineer; 0 means unset
	Sector         int     `json:"sector"`         // current sector (1-based)
	Sector1Time    float64 `json:"sector1Time"`    // last completed lap sector 1, seconds; 0 if unavailable
	Sector2Time    float64 `json:"sector2Time"`    // last completed lap sector 2, seconds
	IsInLap        bool    `json:"isInLap"`
	IsOutLap       bool    `json:"isOutLap"`
	IsValid        bool    `json:"isValid"`       // false on track limit or other infringement
	TrackPosition  float32 `json:"trackPosition"` // 0–1, fraction of lap distance completed
}

// Flags holds the current flag state on track.
type Flags struct {
	Yellow       bool `json:"yellow"`
	DoubleYellow bool `json:"doubleYellow"`
	Red          bool `json:"red"`
	SafetyCar    bool `json:"safetyCar"`
	VSC          bool `json:"vsc"` // virtual safety car
	Checkered    bool `json:"checkered"`
}

// Electronics holds the real-time state of driver aid systems.
type Electronics struct {
	TCActive   bool  `json:"tcActive"`   // TC currently intervening (cutting power)
	TC         uint8 `json:"tc"`         // TC setting; 0 = off
	TCMax      uint8 `json:"tcMax"`      // maximum TC setting available for this car
	ABSActive  bool  `json:"absActive"`  // ABS currently intervening
	ABS        uint8 `json:"abs"`        // ABS setting; 0 = off
	ABSMax     uint8 `json:"absMax"`     // maximum ABS setting available for this car
	TCCut      uint8 `json:"tcCut"`      // TC cut level (TC2); 0 = off
	TCCutMax   uint8 `json:"tcCutMax"`   // maximum TC cut level for this car
	TCSlip     uint8 `json:"tcSlip"`     // TC slip level (TC3); 0 = off
	TCSlipMax  uint8 `json:"tcSlipMax"`  // maximum TC slip level for this car
	MotorMap   uint8 `json:"motorMap"`   // engine/motor map setting
	MotorMapMax uint8 `json:"motorMapMax"` // maximum motor map setting for this car
	DRSActive  bool  `json:"drsActive"`  // DRS currently deployed
}

// RaceState holds real-time race position and gap information.
type RaceState struct {
	Position       uint8   `json:"position"`       // 1-based race position; 0 if unknown
	TotalPositions uint8   `json:"totalPositions"` // total cars in session; 0 if unknown
	GapAhead       float32 `json:"gapAhead"`       // seconds to car directly ahead; 0 if none/unknown
	GapBehind      float32 `json:"gapBehind"`      // seconds to car directly behind; 0 if none/unknown
}

// EnergyState holds hybrid/electric energy data.
type EnergyState struct {
	VirtualEnergy float32 `json:"virtualEnergy"` // kJ remaining
	SoC           float32 `json:"soc"`           // state of charge fraction (0–1)
	RegenPower    float32 `json:"regenPower"`    // current regen power in kW
	DeployPower   float32 `json:"deployPower"`   // current deploy power in kW
}

// Penalties holds penalty and incident tracking data.
type Penalties struct {
	Incidents       int16 `json:"incidents"`       // cumulative incident points
	TrackLimitSteps uint8 `json:"trackLimitSteps"` // track limit penalty accumulation steps
	PitStops        int16 `json:"pitStops"`        // completed pit stops this session
}

