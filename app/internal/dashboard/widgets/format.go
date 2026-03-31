package widgets

import "fmt"

// FmtLap formats t (seconds) as "M:SS.mmm". Returns "-.---.---" when t ≤ 0.
func FmtLap(seconds float64) string {
	if seconds <= 0 {
		return "-.---.---"
	}
	m := int(seconds) / 60
	s := seconds - float64(m*60)
	return fmt.Sprintf("%d:%06.3f", m, s)
}

// FmtSector formats t (seconds) as "SS.mmm". Returns "--.---" when t ≤ 0.
func FmtSector(seconds float64) string {
	if seconds <= 0 {
		return "--.---"
	}
	return fmt.Sprintf("%.3f", seconds)
}
