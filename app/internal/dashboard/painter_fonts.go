package dashboard

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/fogleman/gg"
	"github.com/kratofl/sprint/app/internal/dashboard/widgets"
	"golang.org/x/image/font"
	"golang.org/x/image/font/opentype"
)

// fontFileName maps a FontFamily and bold flag to the actual TTF file name.
func fontFileName(family widgets.FontFamily, bold bool) string {
	switch family {
	case widgets.FontFamilyMono:
		if bold {
			return "JetBrainsMono-Bold.ttf"
		}
		return "JetBrainsMono-Regular.ttf"
	default:
		if bold {
			return "SpaceGrotesk-Bold.ttf"
		}
		return "SpaceGrotesk-Regular.ttf"
	}
}

// fontStyleToFamily converts a legacy FontStyle to FontFamily and bold flag.
// Used to resolve WidgetStyle.Font / LabelFont widget-level overrides.
func fontStyleToFamily(fs widgets.FontStyle) (widgets.FontFamily, bool) {
	switch fs {
	case widgets.FontBold:
		return widgets.FontFamilyUI, true
	case widgets.FontNumber:
		return widgets.FontFamilyMono, true
	case widgets.FontMono:
		return widgets.FontFamilyMono, false
	default:
		return widgets.FontFamilyUI, false
	}
}

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

// extractFonts extracts the embedded TTF files to a temporary directory so
// opentype.Parse can read them from disk. The directory is removed by Close.
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
