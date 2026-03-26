//go:build linux || windows

package vocore

import (
	"fmt"
	"log/slog"

	"github.com/google/gousb"
)

// VoCore M-PRO screen USB protocol constants (from mpro_drm driver).
const (
	usbBulkEndpoint = 2    // bulk OUT endpoint for pixel data
	usbVendorReq    = 0xB0 // vendor-specific control request
	usbReqTypeOut   = 0x40 // USB_DIR_OUT | USB_TYPE_VENDOR | USB_RECIP_DEVICE
)

type usbSender struct {
	ctx    *gousb.Context
	dev    *gousb.Device
	intf   *gousb.Interface
	outEP  *gousb.OutEndpoint
	cmd    [12]byte // draw command (mpro partial-update format)
	logger *slog.Logger
	done   func()
}

func openScreenImpl(vid, pid uint16, width, height int, logger *slog.Logger) (frameSender, error) {
	ctx := gousb.NewContext()

	dev, err := ctx.OpenDeviceWithVIDPID(gousb.ID(vid), gousb.ID(pid))
	if err != nil {
		ctx.Close()
		return nil, fmt.Errorf("open VID=%04X PID=%04X: %w", vid, pid, err)
	}
	if dev == nil {
		ctx.Close()
		return nil, fmt.Errorf("device VID=%04X PID=%04X not found", vid, pid)
	}

	dev.SetAutoDetach(true)

	intf, done, err := dev.DefaultInterface()
	if err != nil {
		dev.Close()
		ctx.Close()
		return nil, fmt.Errorf("claim interface: %w", err)
	}

	outEP, err := intf.OutEndpoint(usbBulkEndpoint)
	if err != nil {
		done()
		dev.Close()
		ctx.Close()
		return nil, fmt.Errorf("bulk OUT endpoint %d: %w", usbBulkEndpoint, err)
	}

	screenSize := width * height * 2 // RGB565

	s := &usbSender{
		ctx:    ctx,
		dev:    dev,
		intf:   intf,
		outEP:  outEP,
		logger: logger,
		done:   done,
	}

	// Full-frame draw command (12-byte mpro format).
	// Bytes 0-5: command header + data length.
	// Bytes 6-11: x, y offsets and width for partial update.
	s.cmd[0] = 0x00
	s.cmd[1] = 0x2C
	s.cmd[2] = byte(screenSize)
	s.cmd[3] = byte(screenSize >> 8)
	s.cmd[4] = byte(screenSize >> 16)
	s.cmd[5] = 0x00
	s.cmd[6] = 0x00              // x lo
	s.cmd[7] = 0x00              // x hi
	s.cmd[8] = 0x00              // y lo
	s.cmd[9] = 0x00              // y hi
	s.cmd[10] = byte(width)      // width lo
	s.cmd[11] = byte(width >> 8) // width hi

	// Wake the display (exit sleep mode).
	wake := [6]byte{0x00, 0x29, 0x00, 0x00, 0x00, 0x00}
	if _, err := dev.Control(usbReqTypeOut, usbVendorReq, 0, 0, wake[:]); err != nil {
		logger.Warn("display wake failed (non-fatal)", "err", err)
	}

	logger.Info("VoCore screen opened",
		"vid", fmt.Sprintf("0x%04X", vid),
		"pid", fmt.Sprintf("0x%04X", pid),
		"resolution", fmt.Sprintf("%dx%d", width, height),
		"frame_bytes", screenSize)

	return s, nil
}

func (s *usbSender) send(rgb565 []byte) error {
	// Send draw command via USB control transfer.
	if _, err := s.dev.Control(usbReqTypeOut, usbVendorReq, 0, 0, s.cmd[:]); err != nil {
		return fmt.Errorf("control transfer: %w", err)
	}
	// Send pixel data via USB bulk transfer.
	if _, err := s.outEP.Write(rgb565); err != nil {
		return fmt.Errorf("bulk write: %w", err)
	}
	return nil
}

func (s *usbSender) close() {
	s.done()
	s.dev.Close()
	s.ctx.Close()
	s.logger.Info("VoCore screen closed")
}
