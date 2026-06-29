package widgets

import "testing"

func TestTCWidgetRendersAsCenteredRingBadge(t *testing.T) {
	w, ok := Get(WidgetTC)
	if !ok {
		t.Fatal("tc widget not in registry")
	}

	elems := w.Definition(map[string]any{"tcMode": "tc1"})
	if len(elems) < 3 {
		t.Fatalf("tc widget returned %d elements, want a badge + label + value", len(elems))
	}

	// The TC widget is now a ring badge: a Badge ring, a small label, and the value
	// centred inside the ring. (PRD #106 #5)
	badge, ok := elems[0].(Badge)
	if !ok {
		t.Fatalf("tc first element type = %T, want Badge", elems[0])
	}
	if badge.Color.When == nil && badge.Color.Ref != ColorRefTC {
		t.Fatalf("tc badge colour ref = %q, want %q", badge.Color.Ref, ColorRefTC)
	}

	var label, value *Text
	for i := range elems {
		t, ok := elems[i].(Text)
		if !ok {
			continue
		}
		switch {
		case t.Binding != "":
			v := t
			value = &v
		case t.Text != "":
			l := t
			label = &l
		}
	}
	if label == nil || value == nil {
		t.Fatal("tc widget should expose a label Text and a bound value Text")
	}
	// Label is a small header near the top; value is centred (in the ring).
	if label.Y >= 0.3 {
		t.Fatalf("tc label Y = %.3f, want a small top-header value (<0.3)", label.Y)
	}
	if value.X != 0.5 || value.Y < 0.4 || value.Y > 0.6 {
		t.Fatalf("tc value position = (%.3f, %.3f), want centred (~0.5, ~0.5)", value.X, value.Y)
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
	if !text.Style.OpticalCenter {
		t.Fatal("gear text should opt into optical centering")
	}
}
