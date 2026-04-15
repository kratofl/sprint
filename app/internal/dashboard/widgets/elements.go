package widgets

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
	Zone   string    `json:"zone,omitempty"`
	X      float64   `json:"x,omitempty"`
	Y      float64   `json:"y,omitempty"`
	HAlign HAlign    `json:"hAlign,omitempty"`
	VAlign VAlign    `json:"vAlign,omitempty"`
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

