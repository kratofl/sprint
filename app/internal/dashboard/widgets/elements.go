package widgets

import (
"encoding/json"
"fmt"
)

// ElementKind is the JSON discriminator for serialized elements.
type ElementKind string

const (
ElemPanel     ElementKind = "panel"
ElemText      ElementKind = "text"
ElemDot       ElementKind = "dot"
ElemHBar      ElementKind = "hbar"
ElemDeltaBar  ElementKind = "deltabar"
ElemSegBar    ElementKind = "segbar"
ElemGrid      ElementKind = "grid"
ElemCondition ElementKind = "condition"
)

// Element is implemented by all concrete visual primitive types.
// Use the concrete types directly: Text{}, Bar{}, Panel{}, etc.
// The painter dispatches on concrete type via a type switch.
type Element interface{ elemKind() ElementKind }

// Panel draws the widget background (border + optional fill overlay).
type Panel struct {
CornerR   float64  `json:"cornerR,omitempty"`
FillColor ColorRef `json:"fillColor,omitempty"`
FillAlpha float64  `json:"fillAlpha,omitempty"`
NoBorder  bool     `json:"noBorder,omitempty"`
}

func (Panel) elemKind() ElementKind { return ElemPanel }

func (v Panel) MarshalJSON() ([]byte, error) {
type alias Panel
return marshalWithKind(ElemPanel, alias(v))
}

// Text draws a text string (static or data-bound) within the widget.
// Text elements are distributed vertically by the painter based on their count
// in the element list (auto-stacking). Use Grid for multi-column layouts.
type Text struct {
Text    string    `json:"text,omitempty"`
Binding Binding   `json:"binding,omitempty"`
Format  string    `json:"format,omitempty"`
Style   TextStyle `json:"style,omitempty"`
}

func (Text) elemKind() ElementKind { return ElemText }

func (v Text) MarshalJSON() ([]byte, error) {
type alias Text
return marshalWithKind(ElemText, alias(v))
}

// Dot draws a filled circle at fractional position within the widget.
type Dot struct {
X     float64   `json:"dotX,omitempty"`
Y     float64   `json:"dotY,omitempty"`
R     float64   `json:"dotR,omitempty"`
Color ColorExpr `json:"color,omitempty"`
}

func (Dot) elemKind() ElementKind { return ElemDot }

func (v Dot) MarshalJSON() ([]byte, error) {
type alias Dot
return marshalWithKind(ElemDot, alias(v))
}

// Bar draws a horizontal fill bar (normal or centred-fraction for e.g. steering).
// X, Y, W, H are fractions of the widget bounding box (Y and H relative to height).
type Bar struct {
Binding  Binding   `json:"barBinding,omitempty"`
X        float64   `json:"barX,omitempty"`
Y        float64   `json:"barY,omitempty"`
W        float64   `json:"barW,omitempty"`
H        float64   `json:"barH,omitempty"`
Centered bool      `json:"barCentered,omitempty"`
Color    ColorExpr `json:"barColor,omitempty"`
BgColor  ColorRef  `json:"bgColor,omitempty"`
}

func (Bar) elemKind() ElementKind { return ElemHBar }

func (v Bar) MarshalJSON() ([]byte, error) {
type alias Bar
return marshalWithKind(ElemHBar, alias(v))
}

// DeltaBar draws a signed centred bar (lap delta indicator).
type DeltaBar struct {
Binding  Binding   `json:"barBinding,omitempty"`
X        float64   `json:"barX,omitempty"`
Y        float64   `json:"barY,omitempty"`
W        float64   `json:"barW,omitempty"`
H        float64   `json:"barH,omitempty"`
MaxDelta float64   `json:"maxDelta,omitempty"`
PosColor ColorExpr `json:"posColor,omitempty"`
NegColor ColorExpr `json:"negColor,omitempty"`
BgColor  ColorRef  `json:"bgColor,omitempty"`
}

func (DeltaBar) elemKind() ElementKind { return ElemDeltaBar }

func (v DeltaBar) MarshalJSON() ([]byte, error) {
type alias DeltaBar
return marshalWithKind(ElemDeltaBar, alias(v))
}

// SegBar draws a vertical segmented bar (e.g. RPM indicator).
type SegBar struct {
Binding  Binding        `json:"segBinding,omitempty"`
Segments int            `json:"segments,omitempty"`
Stops    []SegColorStop `json:"segStops,omitempty"`
}

func (SegBar) elemKind() ElementKind { return ElemSegBar }

func (v SegBar) MarshalJSON() ([]byte, error) {
type alias SegBar
return marshalWithKind(ElemSegBar, alias(v))
}

// Grid draws an NxM grid of cells. ColWidths optionally specifies per-column
// fractional widths (len must equal Cols); omit for equal-width columns.
type Grid struct {
Rows      int        `json:"gridRows,omitempty"`
Cols      int        `json:"gridCols,omitempty"`
Gap       float64    `json:"gridGap,omitempty"`
Lines     bool       `json:"gridLines,omitempty"`
ColWidths []float64  `json:"colWidths,omitempty"`
Cells     []GridCell `json:"gridCells,omitempty"`
}

func (Grid) elemKind() ElementKind { return ElemGrid }

func (v Grid) MarshalJSON() ([]byte, error) {
type alias Grid
return marshalWithKind(ElemGrid, alias(v))
}

// Condition renders Then or Else sub-elements based on a data binding value.
type Condition struct {
Binding Binding     `json:"condBinding,omitempty"`
Above   float64     `json:"condAbove,omitempty"`
Then    ElementList `json:"then,omitempty"`
Else    ElementList `json:"else,omitempty"`
}

func (Condition) elemKind() ElementKind { return ElemCondition }

func (v Condition) MarshalJSON() ([]byte, error) {
type alias Condition
return marshalWithKind(ElemCondition, alias(v))
}

// GridCell defines one cell in a Grid element.
type GridCell struct {
Text       string    `json:"text,omitempty"`
Style      TextStyle `json:"style,omitempty"`
Label      string    `json:"label,omitempty"`
Binding    Binding   `json:"binding,omitempty"`
Format     string    `json:"format,omitempty"`
Color      ColorExpr `json:"color,omitempty"`
LabelColor ColorExpr `json:"labelColor,omitempty"`
ColorFn    string    `json:"colorFn,omitempty"`
}

// ElementList is a JSON-serializable slice of Element values.
// Use this type for any []Element that needs to round-trip through JSON
// (WidgetMeta.DefaultDefinition, Condition.Then/Else).
// Internal painter slices can use plain []Element.
type ElementList []Element

func (el ElementList) MarshalJSON() ([]byte, error) {
arr := make([]json.RawMessage, len(el))
for i, e := range el {
b, err := marshalElement(e)
if err != nil {
return nil, fmt.Errorf("element %d: %w", i, err)
}
arr[i] = b
}
return json.Marshal(arr)
}

func (el *ElementList) UnmarshalJSON(b []byte) error {
var raws []json.RawMessage
if err := json.Unmarshal(b, &raws); err != nil {
return err
}
*el = make(ElementList, 0, len(raws))
for i, raw := range raws {
e, err := unmarshalElement(raw)
if err != nil {
return fmt.Errorf("element %d: %w", i, err)
}
*el = append(*el, e)
}
return nil
}

// marshalElement serializes a single Element to JSON, injecting the "kind" discriminator.
func marshalElement(e Element) ([]byte, error) {
b, err := json.Marshal(e)
if err != nil {
return nil, err
}
return b, nil
}

// unmarshalElement parses a single element JSON blob using the "kind" discriminator.
func unmarshalElement(raw json.RawMessage) (Element, error) {
var kindOnly struct {
Kind ElementKind `json:"kind"`
}
if err := json.Unmarshal(raw, &kindOnly); err != nil {
return nil, err
}
switch kindOnly.Kind {
case ElemPanel:
var v Panel
return v, json.Unmarshal(raw, &v)
case ElemText:
var v Text
return v, json.Unmarshal(raw, &v)
case ElemDot:
var v Dot
return v, json.Unmarshal(raw, &v)
case ElemHBar:
var v Bar
return v, json.Unmarshal(raw, &v)
case ElemDeltaBar:
var v DeltaBar
return v, json.Unmarshal(raw, &v)
case ElemSegBar:
var v SegBar
return v, json.Unmarshal(raw, &v)
case ElemGrid:
var v Grid
return v, json.Unmarshal(raw, &v)
case ElemCondition:
var v Condition
return v, json.Unmarshal(raw, &v)
default:
return nil, fmt.Errorf("unknown element kind: %q", kindOnly.Kind)
}
}

// marshalWithKind marshals v as a JSON object and injects "kind" as the first field.
func marshalWithKind(kind ElementKind, v any) ([]byte, error) {
b, err := json.Marshal(v)
if err != nil {
return nil, err
}
kindJSON, _ := json.Marshal(string(kind))
// Inject "kind":xxx after the opening '{'.
// b is guaranteed to start with '{' from json.Marshal on a struct.
result := make([]byte, 0, 10+len(kindJSON)+len(b))
result = append(result, '{')
result = append(result, '"', 'k', 'i', 'n', 'd', '"', ':')
result = append(result, kindJSON...)
if b[1] != '}' {
result = append(result, ',')
}
result = append(result, b[1:]...)
return result, nil
}