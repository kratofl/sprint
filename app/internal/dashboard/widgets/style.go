package widgets

import "image/color"

// WidgetStyle holds the per-widget styling overrides applied on top of the
// layout theme. Only non-zero fields take effect; zero values fall through to
// the layout theme.
type WidgetStyle struct {
	// Font overrides the typeface used for value/data text elements
	// (those that normally use FontNumber or FontBold).
	Font FontStyle `json:"font,omitempty"`

	// FontSize is a global font-size multiplier for all text in this widget.
	// 0 and 1 both mean "use the default size".
	FontSize float64 `json:"fontSize,omitempty"`

	// TextColor overrides the "fg" semantic color (main value/text).
	TextColor *color.RGBA `json:"textColor,omitempty"`

	// LabelColor overrides the "muted" semantic color (label text).
	LabelColor *color.RGBA `json:"labelColor,omitempty"`

	// LabelFont overrides the typeface used for label text elements
	// (those that normally use FontLabel or FontMono).
	LabelFont FontStyle `json:"labelFont,omitempty"`

	// Background overrides the "surface" semantic color (panel background).
	Background *color.RGBA `json:"background,omitempty"`
}

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

// FontFamily selects the typeface family for a text element.
type FontFamily string

const (
	FontFamilyUI   FontFamily = "ui"   // Space Grotesk
	FontFamilyMono FontFamily = "mono" // JetBrains Mono
)

// TextStyle groups the presentation properties for a Text or GridCell element.
type TextStyle struct {
	Font       FontFamily `json:"font,omitempty"`
	FontSize   float64    `json:"fontSize,omitempty"`
	IsBold     bool       `json:"bold,omitempty"`
	TabulaNums bool       `json:"tabulaNums,omitempty"`
	HAlign     HAlign     `json:"hAlign,omitempty"`
	VAlign     VAlign     `json:"vAlign,omitempty"`
	Color      ColorExpr  `json:"color,omitempty"`
}

// ColorRef is a semantic color name resolved at render time.
// Generic values: "primary", "accent", "fg", "muted", "muted2", "success", "warning",
// "danger", "surface", "bg", "border", "rpmred".
// Domain values: "abs", "tc", "brakeBias", "energy", "motor", "brakeMig".
type ColorRef string

const (
	ColorRefPrimary    ColorRef = "primary"
	ColorRefAccent     ColorRef = "accent"
	ColorRefForeground ColorRef = "fg"
	ColorRefMuted      ColorRef = "muted"
	ColorRefSecondary  ColorRef = "muted2"
	ColorRefSuccess    ColorRef = "success"
	ColorRefWarning    ColorRef = "warning"
	ColorRefDanger     ColorRef = "danger"
	ColorRefSurface    ColorRef = "surface"
	ColorRefBackground ColorRef = "bg"
	ColorRefBorder     ColorRef = "border"
	ColorRefRPMRed     ColorRef = "rpmred"

	ColorRefABS       ColorRef = "abs"
	ColorRefTC        ColorRef = "tc"
	ColorRefBrakeBias ColorRef = "brakeBias"
	ColorRefEnergy    ColorRef = "energy"
	ColorRefMotor     ColorRef = "motor"
	ColorRefBrakeMig  ColorRef = "brakeMig"
)

// ColorWhen is one conditional override rule within a ColorExpr.
// The first matching rule wins; "matching" means the resolved binding value is
// truthy (> Above). Use Equals (non-nil pointer) for exact equality checks.
type ColorWhen struct {
	Binding Binding  `json:"binding"`
	Above   float64  `json:"above,omitempty"`
	Equals  *float64 `json:"equals,omitempty"`
	Ref     ColorRef `json:"ref"`
}

// ColorExpr describes how to pick a color for an element.
// Resolution order: When list (first match) → DynamicRef → Ref.
type ColorExpr struct {
	Ref        ColorRef    `json:"ref,omitempty"`
	DynamicRef Binding     `json:"dynamicRef,omitempty"`
	When       []ColorWhen `json:"when,omitempty"`
}

// Expr returns a simple static ColorExpr using this ref.
func (r ColorRef) Expr() ColorExpr { return ColorExpr{Ref: r} }

// When returns a conditional ColorExpr using this ref as the fallback color.
func (r ColorRef) When(conds ...ColorWhen) ColorExpr { return ColorExpr{Ref: r, When: conds} }

// ColorDynamic returns a ColorExpr whose color is resolved dynamically at render
// time via the named binding path (e.g. "flags.colorRef").
func ColorDynamic(dynamicRef Binding) ColorExpr { return ColorExpr{DynamicRef: dynamicRef} }

// WhenActive returns a ColorWhen that matches when the binding value is truthy (> 0).
func WhenActive(b Binding, ref ColorRef) ColorWhen {
	return ColorWhen{Binding: b, Ref: ref}
}

// WhenAbove returns a ColorWhen that matches when the binding value is above the threshold.
func WhenAbove(b Binding, above float64, ref ColorRef) ColorWhen {
	return ColorWhen{Binding: b, Above: above, Ref: ref}
}

// WhenEquals returns a ColorWhen that matches when the binding value equals val exactly.
func WhenEquals(b Binding, val float64, ref ColorRef) ColorWhen {
	v := val
	return ColorWhen{Binding: b, Equals: &v, Ref: ref}
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
	Property  Binding  `json:"property"`       // binding path (e.g. BindingCarBrakeBiasPct)
	Op        RuleOp   `json:"op"`             // comparison operator
	Threshold float64  `json:"threshold"`      // right-hand operand
	Color     ColorRef `json:"color"`          // semantic fill colour when matched
	Alpha     float64  `json:"alpha,omitempty"` // fill alpha 0–1; 0 = default 0.35
}

// SegColorStop defines the color for a segment bar above a given threshold.
// Thresholds are checked in order; the last stop whose At ≤ current RPM % wins.
type SegColorStop struct {
	At    float64  `json:"at"`
	Color ColorRef `json:"color"`
}
