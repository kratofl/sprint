package alerts

import (
	"fmt"

	"github.com/kratofl/sprint/pkg/dto"
)

const AlertTypeEngineMap AlertType = "enginemap_change"

type engineMapChangeAlert struct{}

func (engineMapChangeAlert) Meta() AlertMeta {
	return AlertMeta{
		Type:         AlertTypeEngineMap,
		Label:        "Engine Map Change",
		Description:  "Full-screen overlay when engine map setting changes.",
		DefaultColor: "motor",
	}
}

func (engineMapChangeAlert) Check(curr, prev *dto.TelemetryFrame, _ map[string]any) *AlertEvent {
	if prev == nil || curr.Electronics.MotorMap == prev.Electronics.MotorMap {
		return nil
	}
	return &AlertEvent{
		Text:  fmt.Sprintf("MAP  %d", curr.Electronics.MotorMap),
		Color: "motor",
	}
}

func init() { RegisterAlert(engineMapChangeAlert{}) }
