// Package vocore renders telemetry frames and transmits them to the VoCore
// M-PRO Screen embedded in the steering wheel.
//
// The screen is identified by USB VID/PID. On Windows, frames are sent via the
// native WinUSB API (no CGO, no libusb). On Linux, gousb/libusb is used.
// The device's screen model is queried at connect time to determine native
// resolution; portrait-native screens are handled via automatic 90° CW
// software rotation so the landscape-rendered dashboard displays correctly
// on a physically sideways-mounted panel.
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
	"github.com/kratofl/sprint/pkg/dto"
)

const (
	targetFPS           = 30
	frameInterval       = time.Second / targetFPS
	screenRetryInterval = 3 * time.Second
)

// Renderer drives the VoCore screen: renders telemetry into RGB565 frames
// and sends them over USB bulk transfer at ~30 fps.
type Renderer struct {
	screen     VoCoreConfig
	frameBytes int // expected RGB565 frame size (width*height*2), validated at SetScreen
	logger     *slog.Logger
	dash       *DashRenderer

	latestFrame atomic.Pointer[dto.TelemetryFrame]
	hasNewFrame atomic.Bool
}

// NewRenderer creates a Renderer. The screen is not opened until Run is called.
func NewRenderer(logger *slog.Logger) *Renderer {
	return &Renderer{logger: logger}
}

// SetScreen configures which VoCore screen device to target.
// Must be called before Run. If VID/PID are zero the renderer stays inert.
func (r *Renderer) SetScreen(cfg VoCoreConfig) {
	r.screen = cfg
	if cfg.Width > 0 && cfg.Height > 0 {
		r.dash = NewDashRenderer(cfg.Width, cfg.Height)
		if fb, err := validateScreenSize(cfg.Width, cfg.Height); err == nil {
			r.frameBytes = fb
		}
	}
}

// SetLayout sets the dashboard layout that the renderer should use.
// Passing nil falls back to the built-in hardcoded layout.
// Safe to call at any time; takes effect on the next rendered frame.
func (r *Renderer) SetLayout(layout *dash.DashLayout) {
	if r.dash != nil {
		r.dash.SetLayout(layout)
	}
}
// Non-blocking; safe to call from the coordinator's hot telemetry loop.
func (r *Renderer) OnFrame(frame *dto.TelemetryFrame) {
	r.latestFrame.Store(frame)
	r.hasNewFrame.Store(true)
}

// Run starts the render-and-send loop. Blocks until ctx is cancelled.
// It periodically scans for the screen's serial port; once found it opens
// the connection and streams PNG frames. On disconnect it retries.
func (r *Renderer) Run(ctx context.Context) {
	if r.screen.VID == 0 || r.screen.PID == 0 {
		r.logger.Warn("renderer: no screen configured, running in no-op mode")
		<-ctx.Done()
		return
	}
	if r.dash == nil {
		r.logger.Error("renderer: screen configured but DashRenderer not initialised")
		<-ctx.Done()
		return
	}

	r.logger.Info("renderer starting",
		"vid", fmt.Sprintf("0x%04X", r.screen.VID),
		"pid", fmt.Sprintf("0x%04X", r.screen.PID),
		"resolution", fmt.Sprintf("%dx%d", r.screen.Width, r.screen.Height),
		"target_fps", targetFPS)

	defer r.dash.Close()

	for {
		select {
		case <-ctx.Done():
			r.logger.Info("renderer stopped")
			return
		default:
		}

		sender, err := openScreen(r.screen.VID, r.screen.PID,
			r.screen.Width, r.screen.Height, r.logger)
		if err != nil {
			if errors.Is(err, errScreenTransportUnsupported) {
				r.logger.Warn("renderer transport unavailable; running in no-op mode", "err", err)
				<-ctx.Done()
				return
			}
			r.logger.Debug("screen not available, retrying", "err", err)
			if !waitOrCancel(ctx, screenRetryInterval) {
				return
			}
			continue
		}

		r.renderLoop(ctx, sender)
		sender.close()

		r.logger.Info("screen connection lost, will reconnect")
		if !waitOrCancel(ctx, screenRetryInterval) {
			return
		}
	}
}

// renderLoop renders and sends frames at targetFPS until disconnect or cancel.
// Render and USB send run in separate goroutines (double-buffered pipeline) so
// USB latency does not stall the next frame render.
func (r *Renderer) renderLoop(ctx context.Context, sender frameSender) {
	ticker := time.NewTicker(frameInterval)
	defer ticker.Stop()

	// Determine if software rotation is needed.
	nativeW, nativeH := sender.nativeSize()
	needsRotation := nativeH > nativeW && r.screen.Width > r.screen.Height
	if needsRotation {
		r.logger.Info("portrait screen detected, enabling 90° CW rotation",
			"native", fmt.Sprintf("%dx%d", nativeW, nativeH),
			"render", fmt.Sprintf("%dx%d", r.screen.Width, r.screen.Height))
	}

	frameBytes, err := validateScreenSize(nativeW, nativeH)
	if err != nil {
		r.logger.Error("invalid native screen size", "err", err)
		return
	}

	// ── Double-buffer pipeline ────────────────────────────────────────────────
	// Three pre-allocated RGB565 buffers. At any instant:
	//   • renderBuf   — exclusively owned by this goroutine (being written)
	//   • sendCh      — at most one buffer awaiting transmission
	//   • sender      — one buffer held by sendLoop during sender.send()
	// Ownership flows: render → sendCh → sendLoop → returnCh → render.
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
			if err := sender.send(buf); err != nil {
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

		// Check for async send error.
		select {
		case err := <-sendErrCh:
			r.logger.Warn("send error", "err", err)
			return
		default:
		}

		if !r.hasNewFrame.CompareAndSwap(true, false) {
			continue
		}
		frame := r.latestFrame.Load()
		if frame == nil {
			continue
		}

		renderStart := time.Now()

		img, err := r.dash.RenderFrame(frame)
		if err != nil {
			r.logger.Warn("render error", "err", err)
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
			r.logger.Error("frame size mismatch",
				"got", len(renderBuf), "want", frameBytes)
			return
		}

		// Enqueue renderBuf to the sender, reclaiming a free buffer in exchange.
		select {
		case sendCh <- renderBuf:
			// Enqueued successfully. Get a free buffer for the next render.
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
				renderBuf = stale // reuse the displaced buffer
			default:
				// Race: sender just consumed the pending frame; channel is now empty.
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

		// Backpressure: if render+convert took longer than one frame interval
		// drain any buffered tick so we don't pile up stale frames.
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
			r.logger.Info("render stats",
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
