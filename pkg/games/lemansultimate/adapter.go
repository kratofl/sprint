// Package lemansultimate implements the GameAdapter for Le Mans Ultimate.
//
// LMU does not broadcast telemetry over UDP. Instead it exposes all data via a
// Windows Named Shared Memory region called "LMU_Data" (Linux: /dev/shm/LMU_Data).
// No plugin is required on Windows — only "Enable Plugins" must be ON in the
// in-game Settings → Gameplay page.
//
// Data is polled at ~100 Hz. Read() blocks until the next poll tick fires or
// the adapter is disconnected. Every tick reads and decodes the current data —
package lemansultimate

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"math"
	"time"

	"github.com/kratofl/sprint/pkg/dto"
	"github.com/kratofl/sprint/pkg/shm"
)

const pollInterval = 10 * time.Millisecond

// toF32 safely converts a float64 to float32.
// Returns 0 for NaN, ±Inf, or any value that would overflow float32.
// Without this guard, garbage shared-memory bytes can produce float64 values
// that exceed MaxFloat32, which encoding/json refuses to marshal (+Inf).
func toF32(v float64) float32 {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return 0
	}
	f := float32(v)
	if math.IsInf(float64(f), 0) {
		return 0
	}
	return f
}

// toF64 sanitizes a float64, returning 0 for NaN or ±Inf.
// encoding/json refuses to marshal non-finite float64 values.
func toF64(v float64) float64 {
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return 0
	}
	return v
}

// Byte offsets within the LMUObjectOut buffer, computed once at init from
// binary.Size. encoding/binary.Size returns the packed (no-alignment-padding)
// size of a struct, which matches the C _pack_=4 layout.
var (
	genericBinSize  int
	scoInfoBinSize  int
	vehScoBinSize   int
	telemVehBinSize int

	// Offset of the scoring section (start of LMUScoringData).
	scoringStart int
	// Offset of the first LMUVehicleScoring entry (scoringStart + scoringInfo + 12).
	vehScoBase int
	// Offset of the LMUTelemetryData section.
	telemStart int
	// Offset of telemetry.playerVehicleIdx (telemStart + 1 byte for activeVehicles).
	playerIdxOffset int
	// Offset of telemetry.telemInfo[0] (telemStart + 3-byte header).
	telemInfoBase int

	// Total size of the mapped region.
	totalBufSize int
)

func init() {
	genericBinSize = binary.Size(lmuGeneric{})
	scoInfoBinSize = binary.Size(lmuScoringInfo{})
	vehScoBinSize = binary.Size(lmuVehicleScoring{})
	telemVehBinSize = binary.Size(lmuVehicleTelemetry{})

	const pathsBinSize = 5 * 260 // lmuPathData: 5 × [260]byte
	const scoringStreamSize = 65536

	// SharedMemoryScoringData (defined AFTER #pragma pack(pop) in
	// SharedMemoryInterface.hpp, so it uses DEFAULT alignment):
	//   ScoringInfoV01 scoringInfo;   // 548 bytes
	//   size_t scoringStreamSize;     // 8 bytes on x64, but aligned to 8 →
	//                                 //   4 bytes padding + 8 bytes = 12 opaque bytes
	//   VehicleScoringInfoV01 vehScoringInfo[104];
	//   char scoringStream[65536];
	const scoringStreamSizeHeader = 12 // 4-byte alignment padding + 8-byte size_t

	scoringStart = genericBinSize + pathsBinSize
	vehScoBase = scoringStart + scoInfoBinSize + scoringStreamSizeHeader
	telemStart = vehScoBase + lmuMaxVehicles*vehScoBinSize + scoringStreamSize

	// SharedMemoryTelemtryData (also DEFAULT alignment):
	//   uint8_t activeVehicles;        // offset 0
	//   uint8_t playerVehicleIdx;      // offset 1
	//   bool    playerHasVehicle;      // offset 2
	//   /* 1 byte padding */           // offset 3  ← aligns TelemInfoV01 to 4
	//   TelemInfoV01 telemInfo[104];   // offset 4
	const telemHeaderSize = 4 // 3 header bytes + 1 padding byte for alignment

	playerIdxOffset = telemStart + 1 // skip activeVehicles (1 byte)
	telemInfoBase = telemStart + telemHeaderSize
	totalBufSize = telemInfoBase + lmuMaxVehicles*telemVehBinSize
}

// Adapter implements games.GameAdapter for Le Mans Ultimate via shared memory.
type Adapter struct {
	shm  *shm.Reader
	buf  []byte        // pre-allocated copy of the shared memory region
	done chan struct{} // closed by Disconnect to unblock Read

	// Rolling FuelPerLap state.
	prevFuelValid bool
	prevLap       int32
	prevFuel      float64
	fuelSamples   []float64 // up to 5 most recent completed-lap fuel consumptions
}

// New creates a new LeMansUltimate adapter. Call Connect before reading.
func New() *Adapter {
	return &Adapter{
		shm:  shm.New(lmuShmName, totalBufSize),
		buf:  make([]byte, totalBufSize),
		done: make(chan struct{}),
	}
}

// Name satisfies games.GameAdapter.
func (a *Adapter) Name() string { return "LeMansUltimate" }

// Connect maps the LMU shared memory region. Returns an error if LMU is not running.
func (a *Adapter) Connect() error {
	if a.shm.IsOpen() {
		return nil
	}
	// Recreate the done channel so Read() works after a prior Disconnect.
	select {
	case <-a.done:
		a.done = make(chan struct{})
	default:
	}
	return a.shm.Open()
}

// Disconnect unmaps the shared memory and unblocks any pending Read call.
func (a *Adapter) Disconnect() error {
	select {
	case <-a.done:
		// already closed
	default:
		close(a.done)
	}
	return a.shm.Close()
}

// ErrDisconnected is returned by Read when Disconnect is called while polling.
var ErrDisconnected = errors.New("lemansultimate: adapter disconnected")

// Read polls the shared memory until a new telemetry frame is available, then
// decodes and returns it. Blocks until data arrives or Disconnect is called.
func (a *Adapter) Read() (*dto.TelemetryFrame, error) {
	if !a.shm.IsOpen() {
		return nil, fmt.Errorf("lemansultimate: not connected — call Connect first")
	}
	for {
		select {
		case <-a.done:
			return nil, ErrDisconnected
		case <-time.After(pollInterval):
		}

		a.shm.CopyBuffer(a.buf)

		// Fetch the player vehicle index.
		if len(a.buf) <= playerIdxOffset {
			continue
		}
		playerIdx := int(a.buf[playerIdxOffset])
		playerHasVehicle := a.buf[telemStart+2] != 0

		// Always decode the scoring info (track, session type, flags) — available
		// even when the player is in the garage or the pre-session menu.
		if scoringStart+scoInfoBinSize > len(a.buf) {
			continue
		}
		var scoInfo lmuScoringInfo
		if err := binary.Read(bytes.NewReader(a.buf[scoringStart:]), binary.LittleEndian, &scoInfo); err != nil {
			return nil, fmt.Errorf("lemansultimate: decode scoring info: %w", err)
		}

		if !playerHasVehicle {
			// Emit a minimal frame with only session-level data so the frontend
			// shows the connected state and track/session info even from the garage.
			return a.sessionOnlyFrame(&scoInfo), nil
		}

		// Decode player telemetry.
		telemOff := telemInfoBase + playerIdx*telemVehBinSize
		if telemOff+telemVehBinSize > len(a.buf) {
			continue
		}
		var telem lmuVehicleTelemetry
		if err := binary.Read(bytes.NewReader(a.buf[telemOff:]), binary.LittleEndian, &telem); err != nil {
			return nil, fmt.Errorf("lemansultimate: decode telemetry: %w", err)
		}

		// Decode player scoring.
		scoOff := vehScoBase + playerIdx*vehScoBinSize
		if scoOff+vehScoBinSize > len(a.buf) {
			continue
		}
		var scoring lmuVehicleScoring
		if err := binary.Read(bytes.NewReader(a.buf[scoOff:]), binary.LittleEndian, &scoring); err != nil {
			return nil, fmt.Errorf("lemansultimate: decode scoring: %w", err)
		}

		a.updateFuelTracking(&telem)
		return a.mapToDTO(&telem, &scoring, &scoInfo), nil
	}
}

// updateFuelTracking maintains the rolling FuelPerLap average across completed laps.
func (a *Adapter) updateFuelTracking(t *lmuVehicleTelemetry) {
	if !a.prevFuelValid {
		a.prevFuel = t.MFuel
		a.prevLap = t.MLapNumber
		a.prevFuelValid = true
		return
	}
	if t.MLapNumber > a.prevLap {
		used := a.prevFuel - t.MFuel
		if used > 0 {
			if len(a.fuelSamples) >= 5 {
				a.fuelSamples = a.fuelSamples[1:]
			}
			a.fuelSamples = append(a.fuelSamples, used)
		}
		a.prevFuel = t.MFuel
		a.prevLap = t.MLapNumber
	}
}

// fuelPerLap returns the rolling average fuel consumption, or 0 if unknown.
func (a *Adapter) fuelPerLap() float32 {
	if len(a.fuelSamples) == 0 {
		return 0
	}
	var sum float64
	for _, s := range a.fuelSamples {
		sum += s
	}
	return float32(sum / float64(len(a.fuelSamples)))
}

// mapToDTO converts decoded LMU structs into a unified TelemetryFrame.
func (a *Adapter) mapToDTO(t *lmuVehicleTelemetry, s *lmuVehicleScoring, si *lmuScoringInfo) *dto.TelemetryFrame {
	// Speed: magnitude of local velocity vector.
	vx, vy, vz := t.MLocalVel.X, t.MLocalVel.Y, t.MLocalVel.Z
	speedMS := toF32(math.Sqrt(vx*vx + vy*vy + vz*vz))

	// Sector (1-based): clear the sign bit (pitlane flag) and add 1.
	sector := int(t.MCurrentSector&0x7FFFFFFF) + 1

	// Track position: fraction of lap distance completed (0–1).
	var trackPos float32
	if si.MLapDist > 0 {
		trackPos = toF32(s.MLapDist / si.MLapDist)
		if trackPos < 0 {
			trackPos = 0
		} else if trackPos > 1 {
			trackPos = 1
		}
	}

	// Tire compound names.
	frontCompound := nullString(t.MFrontTireCompoundName[:])
	rearCompound := nullString(t.MRearTireCompoundName[:])

	// Flags.
	anyLocalYellow := si.MSectorFlag[0] != 0 || si.MSectorFlag[1] != 0 || si.MSectorFlag[2] != 0
	yellow := anyLocalYellow || s.MUnderYellow
	safetyCar := si.MGamePhase == 6 // 6 = full course yellow / safety car

	return &dto.TelemetryFrame{
		Timestamp: time.Now().UnixNano(),
		Session: dto.Session{
			Game:        "LeMansUltimate",
			Track:       nullString(si.MTrackName[:]),
			Car:         nullString(t.MVehicleName[:]),
			SessionType: mapSessionType(si.MSession),
			SessionTime: toF64(si.MCurrentET),
			BestLapTime: toF64(s.MBestLapTime),
		},
		Car: dto.CarState{
			SpeedMS:    speedMS,
			Gear:       int8(t.MGear),
			RPM:        toF32(t.MEngineRPM),
			MaxRPM:     toF32(t.MEngineMaxRPM),
			Throttle:   toF32(t.MFilteredThrottle),
			Brake:      toF32(t.MFilteredBrake),
			Clutch:     toF32(t.MFilteredClutch),
			Steering:   toF32(t.MFilteredSteering),
			Fuel:       toF32(t.MFuel),
			FuelPerLap: a.fuelPerLap(),
			PositionX:  toF32(t.MPos.X),
			PositionY:  toF32(t.MPos.Y),
			PositionZ:  toF32(t.MPos.Z),
		},
		Tires: [4]dto.TireState{
			mapTire(dto.FrontLeft, &t.MWheels[0], frontCompound),
			mapTire(dto.FrontRight, &t.MWheels[1], frontCompound),
			mapTire(dto.RearLeft, &t.MWheels[2], rearCompound),
			mapTire(dto.RearRight, &t.MWheels[3], rearCompound),
		},
		Lap: dto.LapState{
			CurrentLap:     int(t.MLapNumber),
			CurrentLapTime: toF64(t.MElapsedTime - t.MLapStartET),
			LastLapTime:    toF64(s.MLastLapTime),
			BestLapTime:    toF64(s.MBestLapTime),
			Sector:         sector,
			Sector1Time:    toF64(s.MLastSector1),
			Sector2Time:    toF64(s.MLastSector2 - s.MLastSector1),
			IsInLap:        s.MInPits,
			IsOutLap:       s.MPitState == 4,
			IsValid:        s.MCountLapFlag == 2,
			TrackPosition:  trackPos,
		},
		Flags: dto.Flags{
			Yellow:    yellow,
			SafetyCar: safetyCar,
			Red:       si.MGamePhase == 7, // 7 = session stopped
			Checkered: s.MFinishStatus == 1,
			// DoubleYellow and VSC: no reliable LMU signal; left false for now.
		},
		Electronics: dto.Electronics{
			TCActive:  t.MTCActive,
			TC:        t.MTC,
			TCMax:     t.MTCMax,
			ABSActive: t.MABSActive,
			ABS:       t.MABS,
			ABSMax:    t.MABSMax,
		},
	}
}

// mapTire converts one LMU wheel struct into a TireState DTO.
// LMU reports temperatures in Kelvin; we subtract 273.15 to get Celsius.
func mapTire(pos dto.TirePosition, w *lmuWheel, compound string) dto.TireState {
	const kelvinOffset = 273.15
	return dto.TireState{
		Position:    pos,
		TempInner:   toF32(w.MTemperature[0] - kelvinOffset),
		TempMiddle:  toF32(w.MTemperature[1] - kelvinOffset),
		TempOuter:   toF32(w.MTemperature[2] - kelvinOffset),
		TempSurface: 0,
		TempCore:    toF32(w.MTireCarcassTemperature - kelvinOffset),
		PressureKPa: toF32(w.MPressure),
		WearPercent: toF32(w.MWear * 100),
		Compound:    compound,
	}
}

// mapSessionType converts the LMU session integer to a DTO SessionType.
// 0=testday, 1-4=practice, 5-8=qualifying, 9=warmup, 10-13=race.
func mapSessionType(s int32) dto.SessionType {
	switch {
	case s == 0:
		return dto.SessionPractice // testday treated as practice
	case s >= 1 && s <= 4:
		return dto.SessionPractice
	case s >= 5 && s <= 8:
		return dto.SessionQualify
	case s == 9:
		return dto.SessionWarmup
	case s >= 10 && s <= 13:
		return dto.SessionRace
	default:
		return dto.SessionUnknown
	}
}

// sessionOnlyFrame returns a TelemetryFrame populated only with session-level
// data. Used when the player is not yet in the car (garage, pre-session menu).
func (a *Adapter) sessionOnlyFrame(si *lmuScoringInfo) *dto.TelemetryFrame {
	return &dto.TelemetryFrame{
		Timestamp: time.Now().UnixNano(),
		Session: dto.Session{
			Game:        "LeMansUltimate",
			Track:       nullString(si.MTrackName[:]),
			SessionType: mapSessionType(si.MSession),
			SessionTime: toF64(si.MCurrentET),
		},
	}
}
