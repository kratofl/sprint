package widgets

import (
	"encoding/json"
	"image/color"
)

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

func (t DashTheme) IsZero() bool {
	return t == (DashTheme{})
}

func (t DashTheme) MarshalJSON() ([]byte, error) {
	values := map[string]color.RGBA{}
	if t.Primary != (color.RGBA{}) {
		values["primary"] = t.Primary
	}
	if t.Accent != (color.RGBA{}) {
		values["accent"] = t.Accent
	}
	if t.Fg != (color.RGBA{}) {
		values["fg"] = t.Fg
	}
	if t.Muted != (color.RGBA{}) {
		values["muted"] = t.Muted
	}
	if t.Muted2 != (color.RGBA{}) {
		values["muted2"] = t.Muted2
	}
	if t.Success != (color.RGBA{}) {
		values["success"] = t.Success
	}
	if t.Warning != (color.RGBA{}) {
		values["warning"] = t.Warning
	}
	if t.Danger != (color.RGBA{}) {
		values["danger"] = t.Danger
	}
	if t.Surface != (color.RGBA{}) {
		values["surface"] = t.Surface
	}
	if t.Bg != (color.RGBA{}) {
		values["bg"] = t.Bg
	}
	if t.Border != (color.RGBA{}) {
		values["border"] = t.Border
	}
	if t.RPMRed != (color.RGBA{}) {
		values["rpmRed"] = t.RPMRed
	}
	return json.Marshal(values)
}

// DefaultTheme returns the default DashTheme matching the Sprint design tokens.
func DefaultTheme() DashTheme {
	return DashTheme{
		Primary: ColorPrimary,
		Accent:  ColorAccent,
		Fg:      ColorForeground,
		Muted:   ColorMuted,
		Muted2:  ColorSecondary,
		Success: ColorSuccess,
		Warning: ColorWarning,
		Danger:  ColorDanger,
		Surface: ColorSurface,
		Bg:      ColorBackground,
		Border:  ColorBorder,
		RPMRed:  ColorRPMRed,
	}
}

// DomainPalette holds sim-racing domain-specific highlight colours.
// Each field maps to a domain ColorRef ("abs", "tc", "brakeBias", "energy", "motor", "brakeMig").
// Zero-value fields fall back to DefaultDomainPalette at render time.
type DomainPalette struct {
	ABS       color.RGBA `json:"abs"`
	TC        color.RGBA `json:"tc"`
	BrakeBias color.RGBA `json:"brakeBias"`
	Energy    color.RGBA `json:"energy"`
	Motor     color.RGBA `json:"motor"`
	BrakeMig  color.RGBA `json:"brakeMig"`
}

func (d DomainPalette) IsZero() bool {
	return d == (DomainPalette{})
}

func (d DomainPalette) MarshalJSON() ([]byte, error) {
	values := map[string]color.RGBA{}
	if d.ABS != (color.RGBA{}) {
		values["abs"] = d.ABS
	}
	if d.TC != (color.RGBA{}) {
		values["tc"] = d.TC
	}
	if d.BrakeBias != (color.RGBA{}) {
		values["brakeBias"] = d.BrakeBias
	}
	if d.Energy != (color.RGBA{}) {
		values["energy"] = d.Energy
	}
	if d.Motor != (color.RGBA{}) {
		values["motor"] = d.Motor
	}
	if d.BrakeMig != (color.RGBA{}) {
		values["brakeMig"] = d.BrakeMig
	}
	return json.Marshal(values)
}

// TypographySettings holds dash-level font defaults applied beneath per-widget
// overrides. Zero values fall back to the next typography layer.
type TypographySettings struct {
	Font      FontStyle `json:"font,omitempty"`
	LabelFont FontStyle `json:"labelFont,omitempty"`
	FontScale float64   `json:"fontScale,omitempty"`
}

// DefaultDomainPalette returns the built-in domain colour defaults.
func DefaultDomainPalette() DomainPalette {
	return DomainPalette{
		ABS:       ColorWarning,
		TC:        ColorAccent,
		BrakeBias: ColorWarning,
		Energy:    ColorSuccess,
		Motor:     ColorPrimary,
		BrakeMig:  ColorAccent,
	}
}

// MergeTheme overlays sparse theme overrides onto a fully-resolved base theme.
func MergeTheme(base, override DashTheme) DashTheme {
	if override.Primary != (color.RGBA{}) {
		base.Primary = override.Primary
	}
	if override.Accent != (color.RGBA{}) {
		base.Accent = override.Accent
	}
	if override.Fg != (color.RGBA{}) {
		base.Fg = override.Fg
	}
	if override.Muted != (color.RGBA{}) {
		base.Muted = override.Muted
	}
	if override.Muted2 != (color.RGBA{}) {
		base.Muted2 = override.Muted2
	}
	if override.Success != (color.RGBA{}) {
		base.Success = override.Success
	}
	if override.Warning != (color.RGBA{}) {
		base.Warning = override.Warning
	}
	if override.Danger != (color.RGBA{}) {
		base.Danger = override.Danger
	}
	if override.Surface != (color.RGBA{}) {
		base.Surface = override.Surface
	}
	if override.Bg != (color.RGBA{}) {
		base.Bg = override.Bg
	}
	if override.Border != (color.RGBA{}) {
		base.Border = override.Border
	}
	if override.RPMRed != (color.RGBA{}) {
		base.RPMRed = override.RPMRed
	}
	return base
}

// MergeDomainPalette overlays sparse domain colour overrides onto a resolved base palette.
func MergeDomainPalette(base, override DomainPalette) DomainPalette {
	if override.ABS != (color.RGBA{}) {
		base.ABS = override.ABS
	}
	if override.TC != (color.RGBA{}) {
		base.TC = override.TC
	}
	if override.BrakeBias != (color.RGBA{}) {
		base.BrakeBias = override.BrakeBias
	}
	if override.Energy != (color.RGBA{}) {
		base.Energy = override.Energy
	}
	if override.Motor != (color.RGBA{}) {
		base.Motor = override.Motor
	}
	if override.BrakeMig != (color.RGBA{}) {
		base.BrakeMig = override.BrakeMig
	}
	return base
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
//  1. Style overrides (per-widget)
//  2. Domain palette (layout-global domain colours)
//  3. Theme (generic semantic colours)
//  4. Built-in white fallback
type RenderTheme struct {
	Theme            DashTheme
	Domain           DomainPalette
	Style            WidgetStyle // per-widget style overrides
	Typography       TypographySettings
	GlobalTypography TypographySettings
}

// FontScale returns the font-size multiplier from the widget style.
// Returns 1.0 when no override is set.
func (rt RenderTheme) FontScale() float64 {
	if rt.Style.FontSize > 0 {
		return rt.Style.FontSize
	}
	if rt.Typography.FontScale > 0 {
		return rt.Typography.FontScale
	}
	if rt.GlobalTypography.FontScale > 0 {
		return rt.GlobalTypography.FontScale
	}
	return 1.0
}

// ResolveFont returns the font to use for a given element font, applying
// per-widget font overrides when set. Value/data fonts (FontNumber, FontBold)
// use Style.Font; label fonts (FontLabel, FontMono) use Style.LabelFont.
func (rt RenderTheme) ResolveFont(elemFont FontStyle) FontStyle {
	switch elemFont {
	case FontNumber, FontBold:
		if rt.Style.Font != "" {
			return rt.Style.Font
		}
		if rt.Typography.Font != "" {
			return rt.Typography.Font
		}
		if rt.GlobalTypography.Font != "" {
			return rt.GlobalTypography.Font
		}
	case FontLabel, FontMono:
		if rt.Style.LabelFont != "" {
			return rt.Style.LabelFont
		}
		if rt.Typography.LabelFont != "" {
			return rt.Typography.LabelFont
		}
		if rt.GlobalTypography.LabelFont != "" {
			return rt.GlobalTypography.LabelFont
		}
	}
	return elemFont
}

// Resolve returns the concrete color.RGBA for ref, checking all layers.
func (rt RenderTheme) Resolve(ref ColorRef) color.RGBA {
	switch ref {
	case "fg":
		if rt.Style.TextColor != nil {
			return *rt.Style.TextColor
		}
	case "muted":
		if rt.Style.LabelColor != nil {
			return *rt.Style.LabelColor
		}
	case "surface":
		if rt.Style.Background != nil {
			return *rt.Style.Background
		}
	}
	if c, ok := domainColor(rt.Domain, ref); ok {
		return c
	}
	return ThemeColor(rt.Theme, ref)
}

// ThemeColor looks up ref in theme, returning white for unknown refs so
// rendering remains visible even with misconfigured layouts.
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
