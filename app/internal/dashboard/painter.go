// Package dashboard paints dashboard images from telemetry data.
// It has no hardware dependency — callers receive an image.Image and decide
// how to deliver it (USB, file, test comparison, etc.).
package dashboard

import (
	"embed"
	"fmt"
	"image"
	"image/color"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"

	"github.com/fogleman/gg"
	"github.com/kratofl/sprint/app/internal/dashboard/widgets"
	"github.com/kratofl/sprint/pkg/dto"
	"golang.org/x/image/font"
	"golang.org/x/image/font/opentype"
)

//go:embed fonts/*.ttf
var fontsFS embed.FS

// Painter produces a full dashboard image for a given telemetry frame.
type Painter struct {
	width, height int
	fontDir       string
	fontOnce      sync.Once

	// fontFiles caches parsed *opentype.Font per filename (expensive to parse).
	// fontFaces caches the ready-to-use font.Face per "filename@size" key.
	// Both are only accessed from the render goroutine — no mutex required.
	fontFiles map[string]*opentype.Font
	fontFaces map[string]font.Face

	// bgImg is the pre-baked static background (solid ColBg fill).
	// Rendered once on the first frame; copied into ctx at the start of each
	// frame so clearing the canvas does not run every tick.
	bgImg *image.RGBA

	// ctx is the reusable gg.Context. Allocated once per screen size and reset
	// at the start of each frame by blitting bgImg, avoiding a 1.5 MB allocation
	// per tick (800×480 RGBA).
	ctx *gg.Context

	// layout is the user-configured layout.
	layout atomic.Pointer[DashLayout]
}

// NewPainter creates a Painter for the given screen dimensions.
func NewPainter(width, height int) *Painter {
	return &Painter{width: width, height: height}
}

// SetLayout atomically sets the layout to use on the next rendered frame.
// Passing nil is a no-op (the caller should always pass a valid layout).
func (p *Painter) SetLayout(layout *DashLayout) {
	if layout == nil {
		p.layout.Store((*DashLayout)(nil))
	} else {
		p.layout.Store(layout)
	}
}

// Paint renders a complete dashboard image for the given telemetry frame
// using the active layout.
func (p *Painter) Paint(frame *dto.TelemetryFrame) (image.Image, error) {
	p.fontOnce.Do(func() {
		p.extractFonts()
		p.fontFiles = make(map[string]*opentype.Font)
		p.fontFaces = make(map[string]font.Face)
	})
	p.ensureBg()

	w, h := float64(p.width), float64(p.height)
	dc := p.getContext()

	if layout := p.layout.Load(); layout != nil {
		for _, widget := range layout.Widgets {
			p.dispatchWidget(dc, frame, widget)
		}
	}

	p.applyFlagOverlay(dc, frame, w, h)
	return dc.Image(), nil
}

// dispatchWidget dispatches to the registered widget renderer for w.Type.
// Unknown widget types are silently skipped.
func (p *Painter) dispatchWidget(dc *gg.Context, frame *dto.TelemetryFrame, w DashWidget) {
	widgets.Dispatch(w.Type, dc, frame,
		float64(w.X), float64(w.Y), float64(w.W), float64(w.H),
		p.face)
}

// applyFlagOverlay draws the flag status banner over the rendered frame when a flag is active.
func (p *Painter) applyFlagOverlay(dc *gg.Context, frame *dto.TelemetryFrame, w, h float64) {
	if !frame.Flags.Yellow && !frame.Flags.Red && !frame.Flags.SafetyCar {
		return
	}
	var flagCol color.RGBA
	var flagText string
	switch {
	case frame.Flags.Red:
		flagCol, flagText = widgets.ColDanger, "RED FLAG"
	case frame.Flags.SafetyCar:
		flagCol, flagText = widgets.ColWarning, "SAFETY CAR"
	default:
		flagCol, flagText = widgets.ColWarning, "YELLOW FLAG"
	}
	dc.SetRGBA255(int(flagCol.R), int(flagCol.G), int(flagCol.B), 25)
	dc.DrawRectangle(0, 0, w, h)
	dc.Fill()
	dc.SetColor(flagCol)
	dc.DrawRectangle(0, h-30, w, 30)
	dc.Fill()
	p.face(dc, "SpaceGrotesk-Bold.ttf", 14)
	dc.SetColor(widgets.ColBg)
	dc.DrawStringAnchored(flagText, w/2, h-15, 0.5, 0.5)
}

// Drawing helpers.

// ensureBg pre-renders the static background into bgImg once per painter
// lifetime. Subsequent frames blit this image instead of clearing manually.
func (p *Painter) ensureBg() {
	if p.bgImg != nil {
		return
	}
	tmp := gg.NewContext(p.width, p.height)
	tmp.SetColor(widgets.ColBg)
	tmp.Clear()
	src := tmp.Image().(*image.RGBA)
	p.bgImg = image.NewRGBA(src.Rect)
	copy(p.bgImg.Pix, src.Pix)
}

// getContext returns the reusable gg.Context reset to the pre-baked background.
// The same *image.RGBA is reused across frames: the caller converts it to
// RGB565 immediately after Paint returns, so reuse is safe.
func (p *Painter) getContext() *gg.Context {
	if p.ctx == nil {
		p.ctx = gg.NewContext(p.width, p.height)
	}
	if dst, ok := p.ctx.Image().(*image.RGBA); ok && p.bgImg != nil {
		copy(dst.Pix, p.bgImg.Pix)
	} else {
		p.ctx.SetColor(widgets.ColBg)
		p.ctx.Clear()
	}
	return p.ctx
}

// Close removes the temporary font directory and releases cached font faces.
// Safe to call multiple times.
func (p *Painter) Close() {
	if p.fontDir != "" {
		os.RemoveAll(p.fontDir)
		p.fontDir = ""
	}
	for _, f := range p.fontFaces {
		f.Close()
	}
	p.fontFaces = nil
	p.fontFiles = nil
}

// Font management.

// face sets the font face on dc, using a cache to avoid re-parsing the TTF on
// every draw call.
func (p *Painter) face(dc *gg.Context, name string, size float64) {
	key := fmt.Sprintf("%s@%.2f", name, size)
	if f, ok := p.fontFaces[key]; ok {
		dc.SetFontFace(f)
		return
	}

	parsed, ok := p.fontFiles[name]
	if !ok {
		data, err := os.ReadFile(filepath.Join(p.fontDir, name))
		if err != nil {
			return
		}
		parsed, err = opentype.Parse(data)
		if err != nil {
			return
		}
		p.fontFiles[name] = parsed
	}

	face, err := opentype.NewFace(parsed, &opentype.FaceOptions{
		Size:    size,
		DPI:     72,
		Hinting: font.HintingFull,
	})
	if err != nil {
		return
	}
	p.fontFaces[key] = face
	dc.SetFontFace(face)
}

func (p *Painter) extractFonts() {
	dir, err := os.MkdirTemp("", "sprint-fonts-*")
	if err != nil {
		return
	}
	p.fontDir = dir
	entries, _ := fontsFS.ReadDir("fonts")
	for _, e := range entries {
		data, err := fontsFS.ReadFile("fonts/" + e.Name())
		if err != nil {
			continue
		}
		_ = os.WriteFile(filepath.Join(dir, e.Name()), data, 0644)
	}
}
