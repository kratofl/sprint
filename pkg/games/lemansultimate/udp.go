package lemansultimate

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"net"
)

// rawPacket holds the decoded fields from a single LeMansUltimate UDP broadcast.
// Field names and byte layout are based on the rFactor 2 / LMU UDP telemetry spec.
// TODO: verify exact byte offsets against the official LMU UDP documentation.
type rawPacket struct {
	// Session
	TrackName   string
	CarName     string
	SessionType uint8
	SessionTime float32
	BestLapTime float32

	// Car
	Speed      float32
	Gear       int32
	RPM        float32
	MaxRPM     float32
	Throttle   float32
	Brake      float32
	Clutch     float32
	Steering   float32
	Fuel       float32
	FuelPerLap float32
	PosX       float32
	PosY       float32
	PosZ       float32

	// Tires (FL, FR, RL, RR)
	Tires [4]rawTire

	// Lap
	CurrentLap     int32
	CurrentLapTime float32
	LastLapTime    float32
	PersonalBest   float32
	Sector         int32
	Sector1Time    float32
	Sector2Time    float32
	IsInLap        bool
	IsOutLap       bool
	IsValid        bool
	TrackPosition  float32

	// Flags
	YellowFlag       bool
	DoubleYellowFlag bool
	RedFlag          bool
	SafetyCar        bool
	VSC              bool
	Checkered        bool
}

// rawTire holds raw tyre data for a single corner.
type rawTire struct {
	TempInner   float32
	TempMiddle  float32
	TempOuter   float32
	TempSurface float32
	TempCore    float32
	Pressure    float32
	Wear        float32
	Compound    string
}

// udpReader wraps a UDP connection and reads raw LMU packets.
type udpReader struct {
	conn *net.UDPConn
	buf  []byte
}

func newUDPReader(conn *net.UDPConn) *udpReader {
	return &udpReader{
		conn: conn,
		buf:  make([]byte, 4096),
	}
}

// readPacket reads one UDP datagram and decodes it into a rawPacket.
func (r *udpReader) readPacket() (*rawPacket, error) {
	n, _, err := r.conn.ReadFromUDP(r.buf)
	if err != nil {
		return nil, err
	}
	return decode(r.buf[:n])
}

// decode parses the binary payload of a LMU UDP packet.
// TODO: replace this stub with the verified LMU UDP packet layout once
// the official documentation has been reviewed.
func decode(data []byte) (*rawPacket, error) {
	if len(data) < 4 {
		return nil, fmt.Errorf("packet too short: %d bytes", len(data))
	}

	rd := bytes.NewReader(data)
	p := &rawPacket{}

	// Read a simple header word to detect packet type (placeholder).
	var packetType uint32
	if err := binary.Read(rd, binary.LittleEndian, &packetType); err != nil {
		return nil, fmt.Errorf("decode header: %w", err)
	}

	// TODO: implement full packet decoding per the LMU UDP spec.
	// Each field below corresponds to a known offset in the LMU broadcast packet.
	_ = p
	return p, nil
}

// readString reads a null-terminated string of length n from the reader.
func readString(rd *bytes.Reader, n int) string {
	buf := make([]byte, n)
	_, _ = rd.Read(buf)
	end := bytes.IndexByte(buf, 0)
	if end == -1 {
		end = n
	}
	return string(buf[:end])
}
