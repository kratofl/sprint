// Package lemansultimate implements the GameAdapter for Le Mans Ultimate.
// Le Mans Ultimate is built on the rFactor 2 engine and broadcasts telemetry
// via a UDP socket. The default port is 20777.
package lemansultimate

import (
	"fmt"
	"net"
	"time"

	"github.com/kratofl/sprint/pkg/dto"
)

const (
	DefaultPort    = 20777
	DefaultAddress = "0.0.0.0"
	readTimeout    = 500 * time.Millisecond
)

// Adapter implements games.GameAdapter for Le Mans Ultimate.
type Adapter struct {
	addr   string
	conn   *net.UDPConn
	reader *udpReader
}

// New creates a new LeMansUltimate adapter listening on the given host:port.
// Pass an empty address to use DefaultAddress:DefaultPort.
func New(address string, port int) *Adapter {
	if address == "" {
		address = DefaultAddress
	}
	if port == 0 {
		port = DefaultPort
	}
	return &Adapter{
		addr: fmt.Sprintf("%s:%d", address, port),
	}
}

// Name satisfies games.GameAdapter.
func (a *Adapter) Name() string { return "LeMansUltimate" }

// Connect opens the UDP socket and prepares the reader.
func (a *Adapter) Connect() error {
	if a.conn != nil {
		return nil // already connected
	}
	udpAddr, err := net.ResolveUDPAddr("udp4", a.addr)
	if err != nil {
		return fmt.Errorf("lemansultimate: resolve addr %s: %w", a.addr, err)
	}
	conn, err := net.ListenUDP("udp4", udpAddr)
	if err != nil {
		return fmt.Errorf("lemansultimate: listen %s: %w", a.addr, err)
	}
	a.conn = conn
	a.reader = newUDPReader(conn)
	return nil
}

// Disconnect closes the UDP socket.
func (a *Adapter) Disconnect() error {
	if a.conn == nil {
		return nil
	}
	err := a.conn.Close()
	a.conn = nil
	a.reader = nil
	return err
}

// Read blocks until a telemetry packet arrives and returns the mapped DTO frame.
func (a *Adapter) Read() (*dto.TelemetryFrame, error) {
	if a.conn == nil {
		return nil, fmt.Errorf("lemansultimate: not connected — call Connect first")
	}
	_ = a.conn.SetReadDeadline(time.Now().Add(readTimeout))
	raw, err := a.reader.readPacket()
	if err != nil {
		return nil, fmt.Errorf("lemansultimate: read packet: %w", err)
	}
	return mapToDTO(raw), nil
}

// mapToDTO converts a raw rFactor2-style UDP packet to the unified TelemetryFrame.
func mapToDTO(p *rawPacket) *dto.TelemetryFrame {
	return &dto.TelemetryFrame{
		Timestamp: time.Now().UnixNano(),
		Session: dto.Session{
			Game:        "LeMansUltimate",
			Track:       p.TrackName,
			Car:         p.CarName,
			SessionType: mapSessionType(p.SessionType),
			SessionTime: float64(p.SessionTime),
			BestLapTime: float64(p.BestLapTime),
		},
		Car: dto.CarState{
			SpeedMS:    p.Speed,
			Gear:       int8(p.Gear),
			RPM:        p.RPM,
			MaxRPM:     p.MaxRPM,
			Throttle:   p.Throttle,
			Brake:      p.Brake,
			Clutch:     p.Clutch,
			Steering:   p.Steering,
			Fuel:       p.Fuel,
			FuelPerLap: p.FuelPerLap,
			PositionX:  p.PosX,
			PositionY:  p.PosY,
			PositionZ:  p.PosZ,
		},
		Tires: [4]dto.TireState{
			mapTire(dto.FrontLeft, p.Tires[0]),
			mapTire(dto.FrontRight, p.Tires[1]),
			mapTire(dto.RearLeft, p.Tires[2]),
			mapTire(dto.RearRight, p.Tires[3]),
		},
		Lap: dto.LapState{
			CurrentLap:     int(p.CurrentLap),
			CurrentLapTime: float64(p.CurrentLapTime),
			LastLapTime:    float64(p.LastLapTime),
			BestLapTime:    float64(p.PersonalBest),
			Sector:         int(p.Sector),
			Sector1Time:    float64(p.Sector1Time),
			Sector2Time:    float64(p.Sector2Time),
			IsInLap:        p.IsInLap,
			IsOutLap:       p.IsOutLap,
			IsValid:        p.IsValid,
			TrackPosition:  p.TrackPosition,
		},
		Flags: dto.Flags{
			Yellow:       p.YellowFlag,
			DoubleYellow: p.DoubleYellowFlag,
			Red:          p.RedFlag,
			SafetyCar:    p.SafetyCar,
			VSC:          p.VSC,
			Checkered:    p.Checkered,
		},
	}
}

func mapTire(pos dto.TirePosition, raw rawTire) dto.TireState {
	return dto.TireState{
		Position:    pos,
		TempInner:   raw.TempInner,
		TempMiddle:  raw.TempMiddle,
		TempOuter:   raw.TempOuter,
		TempSurface: raw.TempSurface,
		TempCore:    raw.TempCore,
		PressureKPa: raw.Pressure,
		WearPercent: raw.Wear,
		Compound:    raw.Compound,
	}
}

func mapSessionType(t uint8) dto.SessionType {
	switch t {
	case 1:
		return dto.SessionPractice
	case 2:
		return dto.SessionQualify
	case 3:
		return dto.SessionRace
	case 4:
		return dto.SessionWarmup
	default:
		return dto.SessionUnknown
	}
}
