package vocore

import (
	"encoding/binary"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"go.bug.st/serial"
	"go.bug.st/serial/enumerator"
)

// screenBaud is the baud rate for the VoCore screen serial connection.
// For USB CDC-ACM the actual transfer speed is determined by the USB bus;
// this value signals intent to the OS driver.
const screenBaud = 2_000_000

// findScreenPort scans serial ports for one matching the given USB VID/PID.
// Returns the system port path (e.g. "/dev/ttyACM0", "COM3").
func findScreenPort(vid, pid uint16) (string, error) {
	ports, err := enumerator.GetDetailedPortsList()
	if err != nil {
		return "", fmt.Errorf("enumerate ports: %w", err)
	}
	vidHex := fmt.Sprintf("%04X", vid)
	pidHex := fmt.Sprintf("%04X", pid)
	for _, p := range ports {
		if p.IsUSB && strings.EqualFold(p.VID, vidHex) && strings.EqualFold(p.PID, pidHex) {
			return p.Name, nil
		}
	}
	return "", fmt.Errorf("no serial port for VID=%04X PID=%04X", vid, pid)
}

// screenConn manages a serial connection to the VoCore screen.
type screenConn struct {
	port   serial.Port
	path   string
	logger *slog.Logger
}

// openScreen opens a serial connection to the VoCore screen.
func openScreen(portPath string, logger *slog.Logger) (*screenConn, error) {
	mode := &serial.Mode{BaudRate: screenBaud}
	port, err := serial.Open(portPath, mode)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", portPath, err)
	}
	if err := port.SetReadTimeout(time.Second); err != nil {
		port.Close()
		return nil, fmt.Errorf("set timeout: %w", err)
	}
	logger.Info("screen connected", "port", portPath, "baud", screenBaud)
	return &screenConn{port: port, path: portPath, logger: logger}, nil
}

// sendFrame writes a length-prefixed PNG frame to the screen.
// Protocol: [4 bytes little-endian uint32 = len(data)] [data bytes]
func (sc *screenConn) sendFrame(data []byte) error {
	var hdr [4]byte
	binary.LittleEndian.PutUint32(hdr[:], uint32(len(data)))
	if _, err := sc.port.Write(hdr[:]); err != nil {
		return fmt.Errorf("write header: %w", err)
	}
	if _, err := sc.port.Write(data); err != nil {
		return fmt.Errorf("write payload (%d bytes): %w", len(data), err)
	}
	return nil
}

// close releases the serial port.
func (sc *screenConn) close() {
	sc.logger.Info("screen disconnected", "port", sc.path)
	sc.port.Close()
}
