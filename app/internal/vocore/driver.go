// Package vocore drives the VoCore M-PRO screen embedded in the steering wheel.
//
// The screen is identified by USB VID/PID. On Windows, frames are sent via the
// native WinUSB API (no CGO, no libusb). The device's screen model is queried
// at connect time to determine native resolution; portrait-native screens are
// handled via automatic 90° CW software rotation so the landscape-rendered
// dashboard displays correctly on a physically sideways-mounted panel.
//
// The wheel also has a separate LED controller serial port (VID 0x16D0 /
// PID 0x127B) — that device must never receive image data.
package vocore

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/kratofl/sprint/app/internal/dash"
	"github.com/kratofl/sprint/app/internal/devices"
	"github.com/kratofl/sprint/app/internal/render"
	"github.com/kratofl/sprint/pkg/dto"
)

const (
	targetFPS           = 30
	frameInterval       = time.Second / targetFPS
	screenRetryInterval = 3 * time.Second
)

// Driver drives the VoCore screen: renders telemetry into RGB565 frames
// and sends them over USB bulk transfer at ~30 fps.
type Driver struct {
	screen     devices.ScreenConfig
	frameBytes int // expected RGB565 frame size (width*height*2), validated at SetScreen
	logger     *slog.Logger
	painter    *render.Painter

	latestFrame atomic.Pointer[dto.TelemetryFrame]
	hasNewFrame atomic.Bool
}

// NewDriver creates a Driver. The screen is not opened until Run is called.
func NewDriver(logger *slog.Logger) *Driver {
	return &Driver{logger: logger}
}

// SetScreen configures which VoCore screen device to target.
// Must be called before Run. If VID/PID are zero the driver stays inert.
func (d *Driver) SetScreen(cfg devices.ScreenConfig) {
	d.screen = cfg
	if cfg.Width > 0 && cfg.Height > 0 {
		d.painter = render.NewPainter(cfg.Width, cfg.Height)
		if fb, err := validateScreenSize(cfg.Width, cfg.Height); err == nil {
			d.frameBytes = fb
		}
	}
}

// SetLayout sets the dashboard layout the driver should use.
// Safe to call at any time; takes effect on the next rendered frame.
func (d *Driver) SetLayout(layout *dash.DashLayout) {
	if d.painter != nil {
		d.painter.SetLayout(layout)
	}
}

// OnFrame delivers a new telemetry frame. Non-blocking; safe to call from the
// coordinator's hot telemetry loop.
func (d *Driver) OnFrame(frame *dto.TelemetryFrame) {
	d.latestFrame.Store(frame)
	d.hasNewFrame.Store(true)
}

// Run starts the render-and-send loop. Blocks until ctx is cancelled.
// It periodically opens the screen's USB connection; once found it streams
// RGB565 frames. On disconnect it retries.
func (d *Driver) Run(ctx context.Context) {
	if d.screen.VID == 0 || d.screen.PID == 0 {
		d.logger.Warn("vocore driver: no screen configured, running in no-op mode")
		<-ctx.Done()
		return
	}
	if d.painter == nil {
		d.logger.Error("vocore driver: screen configured but Painter not initialised")
		<-ctx.Done()
		return
	}

	d.logger.Info("vocore driver starting",
		"vid", fmt.Sprintf("0x%04X", d.screen.VID),
		"pid", fmt.Sprintf("0x%04X", d.screen.PID),
		"resolution", fmt.Sprintf("%dx%d", d.screen.Width, d.screen.Height),
		"target_fps", targetFPS)

	defer d.painter.Close()

	for {
		select {
		case <-ctx.Done():
			d.logger.Info("vocore driver stopped")
			return
		default:
		}

		transport, err := openScreen(d.screen.VID, d.screen.PID,
			d.screen.Width, d.screen.Height, d.logger)
		if err != nil {
			if errors.Is(err, errScreenTransportUnsupported) {
				d.logger.Warn("vocore transport unavailable; running in no-op mode", "err", err)
				<-ctx.Done()
				return
			}
			d.logger.Debug("screen not available, retrying", "err", err)
			if !waitOrCancel(ctx, screenRetryInterval) {
				return
			}
			continue
		}

		d.driveLoop(ctx, transport)
		transport.close()

		d.logger.Info("screen connection lost, will reconnect")
		if !waitOrCancel(ctx, screenRetryInterval) {
			return
		}
	}
}

// driveLoop renders and sends frames at targetFPS until disconnect or cancel.
// Render and USB send run in separate goroutines (double-buffered pipeline) so
// USB latency does not stall the next frame render.
func (d *Driver) driveLoop(ctx context.Context, transport screenTransport) {
	ticker := time.NewTicker(frameInterval)
	defer ticker.Stop()

	nativeW, nativeH := transport.nativeSize()
	needsRotation := nativeH > nativeW && d.screen.Width > d.screen.Height
	if needsRotation {
		d.logger.Info("portrait screen detected, enabling 90° CW rotation",
			"native", fmt.Sprintf("%dx%d", nativeW, nativeH),
			"render", fmt.Sprintf("%dx%d", d.screen.Width, d.screen.Height))
	}

	frameBytes, err := validateScreenSize(nativeW, nativeH)
	if err != nil {
		d.logger.Error("invalid native screen size", "err", err)
		return
	}

	// ── Double-buffer pipeline ────────────────────────────────────────────────
	// Three pre-allocated RGB565 buffers. Ownership flows:
	//   render → sendCh → sendLoop → returnCh → render
	// When sendCh is full the stale pending frame is displaced and its buffer
	// is reused immediately, ensuring we always transmit the latest frame.
	b0 := make([]byte, frameBytes)
	b1 := make([]byte, frameBytes)
	b2 := make([]byte, frameBytes)
	sendCh := make(chan []byte, 1)
	returnCh := make(chan []byte, 2)
	returnCh <- b1
	returnCh <- b2
	renderBuf := b0

	sendErrCh := make(chan error, 1)
	var senderWg sync.WaitGroup
	senderWg.Add(1)
	go func() {
		defer senderWg.Done()
		for buf := range sendCh {
			if err := transport.send(buf); err != nil {
				select {
				case sendErrCh <- err:
				default:
				}
				return
			}
			select {
			case returnCh <- buf:
			default:
			}
		}
	}()
	defer func() {
		close(sendCh)
		senderWg.Wait()
	}()
	// ─────────────────────────────────────────────────────────────────────────

	var framesSent int
	var framesSkipped int
	var totalRenderNs, totalConvertNs int64
	lastLog := time.Now()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}

		select {
		case err := <-sendErrCh:
			d.logger.Warn("send error", "err", err)
			return
		default:
		}

		if !d.hasNewFrame.CompareAndSwap(true, false) {
			continue
		}
		frame := d.latestFrame.Load()
		if frame == nil {
			continue
		}

		renderStart := time.Now()

		img, err := d.painter.Paint(frame)
		if err != nil {
			d.logger.Warn("paint error", "err", err)
			continue
		}
		renderDone := time.Now()

		if needsRotation {
			imageToRGB565CW90(img, renderBuf)
		} else {
			imageToRGB565(img, renderBuf)
		}
		convertDone := time.Now()

		if len(renderBuf) != frameBytes {
			d.logger.Error("frame size mismatch",
				"got", len(renderBuf), "want", frameBytes)
			return
		}

		// Enqueue renderBuf to the sender, reclaiming a free buffer in exchange.
		select {
		case sendCh <- renderBuf:
			select {
			case renderBuf = <-returnCh:
			case <-ctx.Done():
				return
			}
		default:
			// sendCh full (sender is busy). Replace stale pending frame.
			select {
			case stale := <-sendCh:
				sendCh <- renderBuf
				renderBuf = stale
			default:
				sendCh <- renderBuf
				select {
				case renderBuf = <-returnCh:
				case <-ctx.Done():
					return
				}
			}
		}

		framesSent++
		totalRenderNs += renderDone.Sub(renderStart).Nanoseconds()
		totalConvertNs += convertDone.Sub(renderDone).Nanoseconds()

		if time.Since(renderStart) > frameInterval {
			framesSkipped++
			select {
			case <-ticker.C:
			default:
			}
		}

		if elapsed := time.Since(lastLog); elapsed >= 5*time.Second {
			n := int64(framesSent)
			if n == 0 {
				n = 1
			}
			d.logger.Info("render stats",
				"fps", fmt.Sprintf("%.1f", float64(framesSent)/elapsed.Seconds()),
				"render_ms", fmt.Sprintf("%.2f", float64(totalRenderNs)/float64(n)/1e6),
				"convert_ms", fmt.Sprintf("%.2f", float64(totalConvertNs)/float64(n)/1e6),
				"frame_bytes", frameBytes,
				"skipped", framesSkipped,
				"rotated", needsRotation)
			framesSent = 0
			framesSkipped = 0
			totalRenderNs, totalConvertNs = 0, 0
			lastLog = time.Now()
		}
	}
}

// waitOrCancel sleeps for d or returns false if ctx is cancelled first.
func waitOrCancel(ctx context.Context, d time.Duration) bool {
	select {
	case <-ctx.Done():
		return false
	case <-time.After(d):
		return true
	}
}
