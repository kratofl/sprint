// Package vocore renders telemetry frames to PNG images and transmits them to
// the VoCore M-PRO Screen embedded in the steering wheel.
//
// The screen is identified by USB VID/PID and accessed via USB bulk transfer
// using the gousb (libusb) library. Frames are sent as raw RGB565 pixel data
// following the mpro_drm protocol (vendor control request 0xB0 + bulk OUT).
//
// The wheel also has a separate LED controller serial port (VID 0x16D0 /
// PID 0x127B) — that device must never receive image data.
package vocore

import (
	"context"
	"fmt"
	"log/slog"
	"sync/atomic"
	"time"

	"github.com/kratofl/sprint/pkg/dto"
)

const (
	targetFPS           = 30
	frameInterval       = time.Second / targetFPS
	screenRetryInterval = 3 * time.Second
)

// ScreenConfig identifies the VoCore display by its USB VID/PID and native
// resolution. The VID/PID are used to locate the correct serial port.
type ScreenConfig struct {
	VID    uint16 // USB Vendor ID (e.g. 0xC872)
	PID    uint16 // USB Product ID (e.g. 0x1004)
	Width  int    // native screen width in pixels
	Height int    // native screen height in pixels
}

// Renderer drives the VoCore screen: renders telemetry into RGB565 frames
// and sends them over USB bulk transfer at ~30 fps.
type Renderer struct {
	screen ScreenConfig
	logger *slog.Logger
	dash   *DashRenderer

	latestFrame atomic.Pointer[dto.TelemetryFrame]
	hasNewFrame atomic.Bool
}

// NewRenderer creates a Renderer. The screen is not opened until Run is called.
func NewRenderer(logger *slog.Logger) *Renderer {
	return &Renderer{logger: logger}
}

// SetScreen configures which VoCore screen device to target.
// Must be called before Run. If VID/PID are zero the renderer stays inert.
func (r *Renderer) SetScreen(cfg ScreenConfig) {
	r.screen = cfg
	if cfg.Width > 0 && cfg.Height > 0 {
		r.dash = NewDashRenderer(cfg.Width, cfg.Height)
	}
}

// OnFrame stores the latest telemetry frame for rendering.
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
func (r *Renderer) renderLoop(ctx context.Context, sender frameSender) {
	ticker := time.NewTicker(frameInterval)
	defer ticker.Stop()

	// Pre-allocate RGB565 buffer (2 bytes per pixel, reused every frame).
	rgb565 := make([]byte, r.screen.Width*r.screen.Height*2)
	var framesSent int
	lastLog := time.Now()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}

		if !r.hasNewFrame.CompareAndSwap(true, false) {
			continue
		}
		frame := r.latestFrame.Load()
		if frame == nil {
			continue
		}

		img, err := r.dash.RenderFrame(frame)
		if err != nil {
			r.logger.Warn("render error", "err", err)
			continue
		}

		imageToRGB565(img, rgb565)

		if err := sender.send(rgb565); err != nil {
			r.logger.Warn("send error", "err", err)
			return // triggers reconnect
		}

		framesSent++
		if elapsed := time.Since(lastLog); elapsed >= 5*time.Second {
			r.logger.Info("render stats",
				"fps", fmt.Sprintf("%.1f", float64(framesSent)/elapsed.Seconds()),
				"frame_bytes", len(rgb565))
			framesSent = 0
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
