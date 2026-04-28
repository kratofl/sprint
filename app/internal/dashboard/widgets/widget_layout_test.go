package widgets

import "testing"

func TestTCWidgetUsesCompactExplicitTextPositions(t *testing.T) {
	w, ok := Get(WidgetTC)
	if !ok {
		t.Fatal("tc widget not in registry")
	}

	elems := w.Definition(map[string]any{"tcMode": "tc1"})
	if len(elems) < 2 {
		t.Fatalf("tc widget returned %d elements, want at least 2", len(elems))
	}

	label, ok := elems[0].(Text)
	if !ok {
		t.Fatalf("tc label element type = %T, want Text", elems[0])
	}
	value, ok := elems[1].(Text)
	if !ok {
		t.Fatalf("tc value element type = %T, want Text", elems[1])
	}

	if label.X != 0.015 || label.Y != 0.035 {
		t.Fatalf("tc label position = (%.3f, %.3f), want (0.015, 0.035)", label.X, label.Y)
	}
	if label.Style.FontSize != 0.13 || label.Style.VAlign != VAlignStart {
		t.Fatalf("tc label style = fontSize %.2f vAlign %d, want fontSize 0.13 vAlign start", label.Style.FontSize, label.Style.VAlign)
	}

	if value.X != 0.5 || value.Y != 0.56 {
		t.Fatalf("tc value position = (%.3f, %.3f), want (0.500, 0.560)", value.X, value.Y)
	}
	if value.Style.FontSize != 0.52 {
		t.Fatalf("tc value fontSize = %.2f, want 0.52", value.Style.FontSize)
	}
	if value.Style.HAlign != HAlignCenter || value.Style.VAlign != VAlignCenter {
		t.Fatalf("tc value alignment = hAlign %d vAlign %d, want center/center", value.Style.HAlign, value.Style.VAlign)
	}
}

func TestGearWidgetUsesGeometricCenterTextPosition(t *testing.T) {
	w, ok := Get(WidgetGear)
	if !ok {
		t.Fatal("gear widget not in registry")
	}

	elems := w.Definition(nil)
	if len(elems) != 1 {
		t.Fatalf("gear widget returned %d elements, want 1", len(elems))
	}

	text, ok := elems[0].(Text)
	if !ok {
		t.Fatalf("gear element type = %T, want Text", elems[0])
	}

	if text.X != 0.5 || text.Y != 0.5 {
		t.Fatalf("gear text position = (%.3f, %.3f), want (0.500, 0.500)", text.X, text.Y)
	}
	if text.Style.HAlign != HAlignCenter || text.Style.VAlign != VAlignCenter {
		t.Fatalf("gear alignment = hAlign %d vAlign %d, want center/center", text.Style.HAlign, text.Style.VAlign)
	}
}
