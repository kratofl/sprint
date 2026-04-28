package alerts

import (
	"fmt"

	"github.com/kratofl/sprint/pkg/dto"
)

const AlertTypeABS AlertType = "abs_change"

type absChangeAlert struct{}

func (absChangeAlert) Meta() AlertMeta {
	return AlertMeta{
		Type:              AlertTypeABS,
		Label:             "ABS Change",
		Description:       "Full-screen overlay when ABS setting changes.",
		DefaultColor:      "abs",
		CapabilityBinding: "electronics.absAvailable",
	}
}

func (absChangeAlert) Check(curr, prev *dto.TelemetryFrame, _ map[string]any) *AlertEvent {
	if prev == nil || curr.Electronics.ABS == prev.Electronics.ABS {
		return nil
	}
	return &AlertEvent{
		Text:  fmt.Sprintf("ABS  %d", curr.Electronics.ABS),
		Color: "abs",
	}
}

func init() { RegisterAlert(absChangeAlert{}) }
