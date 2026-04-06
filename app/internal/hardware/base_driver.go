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
	screenRetryInterval = 3 * time.Second
	// fastRetryInterval is used for the first fastRetryDuration after Run starts,
	// so transient WinUSB init delays or brief exclusive-access windows
	// (e.g. another app releasing the device on startup) resolve quickly.
	fastRetryInterval = 300 * time.Millisecond
	fastRetryDuration = 30 * time.Second

	// idleRefreshInterval is how often the idle page is re-rendered when no
	// telemetry is flowing. Keeps the screen alive and supports time-based
	// idle widgets (e.g. a clock). 1 Hz is negligible USB overhead.
	idleRefreshInterval = 1 * time.Second

	// maxScreenPixels is a sanity cap to prevent integer overflow in width*height*2.
	// 4096×4096 = 16 M pixels × 2 = 32 MB, well above any real screen.
	maxScreenPixels = 4096 * 4096
)

// baseDriver holds all state and implements all methods shared between
// VoCoreDriver and USBD480Driver. Concrete drivers embed baseDriver and
// only need to implement Run (which calls runLoop with a driver-specific
// transport opener).
type baseDriver struct {
	screen      ScreenConfig
	defaultFPS  int          // hardware-appropriate default; used when cfgFPS is zero
	cfgRotation atomic.Int32 // user-configured rotation; updated by Configure for hot-reload
	cfgFPS      atomic.Int32 // user-configured target fps; 0 = fall back to defaultFPS
	cfgOffsetX  atomic.Int32 // pixels from left in screen space; applied after rotation
	cfgOffsetY  atomic.Int32 // pixels from top in screen space; applied after rotation
	logger      *slog.Logger

	// painter is the active Painter, stored atomically so SetLayout can access
	// it concurrently from any goroutine. Only driveLoop calls non-thread-safe
	// Painter methods (Paint, Close); SetLayout only calls the atomic SetLayout.
	painter       atomic.Pointer[dashboard.Painter]
	currentLayout atomic.Pointer[dashboard.DashLayout]

	latestFrame atomic.Pointer[dto.TelemetryFrame]
	hasNewFrame atomic.Bool
	forceRedraw atomic.Bool // set by layout/idle/page changes to trigger a repaint even with no game

	currentIdle       atomic.Bool
	currentActivePage atomic.Int32

	screenConnected atomic.Bool
	paused          atomic.Bool
	pauseSignal     chan struct{}        // buffered 1; signals driveLoop to stop and release USB
	emit            func(string, ...any) // set via SetEmit; nil until coordinator wires it
}

func newBaseDriver(logger *slog.Logger, defaultFPS int) baseDriver {
	return baseDriver{
		logger:      logger,
		defaultFPS:  defaultFPS,
		pauseSignal: make(chan struct{}, 1),
	}
}

// Configure sets the target screen's USB identity and render dimensions.
// Safe to call while the driver is running; takes effect on the next connect
// attempt. The rotation and fps are stored atomically so running render ticks
// can hot-reload them.
func (d *baseDriver) Configure(cfg ScreenConfig) {
	d.screen = cfg
	d.cfgRotation.Store(int32(cfg.Rotation))
	if cfg.TargetFPS > 0 {
		d.cfgFPS.Store(int32(cfg.TargetFPS))
	}
	d.cfgOffsetX.Store(int32(cfg.OffsetX))
	d.cfgOffsetY.Store(int32(cfg.OffsetY))
	d.forceRedraw.Store(true)
}

// SetEmit provides an event emitter so the driver can report connection state
// changes to the frontend. Call from the coordinator after Wails startup.
func (d *baseDriver) SetEmit(fn func(string, ...any)) {
	d.emit = fn
}

// IsConnected reports whether the USB screen connection is currently active.
func (d *baseDriver) IsConnected() bool {
	return d.screenConnected.Load()
}

// SetPaused pauses or resumes screen rendering.
// When paused, the current USB connection is released so another application
// (e.g., SimHub) can take over the screen. Sprint will reconnect automatically
// once SetPaused(false) is called.
func (d *baseDriver) SetPaused(paused bool) {
	d.paused.Store(paused)
	if paused {
		// Signal driveLoop to exit and release the USB transport.
		select {
		case d.pauseSignal <- struct{}{}:
		default:
		}
		d.emitEvent("screen:paused")
	} else {
		d.emitEvent("screen:resumed")
	}
}

// GetPaused reports whether screen rendering is currently paused.
func (d *baseDriver) GetPaused() bool {
	return d.paused.Load()
}

func (d *baseDriver) emitEvent(event string, data ...any) {
	if d.emit != nil {
		d.emit(event, data...)
	}
}

// SetActivePage sets the active page index on the current painter and caches
// the value so it is re-applied whenever a new painter is created.
func (d *baseDriver) SetActivePage(index int) {
	if index < 0 {
		index = 0
	}
	d.currentActivePage.Store(int32(index))
	if p := d.painter.Load(); p != nil {
		p.SetActivePage(index)
	}
	d.forceRedraw.Store(true)
}

// SetIdle controls the idle state on the current painter and caches the value
// so it is re-applied whenever a new painter is created.
func (d *baseDriver) SetIdle(idle bool) {
	d.currentIdle.Store(idle)
	if p := d.painter.Load(); p != nil {
		p.SetIdle(idle)
	}
	d.forceRedraw.Store(true)
}

// SetLayout stores the dashboard layout and applies it to the current Painter
// (if one exists). Safe to call at any time; takes effect on the next frame.
func (d *baseDriver) SetLayout(layout *dashboard.DashLayout) {
	d.currentLayout.Store(layout)
	if p := d.painter.Load(); p != nil {
		p.SetLayout(layout)
	}
	d.forceRedraw.Store(true)
}

// ensurePainter guarantees the active Painter has canvas dimensions w×h.
// When the existing painter already matches those dimensions it is kept intact
// (preserving its loaded layout and font cache). Otherwise the old painter is
// closed, a new one is created, and currentLayout is applied to it.
// Must only be called from driveLoop (not concurrency-safe for multiple writers).
func (d *baseDriver) ensurePainter(w, h int) {
	if p := d.painter.Load(); p != nil {
		if pw, ph := p.Dims(); pw == w && ph == h {
			return
		}
		p.Close()
	}
	p := dashboard.NewPainter(w, h)
	if layout := d.currentLayout.Load(); layout != nil {
		p.SetLayout(layout)
	}
	p.SetIdle(d.currentIdle.Load())
	p.SetActivePage(int(d.currentActivePage.Load()))
	d.painter.Store(p)
	// Re-apply currentLayout in case SetLayout raced between our Load and Store.
	if layout := d.currentLayout.Load(); layout != nil {
		p.SetLayout(layout)
	}
}

// OnFrame delivers a new telemetry frame. Non-blocking; safe to call from the
// coordinator's hot telemetry loop.
func (d *baseDriver) OnFrame(frame *dto.TelemetryFrame) {
	d.latestFrame.Store(frame)
	d.hasNewFrame.Store(true)
}

// runLoop is the shared connect-retry loop used by all screen drivers.
// name is used in log messages. openTransport is the driver-specific function
// that opens the USB connection.
func (d *baseDriver) runLoop(ctx context.Context, name string, openTransport func() (screenTransport, error)) {
	if d.screen.VID == 0 || d.screen.PID == 0 {
		d.logger.Warn(name + ": no screen configured, running in no-op mode")
		<-ctx.Done()
		return
	}

	d.logger.Info(name+" starting",
		"vid", fmt.Sprintf("0x%04X", d.screen.VID),
		"pid", fmt.Sprintf("0x%04X", d.screen.PID),
		"target_fps", d.cfgFPS.Load())

	defer func() {
		if p := d.painter.Load(); p != nil {
			p.Close()
		}
	}()

	startTime := time.Now()

	for {
		// Wait while paused before attempting to open the screen.
		for d.paused.Load() {
			select {
			case <-ctx.Done():
				d.logger.Info(name + " stopped (while paused)")
				return
			case <-time.After(200 * time.Millisecond):
			}
		}

		select {
		case <-ctx.Done():
			d.logger.Info(name + " stopped")
			return
		default:
		}

		transport, err := openTransport()
		if err != nil {
			if errors.Is(err, errScreenTransportUnsupported) {
				d.logger.Warn(name+": transport unavailable; running in no-op mode", "err", err)
				<-ctx.Done()
				return
			}
			d.logger.Warn("screen not available, retrying", "err", err)
			d.emitEvent("screen:error", err.Error())
			retryInterval := screenRetryInterval
			if time.Since(startTime) < fastRetryDuration {
				retryInterval = fastRetryInterval
			}
			if !waitOrCancel(ctx, retryInterval) {
				return
			}
			continue
		}

		d.screenConnected.Store(true)
		d.emitEvent("screen:connected")
		d.driveLoop(ctx, transport)

		// On app shutdown, send a black frame before releasing the USB handle
		// so the screen goes dark and is immediately usable by other apps.
		if ctx.Err() != nil {
			nativeW, nativeH := transport.nativeSize()
			if frameBytes := nativeW * nativeH * 2; frameBytes > 0 {
				_ = transport.send(make([]byte, frameBytes)) // all-zero = RGB565 black
			}
		}

		transport.close()
		d.screenConnected.Store(false)
		d.emitEvent("screen:disconnected")

		// If we exited driveLoop due to a pause signal, skip the reconnect wait.
		if d.paused.Load() {
			d.logger.Info("screen paused; USB released; waiting for resume")
			continue // loop back to the pause-wait above
		}

		d.logger.Info("screen connection lost, will reconnect")
		if !waitOrCancel(ctx, screenRetryInterval) {
			return
		}
	}
}

// driveLoop renders and sends frames at the configured fps until disconnect or cancel.
// Render and USB send run in separate goroutines (double-buffered pipeline) so
// USB latency does not stall the next frame render.
func (d *baseDriver) driveLoop(ctx context.Context, transport screenTransport) {
	activeFPS := int(d.cfgFPS.Load())
	if activeFPS <= 0 {
		activeFPS = d.defaultFPS
	}
	ticker := time.NewTicker(time.Second / time.Duration(activeFPS))
	defer ticker.Stop()

	nativeW, nativeH := transport.nativeSize()
	rotation := sanitizeRotation(int(d.cfgRotation.Load()))

	// Size the painter canvas to match native dims + rotation so all four
	// rotation values produce a correctly-strided output buffer.
	pW, pH := painterDimsForRotation(rotation, nativeW, nativeH)
	d.ensurePainter(pW, pH)

	d.logger.Info("screen connected",
		"native", fmt.Sprintf("%dx%d", nativeW, nativeH),
		"painter", fmt.Sprintf("%dx%d", pW, pH),
		"rotation_deg", rotation)

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
	if p := d.painter.Load(); p != nil {
		if img, err := p.Paint(&dto.TelemetryFrame{}); err == nil {
			applyRGB565Rotation(img, renderBuf, rotation)
			if ox, oy := int(d.cfgOffsetX.Load()), int(d.cfgOffsetY.Load()); ox != 0 || oy != 0 {
				applyScreenOffset(renderBuf, nativeW, nativeH, ox, oy, rotation)
			}
			if err := transport.send(renderBuf); err != nil {
				d.logger.Warn("standby frame send failed", "err", err)
			}
		}
	}

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

	var framesSent int
	var framesSkipped int
	var totalRenderNs, totalConvertNs int64
	lastLog := time.Now()
	lastRenderTime := time.Now()

	for {
		select {
		case <-ctx.Done():
			return
		case <-d.pauseSignal:
			d.logger.Info("pause signal received; releasing USB transport")
			return
		case <-ticker.C:
		}

		select {
		case err := <-sendErrCh:
			d.logger.Warn("send error", "err", err)
			return
		default:
		}

		newFrame := d.hasNewFrame.CompareAndSwap(true, false)
		redraw := d.forceRedraw.CompareAndSwap(true, false)
		// Idle heartbeat: re-render once per second when in idle mode and no
		// telemetry is flowing. Keeps the screen alive and supports time-based
		// idle widgets (e.g. a clock or "no game" notice).
		idleHeartbeat := d.currentIdle.Load() && time.Since(lastRenderTime) >= idleRefreshInterval
		if !newFrame && !redraw && !idleHeartbeat {
			// Hot-reload fps if it changed (e.g. via Configure).
			newFPS := int(d.cfgFPS.Load())
			if newFPS <= 0 {
				newFPS = d.defaultFPS
			}
			if newFPS != activeFPS {
				activeFPS = newFPS
				ticker.Reset(time.Second / time.Duration(activeFPS))
			}
			continue
		}
		frame := d.latestFrame.Load()
		if frame == nil {
			frame = &dto.TelemetryFrame{}
		}

		// Re-read rotation each tick so hot-reloads via Configure take effect
		// immediately. Resize the painter if the new rotation changes the canvas
		// dimensions (e.g. switching between 0°↔90° on a portrait screen).
		rotation = sanitizeRotation(int(d.cfgRotation.Load()))
		pW, pH = painterDimsForRotation(rotation, nativeW, nativeH)
		d.ensurePainter(pW, pH)

		renderStart := time.Now()

		img, err := d.painter.Load().Paint(frame)
		if err != nil {
			d.logger.Warn("paint error", "err", err)
			continue
		}
		renderDone := time.Now()

		applyRGB565Rotation(img, renderBuf, rotation)
		if ox, oy := int(d.cfgOffsetX.Load()), int(d.cfgOffsetY.Load()); ox != 0 || oy != 0 {
			applyScreenOffset(renderBuf, nativeW, nativeH, ox, oy, rotation)
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
		lastRenderTime = time.Now()
		totalRenderNs += renderDone.Sub(renderStart).Nanoseconds()
		totalConvertNs += convertDone.Sub(renderDone).Nanoseconds()

		if time.Since(renderStart) > time.Second/time.Duration(activeFPS) {
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
				"render_ns", fmt.Sprintf("%.2f", float64(totalRenderNs)/float64(n)/1e6),
				"convert_ns", fmt.Sprintf("%.2f", float64(totalConvertNs)/float64(n)/1e6),
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

// validateScreenSize checks that width/height are positive and that
// width*height*2 (RGB565) does not overflow a reasonable buffer size.
func validateScreenSize(width, height int) (frameBytes int, err error) {
	if width <= 0 || height <= 0 {
		return 0, fmt.Errorf("invalid screen dimensions: %dx%d", width, height)
	}
	pixels := width * height
	if pixels > maxScreenPixels || pixels/width != height {
		return 0, fmt.Errorf("screen dimensions too large: %dx%d (%d pixels)", width, height, pixels)
	}
	return pixels * 2, nil
}

// sanitizeRotation normalizes r to one of {0, 90, 180, 270}.
func sanitizeRotation(r int) int {
	switch r {
	case 90, 180, 270:
		return r
	default:
		return 0
	}
}

// painterDimsForRotation returns the painter canvas dimensions that produce a
// correctly-strided output buffer for the given native screen size and rotation.
//
//   - 0°/180°: painter canvas = nativeW × nativeH (rows already aligned).
//   - 90°/270°: canvas is transposed (nativeH × nativeW) so the rotation
//     aligns each output row with the screen's native row width.
//
// This makes all four rotation values visually distinct regardless of whether
// the physical screen is portrait- or landscape-native.
func painterDimsForRotation(rotation, nativeW, nativeH int) (int, int) {
	if rotation == 90 || rotation == 270 {
		return nativeH, nativeW
	}
	return nativeW, nativeH
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
