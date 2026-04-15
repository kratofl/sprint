package core

import (
	"bytes"
	"context"
	"encoding/base64"
	"image/png"
	"log/slog"
	"sync"
	"sync/atomic"
	"time"

	"github.com/kratofl/sprint/app/internal/dashboard"
	"github.com/kratofl/sprint/pkg/dto"
)

var previewBufPool = sync.Pool{New: func() any { return new(bytes.Buffer) }}

const (
	previewTickInterval = 100 * time.Millisecond // ~10 Hz
	previewEventName    = "dash:preview"
)

// previewService renders the currently-editing dash layout via the shared
// Painter pipeline and emits base64-encoded PNG frames as "dash:preview"
// Wails events. This gives the editor a pixel-accurate live preview that
// matches exactly what appears on the physical screen.
//
// The service is cheap when idle — the goroutine only renders when active
// (i.e. the editor is open). Screen drivers are not affected.
type previewService struct {
	painterOnce sync.Once
	painter     *dashboard.Painter // created lazily on first Activate call; 800×480

	layout atomic.Pointer[dashboard.DashLayout]
	page   atomic.Int32
	idle   atomic.Bool
	active atomic.Bool

	latestFrame atomic.Pointer[dto.TelemetryFrame]

	// notify is sent to (non-blocking) whenever the layout changes so the
	// render goroutine can react immediately rather than waiting for the next tick.
	notify chan struct{}

	emitMu sync.RWMutex
	emit   EmitFn
	logger *slog.Logger
}

func newPreviewService(logger *slog.Logger, emit EmitFn) *previewService {
	return &previewService{
		notify: make(chan struct{}, 1),
		emit:   emit,
		logger: logger.With("component", "preview"),
	}
}

// setEmit replaces the emit function. Called when the coordinator wires the
// Wails emitter after startup (mirrors how the coordinator passes emit to drivers).
func (s *previewService) setEmit(fn EmitFn) {
	s.emitMu.Lock()
	s.emit = fn
	s.emitMu.Unlock()
}

// Start launches the render goroutine. ctx governs its lifetime.
func (s *previewService) Start(ctx context.Context) {
	go s.run(ctx)
}

func (s *previewService) run(ctx context.Context) {
	ticker := time.NewTicker(previewTickInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-s.notify:
			if s.active.Load() {
				s.renderAndEmit()
			}
		case <-ticker.C:
			if s.active.Load() {
				s.renderAndEmit()
			}
		}
	}
}

// Activate marks the preview active with the given initial layout/page and
// triggers an immediate first render so the editor sees the preview right away.
func (s *previewService) Activate(layout dashboard.DashLayout, pageIndex int, idle bool) {
	s.ensurePainter()
	s.layout.Store(&layout)
	s.page.Store(int32(pageIndex))
	s.idle.Store(idle)
	s.active.Store(true)
	s.sendNotify()
}

// Deactivate stops preview emission. The goroutine keeps running (it's cheap
// when idle) and will resume immediately on the next Activate call.
func (s *previewService) Deactivate() {
	s.active.Store(false)
}

// UpdateLayout replaces the layout being previewed and triggers an immediate
// re-render. Called whenever the user makes an edit in the dash editor.
func (s *previewService) UpdateLayout(layout dashboard.DashLayout, pageIndex int, idle bool) {
	if !s.active.Load() {
		return
	}
	s.layout.Store(&layout)
	s.page.Store(int32(pageIndex))
	s.idle.Store(idle)
	s.sendNotify()
}

// OnFrame stores the latest telemetry frame so the next render uses live data.
// Called by the coordinator's fanOut for every incoming telemetry frame.
func (s *previewService) OnFrame(frame *dto.TelemetryFrame) {
	s.latestFrame.Store(frame)
}

// sendNotify sends to the notify channel non-blocking so a layout change is
// reflected on the next render without waiting for the ticker.
func (s *previewService) sendNotify() {
	select {
	case s.notify <- struct{}{}:
	default:
	}
}

// ensurePainter creates the Painter the first time Activate is called.
// The Painter is always 800×480 so the preview matches the most common screen.
// Font extraction (done inside Paint on first call) is cached by the Painter.
func (s *previewService) ensurePainter() {
	s.painterOnce.Do(func() {
		s.painter = dashboard.NewPainter(800, 480)
	})
}

// renderAndEmit renders the current layout, encodes the result as PNG, and
// emits a "dash:preview" event with the base64-encoded image.
func (s *previewService) renderAndEmit() {
	layout := s.layout.Load()
	if layout == nil {
		return
	}

	// Apply the active page / idle selection to the painter.
	s.painter.SetLayout(layout)
	s.painter.SetActivePage(int(s.page.Load()))
	s.painter.SetIdle(s.idle.Load())

	frame := s.latestFrame.Load() // nil when game is not connected — widgets show "no data" state

	img, err := s.painter.Paint(frame)
	if err != nil {
		s.logger.Warn("preview render failed", "err", err)
		return
	}

	buf := previewBufPool.Get().(*bytes.Buffer)
	buf.Reset()
	defer previewBufPool.Put(buf)
	enc := &png.Encoder{CompressionLevel: png.BestSpeed}
	if err := enc.Encode(buf, img); err != nil {
		s.logger.Warn("preview PNG encode failed", "err", err)
		return
	}

	b64 := base64.StdEncoding.EncodeToString(buf.Bytes())
	s.emitMu.RLock()
	emit := s.emit
	s.emitMu.RUnlock()
	if emit != nil {
		emit(previewEventName, map[string]string{"png": b64})
	}
}
