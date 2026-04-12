package widgets

import (
	"image/color"
)

// HAlign is the horizontal text alignment for an ElemText element.
type HAlign int

const (
	HAlignStart  HAlign = iota // left-aligned (default)
	HAlignCenter               // centred
	HAlignEnd                  // right-aligned
)

// VAlign is the vertical text alignment for an ElemText element.
type VAlign int

const (
	VAlignStart  VAlign = iota // top (default)
	VAlignCenter               // middle
	VAlignEnd                  // bottom
)

// FontStyle selects which font face to use for a text element.
type FontStyle string

const (
	FontLabel  FontStyle = "label"  // SpaceGrotesk-Regular
	FontBold   FontStyle = "bold"   // SpaceGrotesk-Bold
	FontNumber FontStyle = "number" // JetBrainsMono-Bold
	FontMono   FontStyle = "mono"   // JetBrainsMono-Regular
)

// ColorRef is a semantic color name resolved at render time.
// Generic values: "primary", "accent", "fg", "muted", "muted2", "success", "warning",
// "danger", "surface", "bg", "border", "rpmred".
// Domain values: "abs", "tc", "brakeBias", "energy", "motor", "brakeMig".
type ColorRef string

const (
	ColorRefABS      ColorRef = "abs"
	ColorRefTC       ColorRef = "tc"
	ColorRefBrakeBias ColorRef = "brakeBias"
	ColorRefEnergy   ColorRef = "energy"
	ColorRefMotor    ColorRef = "motor"
	ColorRefBrakeMig ColorRef = "brakeMig"
)

// ColorWhen is one conditional override rule within a ColorExpr.
// The first matching rule wins; "matching" means the resolved binding value is
// truthy (> Above). Use Equals (non-nil pointer) for exact equality checks.
type ColorWhen struct {
	Binding string   `json:"binding"`
	Above   float64  `json:"above,omitempty"`
	Equals  *float64 `json:"equals,omitempty"`
	Ref     ColorRef `json:"ref"`
}

// ColorExpr describes how to pick a color for an element.
// Resolution order: When list (first match) → DynamicRef → Ref.
type ColorExpr struct {
	Ref        ColorRef    `json:"ref,omitempty"`
	DynamicRef string      `json:"dynamicRef,omitempty"`
	When       []ColorWhen `json:"when,omitempty"`
}

// RuleOp is the comparison operator in a ConditionalRule.
type RuleOp string

const (
	RuleOpGT  RuleOp = ">"
	RuleOpLT  RuleOp = "<"
	RuleOpGTE RuleOp = ">="
	RuleOpLTE RuleOp = "<="
	RuleOpEQ  RuleOp = "=="
	RuleOpNEQ RuleOp = "!="
)

// ConditionalRule evaluates a telemetry binding against a threshold and, when
// the condition is satisfied, applies a semantic panel fill colour.
// Rules are stored per DashWidget and evaluated first-match-wins at render time.
type ConditionalRule struct {
	Property  string   `json:"property"`          // binding path (e.g. "car.brakeBiasPct")
	Op        RuleOp   `json:"op"`                // comparison operator
	Threshold float64  `json:"threshold"`          // right-hand operand
	Color     ColorRef `json:"color"`              // semantic fill colour when matched
	Alpha     float64  `json:"alpha,omitempty"`    // fill alpha 0–1; 0 = default 0.35
}

// SegColorStop defines the color for a segment bar above a given threshold.
// Thresholds are checked in order; the last stop whose At ≤ current RPM % wins.
type SegColorStop struct {
	At    float64  `json:"at"`
	Color ColorRef `json:"color"`
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
	Kind ElementKind `json:"kind"`

	// --- ElemPanel ---
	CornerR   float64  `json:"cornerR,omitempty"`
	FillColor ColorRef `json:"fillColor,omitempty"`
	FillAlpha float64  `json:"fillAlpha,omitempty"`
	NoBorder  bool     `json:"noBorder,omitempty"`

	// --- ElemText ---
	Text      string    `json:"text,omitempty"`
	Binding   string    `json:"binding,omitempty"`
	Format    string    `json:"format,omitempty"`
	Font      FontStyle `json:"font,omitempty"`
	FontScale float64   `json:"fontScale,omitempty"`
	// Zone is the semantic layout zone for the element within its widget.
	// When set, the painter derives pixel X/Y from Zone + HAlign instead of X/Y.
	// Values: "header", "fill", "fill:0"/"fill:1"/"fill:2"... (numbered fill rows), "footer".
	// An explicit X > 0 overrides the HAlign-derived horizontal position.
	// Leave empty for backward-compat absolute X/Y positioning.
	Zone   string  `json:"zone,omitempty"`
	X      float64 `json:"x,omitempty"`
	Y      float64 `json:"y,omitempty"`
	HAlign HAlign  `json:"hAlign,omitempty"`
	VAlign VAlign  `json:"vAlign,omitempty"`
	Color  ColorExpr `json:"color,omitempty"`

	// --- ElemDot ---
	DotX float64 `json:"dotX,omitempty"`
	DotY float64 `json:"dotY,omitempty"`
	DotR float64 `json:"dotR,omitempty"`

	// --- ElemHBar ---
	BarBinding  string    `json:"barBinding,omitempty"`
	BarX        float64   `json:"barX,omitempty"`
	BarY        float64   `json:"barY,omitempty"`
	BarW        float64   `json:"barW,omitempty"`
	BarH        float64   `json:"barH,omitempty"`
	BarCentered bool      `json:"barCentered,omitempty"`
	BarColor    ColorExpr `json:"barColor,omitempty"`
	BgColor     ColorRef  `json:"bgColor,omitempty"`

	// --- ElemDeltaBar (shares BarX/Y/W/H/BgColor with ElemHBar) ---
	MaxDelta float64   `json:"maxDelta,omitempty"`
	PosColor ColorExpr `json:"posColor,omitempty"`
	NegColor ColorExpr `json:"negColor,omitempty"`

	// --- ElemSegBar ---
	SegBinding string         `json:"segBinding,omitempty"`
	Segments   int            `json:"segments,omitempty"`
	SegStops   []SegColorStop `json:"segStops,omitempty"`

	// --- ElemCondition ---
	CondBinding string    `json:"condBinding,omitempty"`
	CondAbove   float64   `json:"condAbove,omitempty"`
	Then        []Element `json:"then,omitempty"`
	Else        []Element `json:"else,omitempty"`
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

// DomainPalette holds sim-racing domain-specific highlight colours.
// Each field maps to a domain ColorRef ("abs", "tc", "brakeBias", "energy", "motor", "brakeMig").
// Zero-value fields fall back to DefaultDomainPalette at render time.
type DomainPalette struct {
	ABS      color.RGBA `json:"abs"`
	TC       color.RGBA `json:"tc"`
	BrakeBias color.RGBA `json:"brakeBias"`
	Energy   color.RGBA `json:"energy"`
	Motor    color.RGBA `json:"motor"`
	BrakeMig color.RGBA `json:"brakeMig"`
}

// DefaultDomainPalette returns the built-in domain colour defaults.
func DefaultDomainPalette() DomainPalette {
	return DomainPalette{
		ABS:      ColWarning,
		TC:       ColTeal,
		BrakeBias: ColWarning,
		Energy:   ColSuccess,
		Motor:    ColAccent,
		BrakeMig: ColTeal,
	}
}

func domainColor(d DomainPalette, ref ColorRef) (color.RGBA, bool) {
	zero := color.RGBA{}
	switch ref {
	case ColorRefABS:
		if d.ABS != zero {
			return d.ABS, true
		}
		return DefaultDomainPalette().ABS, true
	case ColorRefTC:
		if d.TC != zero {
			return d.TC, true
		}
		return DefaultDomainPalette().TC, true
	case ColorRefBrakeBias:
		if d.BrakeBias != zero {
			return d.BrakeBias, true
		}
		return DefaultDomainPalette().BrakeBias, true
	case ColorRefEnergy:
		if d.Energy != zero {
			return d.Energy, true
		}
		return DefaultDomainPalette().Energy, true
	case ColorRefMotor:
		if d.Motor != zero {
			return d.Motor, true
		}
		return DefaultDomainPalette().Motor, true
	case ColorRefBrakeMig:
		if d.BrakeMig != zero {
			return d.BrakeMig, true
		}
		return DefaultDomainPalette().BrakeMig, true
	}
	return color.RGBA{}, false
}

// RenderTheme is the fully-resolved colour context for a single widget render.
// It holds all three colour layers and resolves them in priority order:
//  1. Overrides (per-widget)
//  2. Domain palette (layout-global domain colours)
//  3. Theme (generic semantic colours)
//  4. Built-in white fallback
type RenderTheme struct {
	Theme        DashTheme
	Domain       DomainPalette
	Overrides    map[ColorRef]color.RGBA // nil = no widget-level overrides
	FontScaleMul float64                 // 0 = default (1.0); multiplier for all text elements
}

// Resolve returns the concrete color.RGBA for ref, checking all layers.
func (rt RenderTheme) Resolve(ref ColorRef) color.RGBA {
	if rt.Overrides != nil {
		if c, ok := rt.Overrides[ref]; ok {
			return c
		}
	}
	if c, ok := domainColor(rt.Domain, ref); ok {
		return c
	}
	return ThemeColor(rt.Theme, ref)
}

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
