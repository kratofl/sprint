package dashboard

import (
	"bytes"
	"image/png"

	"github.com/kratofl/sprint/pkg/dto"
)

// previewWidth and previewHeight are the dimensions for preview thumbnails.
// Smaller than the actual screen for fast generation and small file size.
const (
	previewWidth  = 400
	previewHeight = 240
)

// renderPreview renders a PNG thumbnail of the layout's first active page.
// Uses a zero-value TelemetryFrame (all fields zero/false) so no live data needed.
// Returns nil without error if layout has no pages.
func renderPreview(layout *DashLayout) ([]byte, error) {
	if len(layout.Pages) == 0 {
		return nil, nil
	}

	painter := NewPainter(previewWidth, previewHeight)
	defer painter.Close()

	painter.SetLayout(layout)
	painter.SetIdle(false)
	painter.SetActivePage(0)

	frame := &dto.TelemetryFrame{}
	img, err := painter.Paint(frame)
	if err != nil {
		return nil, err
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
