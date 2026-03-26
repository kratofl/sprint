//go:build linux && cgo

package vocore

import (
	"fmt"
	"log/slog"

	"github.com/google/gousb"
)

type usbSender struct {
	ctx    *gousb.Context
	dev    *gousb.Device
	intf   *gousb.Interface
	outEP  *gousb.OutEndpoint
	cmd    [6]byte // 6-byte full-frame draw command
	nativeW, nativeH int
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

	// Query screen model for native dimensions.
	nativeW, nativeH := width, height
	cmdGetScreen := [5]byte{0x51, 0x02, 0x04, 0x1F, 0xFC}
	if _, err := dev.Control(usbReqTypeOut, 0xB5, 0, 0, cmdGetScreen[:]); err == nil {
		var status [1]byte
		if _, err := dev.Control(0xC0, 0xB6, 0, 0, status[:]); err == nil {
			var resp [5]byte
			if n, err := dev.Control(0xC0, 0xB7, 0, 0, resp[:]); err == nil && n >= 5 {
				model := uint32(resp[1]) | uint32(resp[2])<<8 | uint32(resp[3])<<16 | uint32(resp[4])<<24
				nativeW, nativeH = mproModelDimensions(model)
				logger.Info("VoCore screen model detected",
					"model_id", fmt.Sprintf("0x%08X", model),
					"native", fmt.Sprintf("%dx%d", nativeW, nativeH))
			}
		}
	}

	screenSize, err := validateScreenSize(nativeW, nativeH)
	if err != nil {
		done()
		dev.Close()
		ctx.Close()
		return nil, err
	}

	s := &usbSender{
		ctx:     ctx,
		dev:     dev,
		intf:    intf,
		outEP:   outEP,
		nativeW: nativeW,
		nativeH: nativeH,
		logger:  logger,
		done:    done,
	}

	// 6-byte full-frame draw command: mode + Memory Write + data length.
	s.cmd[0] = 0x00 // mode: RGB565
	s.cmd[1] = 0x2C // Memory Write
	s.cmd[2] = byte(screenSize)
	s.cmd[3] = byte(screenSize >> 8)
	s.cmd[4] = byte(screenSize >> 16)
	s.cmd[5] = 0x00

	// Wake the display: Sleep Out + Display ON.
	sleepOut := [6]byte{0x00, 0x11, 0x00, 0x00, 0x00, 0x00}
	if _, err := dev.Control(usbReqTypeOut, usbVendorReq, 0, 0, sleepOut[:]); err != nil {
		logger.Warn("sleep-out failed (non-fatal)", "err", err)
	}
	wake := [6]byte{0x00, 0x29, 0x00, 0x00, 0x00, 0x00}
	if _, err := dev.Control(usbReqTypeOut, usbVendorReq, 0, 0, wake[:]); err != nil {
		logger.Warn("display wake failed (non-fatal)", "err", err)
	}

	logger.Info("VoCore screen opened",
		"vid", fmt.Sprintf("0x%04X", vid),
		"pid", fmt.Sprintf("0x%04X", pid),
		"native", fmt.Sprintf("%dx%d", nativeW, nativeH),
		"frame_bytes", screenSize)

	return s, nil
}

func (s *usbSender) send(rgb565 []byte) error {
	if _, err := s.dev.Control(usbReqTypeOut, usbVendorReq, 0, 0, s.cmd[:]); err != nil {
		return fmt.Errorf("control transfer: %w", err)
	}
	if _, err := s.outEP.Write(rgb565); err != nil {
		return fmt.Errorf("bulk write: %w", err)
	}
	return nil
}

func (s *usbSender) nativeSize() (int, int) {
	return s.nativeW, s.nativeH
}

func (s *usbSender) close() {
	s.done()
	s.dev.Close()
	s.ctx.Close()
	s.logger.Info("VoCore screen closed")
}
