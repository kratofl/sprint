package widgets

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
	Property  string   `json:"property"`       // binding path (e.g. "car.brakeBiasPct")
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
