// Package hardware drives the VoCore M-PRO screen embedded in the steering wheel.
//
// The screen is identified by USB VID/PID. On Windows, frames are sent via the
// native WinUSB API (no CGO, no libusb). The device's screen model is queried
// at connect time to determine native resolution; portrait-native screens are
// handled via automatic 90° CW software rotation so the landscape-rendered
// dashboard displays correctly on a physically sideways-mounted panel.
//
// The wheel also has a separate LED controller serial port (VID 0x16D0 /
// PID 0x127B) — that device must never receive image data.
package hardware

import (
	"context"
	"errors"
	"fmt"
	"image"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/kratofl/sprint/app/internal/dashboard"
	"github.com/kratofl/sprint/pkg/dto"
)

const (
	targetFPS           = 30
	frameInterval       = time.Second / targetFPS
	screenRetryInterval = 3 * time.Second
)

// VoCoreDriver drives the VoCore screen: renders telemetry into RGB565 frames
// and sends them over USB bulk transfer at ~30 fps.
type VoCoreDriver struct {
	screen      VoCoreConfig
	cfgRotation atomic.Int32 // user-configured rotation; updated by SetScreen for hot-reload
	frameBytes  int          // expected RGB565 frame size (width*height*2), validated at SetScreen
	logger      *slog.Logger
	painter     *dashboard.Painter

	latestFrame atomic.Pointer[dto.TelemetryFrame]
	hasNewFrame atomic.Bool

	screenConnected atomic.Bool
	emit            func(string, ...any) // set via SetEmit; nil until coordinator wires it
}

// NewVoCoreDriver creates a VoCoreDriver. The screen is not opened until Run is called.
func NewVoCoreDriver(logger *slog.Logger) *VoCoreDriver {
	return &VoCoreDriver{logger: logger}
}

// SetEmit provides an event emitter so the driver can report connection state
// changes to the frontend. Call from the coordinator after Wails startup.
func (d *VoCoreDriver) SetEmit(fn func(string, ...any)) {
	d.emit = fn
}

// IsScreenConnected reports whether the USB screen connection is currently active.
func (d *VoCoreDriver) IsScreenConnected() bool {
	return d.screenConnected.Load()
}

func (d *VoCoreDriver) emitEvent(event string, data ...any) {
	if d.emit != nil {
		d.emit(event, data...)
	}
}

// SetScreen configures which VoCore screen device to target.
// Must be called before Run. If VID/PID are zero the driver stays inert.
// cfgRotation is stored atomically so that changes applied via SetScreen
// while the render loop is running take effect on the next frame.
func (d *VoCoreDriver) SetScreen(cfg VoCoreConfig) {
	d.screen = cfg
	d.cfgRotation.Store(int32(cfg.Rotation))
	if cfg.Width > 0 && cfg.Height > 0 {
		d.painter = dashboard.NewPainter(cfg.Width, cfg.Height)
		if fb, err := validateScreenSize(cfg.Width, cfg.Height); err == nil {
			d.frameBytes = fb
		}
	}
}

// SetLayout sets the dashboard layout the driver should use.
// Safe to call at any time; takes effect on the next rendered frame.
func (d *VoCoreDriver) SetLayout(layout *dashboard.DashLayout) {
	if d.painter != nil {
		d.painter.SetLayout(layout)
	}
}

// OnFrame delivers a new telemetry frame. Non-blocking; safe to call from the
// coordinator's hot telemetry loop.
func (d *VoCoreDriver) OnFrame(frame *dto.TelemetryFrame) {
	d.latestFrame.Store(frame)
	d.hasNewFrame.Store(true)
}

// Run starts the render-and-send loop. Blocks until ctx is cancelled.
// It periodically opens the screen's USB connection; once found it streams
// RGB565 frames. On disconnect it retries.
func (d *VoCoreDriver) Run(ctx context.Context) {
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

		transport, err := openScreen(d.screen, d.logger)
		if err != nil {
			if errors.Is(err, errScreenTransportUnsupported) {
				d.logger.Warn("vocore transport unavailable; running in no-op mode", "err", err)
				<-ctx.Done()
				return
			}
			d.logger.Warn("screen not available, retrying", "err", err)
			d.emitEvent("screen:error", err.Error())
			if !waitOrCancel(ctx, screenRetryInterval) {
				return
			}
			continue
		}

		d.screenConnected.Store(true)
		d.emitEvent("screen:connected")
		d.driveLoop(ctx, transport)
		transport.close()
		d.screenConnected.Store(false)
		d.emitEvent("screen:disconnected")

		d.logger.Info("screen connection lost, will reconnect")
		if !waitOrCancel(ctx, screenRetryInterval) {
			return
		}
	}
}

// driveLoop renders and sends frames at targetFPS until disconnect or cancel.
// Render and USB send run in separate goroutines (double-buffered pipeline) so
// USB latency does not stall the next frame render.
func (d *VoCoreDriver) driveLoop(ctx context.Context, transport screenTransport) {
	ticker := time.NewTicker(frameInterval)
	defer ticker.Stop()

	nativeW, nativeH := transport.nativeSize()
	rotation := resolveRotation(int(d.cfgRotation.Load()), d.screen.Width, d.screen.Height, nativeW, nativeH)
	if rotation != 0 {
		d.logger.Info("screen rotation configured",
			"native", fmt.Sprintf("%dx%d", nativeW, nativeH),
			"render", fmt.Sprintf("%dx%d", d.screen.Width, d.screen.Height),
			"rotation_deg", rotation)
	}

	frameBytes, err := validateScreenSize(nativeW, nativeH)
	if err != nil {
		d.logger.Error("invalid native screen size", "err", err)
		return
	}

	// Double-buffer pipeline.
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

	// Claim the screen immediately with a standby frame so it shows Sprint's
	// layout rather than whatever the previous app left behind. Sent before the
	// async sender goroutine starts so transport.send is safe to call directly.
	if img, err := d.painter.Paint(&dto.TelemetryFrame{}); err == nil {
		applyRGB565Rotation(img, renderBuf, rotation)
		if err := transport.send(renderBuf); err != nil {
			d.logger.Warn("standby frame send failed", "err", err)
		}
	}

	sendErrCh:= make(chan error, 1)
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

		// Re-read rotation each tick so hot-reloads via SetScreen take effect immediately.
		rotation = resolveRotation(int(d.cfgRotation.Load()), d.screen.Width, d.screen.Height, nativeW, nativeH)

		renderStart := time.Now()

		img, err := d.painter.Paint(frame)
		if err != nil {
			d.logger.Warn("paint error", "err", err)
			continue
		}
		renderDone := time.Now()

		applyRGB565Rotation(img, renderBuf, rotation)
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
				"rotation_deg", rotation)
			framesSent = 0
			framesSkipped = 0
			totalRenderNs, totalConvertNs = 0, 0
			lastLog = time.Now()
		}
	}
}

// resolveRotation returns the effective rotation angle (0, 90, 180, or 270) for
// the given configuration and hardware dimensions.
//
// It validates that the chosen rotation produces output whose row stride
// (painterW for 0°/180°, painterH for 90°/270°) matches nativeW — the number
// of pixels per row the screen hardware expects. If the stored value is
// incompatible it is silently corrected:
//   - landscape screen (nativeW > nativeH): 90°/270° would produce portrait
//     stride → corrected to 0°/180° respectively.
//   - portrait screen (nativeH > nativeW): 0°/180° would produce landscape
//     stride → corrected to 90°/270° respectively.
func resolveRotation(cfgRotation, painterW, painterH, nativeW, nativeH int) int {
	r := cfgRotation
	switch r {
	case 90, 180, 270:
	default:
		r = 0
	}

	// stride is the number of pixels per output row after applying rotation r.
	stride := painterW
	if r == 90 || r == 270 {
		stride = painterH
	}

	if stride == nativeW {
		return r
	}

	// The stored rotation is incompatible with the physical screen orientation.
	// Pick the nearest valid rotation that produces the correct stride.
	if painterH == nativeW {
		// painterH pixels/row matches: use 90° or 270°.
		if r == 270 {
			return 270
		}
		return 90
	}
	// painterW pixels/row matches (or fallback): use 0° or 180°.
	if r == 180 {
		return 180
	}
	return 0
}

// applyRGB565Rotation converts img into RGB565 with the given rotation angle.
func applyRGB565Rotation(img image.Image, dst []byte, rotation int) {
	switch rotation {
	case 90:
		imageToRGB565CW90(img, dst)
	case 180:
		imageToRGB565CW180(img, dst)
	case 270:
		imageToRGB565CW270(img, dst)
	default:
		imageToRGB565(img, dst)
	}
}
func waitOrCancel(ctx context.Context, d time.Duration) bool {
	select {
	case <-ctx.Done():
		return false
	case <-time.After(d):
		return true
	}
}
