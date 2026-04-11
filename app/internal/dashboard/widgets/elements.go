package widgets

import (
	"image/color"
)

// FontStyle selects which font face to use for a text element.
type FontStyle string

const (
	FontLabel  FontStyle = "label"  // SpaceGrotesk-Regular
	FontBold   FontStyle = "bold"   // SpaceGrotesk-Bold
	FontNumber FontStyle = "number" // JetBrainsMono-Bold
	FontMono   FontStyle = "mono"   // JetBrainsMono-Regular
)

// ColorRef is a semantic color name resolved against a DashTheme at render time.
// Values: "primary", "accent", "fg", "muted", "muted2", "success", "warning",
// "danger", "surface", "bg", "border", "rpmred".
type ColorRef string

// ColorWhen is one conditional override rule within a ColorExpr.
// The first matching rule wins; "matching" means the resolved binding value is
// truthy (> Above). Use Equals (non-nil pointer) for exact equality checks.
type ColorWhen struct {
	Binding string   // dot-path to resolve from the frame
	Above   float64  // trigger when resolved value > Above; default 0 = any truthy
	Equals  *float64 // trigger when resolved value == Equals (exclusive with Above)
	Ref     ColorRef // color to apply when the condition matches
}

// ColorExpr describes how to pick a color for an element.
// Resolution order: When list (first match) → DynamicRef → Ref.
type ColorExpr struct {
	Ref        ColorRef    // static semantic name; used when nothing else matches
	DynamicRef string      // binding path that returns a ColorRef string at runtime
	When       []ColorWhen // conditional overrides, evaluated in order
}

// SegColorStop defines the color for a segment bar above a given threshold.
// Thresholds are checked in order; the last stop whose At ≤ current RPM % wins.
type SegColorStop struct {
	At    float64  // 0–1 threshold (e.g. 0.85 = 85% RPM)
	Color ColorRef // semantic color to use above this threshold
}

// ElementKind is the discriminator for an Element.
type ElementKind string

const (
	// ElemPanel draws the widget background with a border.
	ElemPanel ElementKind = "panel"
	// ElemText draws a text string at a fractional position within the widget.
	ElemText ElementKind = "text"
	// ElemDot draws a filled circle.
	ElemDot ElementKind = "dot"
	// ElemHBar draws a horizontal fill bar (0–1 or centred-fraction for steering).
	ElemHBar ElementKind = "hbar"
	// ElemDeltaBar draws a signed centred bar (lap delta).
	ElemDeltaBar ElementKind = "deltabar"
	// ElemSegBar draws a vertical segmented bar (RPM indicator).
	ElemSegBar ElementKind = "segbar"
	// ElemTyreGrid draws the 2×2 tyre temperature grid with gradient colouring.
	ElemTyreGrid ElementKind = "tyre_grid"
	// ElemCondition renders Then or Else sub-elements based on a binding value.
	ElemCondition ElementKind = "condition"
)

// Element is a single visual primitive in a widget definition.
// Only the fields relevant to the element's Kind need to be populated.
//
// Positions (X, Y, BarX, BarY, DotX, DotY) are fractions of the widget's
// bounding box (0 = left/top, 1 = right/bottom).
// Sizes (FontScale, BarW, BarH, DotR) are fractions of the widget height.
type Element struct {
	Kind ElementKind

	// --- ElemPanel ---
	CornerR   float64  // corner radius in pixels; 0 = sharp
	FillColor ColorRef // optional coloured background flush (e.g. ABS active)
	FillAlpha float64  // 0–1 alpha multiplier for FillColor
	NoBorder  bool     // suppress the border ring (use with FillColor overlays)

	// --- ElemText ---
	Text      string    // static display string; overridden by Binding when set
	Binding   string    // dot-path to telemetry field (see binding.go)
	Format    string    // named formatter or sprintf pattern (see format.go)
	Font      FontStyle // font face selector
	FontScale float64   // font size = FontScale × widget height
	X         float64   // horizontal anchor point (fraction of widget width)
	Y         float64   // vertical anchor point (fraction of widget height)
	AnchorX   float64   // 0=left-aligned, 0.5=centred, 1=right-aligned
	AnchorY   float64   // 0=top, 0.5=middle, 1=bottom
	Color     ColorExpr

	// --- ElemDot ---
	DotX float64  // centre X as fraction of widget width
	DotY float64  // centre Y as fraction of widget height
	DotR float64  // radius as fraction of widget height

	// --- ElemHBar ---
	BarBinding  string    // dot-path; value must be 0–1
	BarX        float64   // bar left edge as fraction of widget width
	BarY        float64   // bar top edge as fraction of widget height
	BarW        float64   // bar width as fraction of widget width
	BarH        float64   // bar height as fraction of widget height
	BarCentered bool      // if true: 0.5 = centre, <0.5 fills left, >0.5 fills right
	BarColor    ColorExpr
	BgColor     ColorRef // bar track colour; defaults to "surface"

	// --- ElemDeltaBar (shares BarX/Y/W/H/BgColor with ElemHBar) ---
	// BarBinding resolves to a signed float (seconds); ±MaxDelta maps to ±50% fill.
	MaxDelta float64    // scale factor; e.g. 2.0 means ±2 s fills the half-width
	PosColor ColorExpr  // colour for the positive (over-target) side
	NegColor ColorExpr  // colour for the negative (under-target) side

	// --- ElemSegBar ---
	SegBinding string         // dot-path; value must be 0–1
	Segments   int            // number of segments (default 20)
	SegStops   []SegColorStop // colour thresholds, checked low→high

	// --- ElemCondition ---
	CondBinding string    // dot-path to evaluate
	CondAbove   float64   // condition is true when resolved value > CondAbove
	Then        []Element // elements rendered when condition is true
	Else        []Element // elements rendered when condition is false
}

// DashTheme holds the semantic colour palette for a dashboard layout.
// Widgets reference colours by semantic name (ColorRef); the painter resolves
// them to actual colour.RGBA values using this struct.
type DashTheme struct {
	Primary color.RGBA `json:"primary"` // driver highlight – orange
	Accent  color.RGBA `json:"accent"`  // comparison / system – teal
	Fg      color.RGBA `json:"fg"`      // main value text – white
	Muted   color.RGBA `json:"muted"`   // section labels
	Muted2  color.RGBA `json:"muted2"`  // secondary text
	Success color.RGBA `json:"success"`
	Warning color.RGBA `json:"warning"`
	Danger  color.RGBA `json:"danger"`
	Surface color.RGBA `json:"surface"` // bar track / container surface
	Bg      color.RGBA `json:"bg"`      // canvas background
	Border  color.RGBA `json:"border"`  // panel outline
	RPMRed  color.RGBA `json:"rpmRed"`  // RPM bar >92% zone
}

// DefaultTheme returns the default DashTheme matching the Sprint design tokens.
func DefaultTheme() DashTheme {
	return DashTheme{
		Primary: ColAccent,
		Accent:  ColTeal,
		Fg:      ColTextPri,
		Muted:   ColTextMuted,
		Muted2:  ColTextSec,
		Success: ColSuccess,
		Warning: ColWarning,
		Danger:  ColDanger,
		Surface: ColSurface,
		Bg:      ColBg,
		Border:  ColBorder,
		RPMRed:  ColRPMRed,
	}
}

// ThemeColor resolves a ColorRef to a concrete color.RGBA from theme.
// Unknown refs return white so the rendering remains visible.
func ThemeColor(theme DashTheme, ref ColorRef) color.RGBA {
	switch ref {
	case "primary":
		return theme.Primary
	case "accent":
		return theme.Accent
	case "fg":
		return theme.Fg
	case "muted":
		return theme.Muted
	case "muted2":
		return theme.Muted2
	case "success":
		return theme.Success
	case "warning":
		return theme.Warning
	case "danger":
		return theme.Danger
	case "surface":
		return theme.Surface
	case "bg":
		return theme.Bg
	case "border":
		return theme.Border
	case "rpmred":
		return theme.RPMRed
	default:
		return color.RGBA{R: 255, G: 255, B: 255, A: 255}
	}
}
