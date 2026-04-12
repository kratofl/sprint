package alerts

import (
	"fmt"

	"github.com/kratofl/sprint/pkg/dto"
)

// TC1 — main TC map index

const AlertTypeTC AlertType = "tc_change"

type tcChangeAlert struct{}

func (tcChangeAlert) Meta() AlertMeta {
	return AlertMeta{
		Type:         AlertTypeTC,
		Label:        "TC Change",
		Description:  "Full-screen overlay when TC (main) setting changes.",
		DefaultColor: "tc",
	}
}

func (tcChangeAlert) Check(curr, prev *dto.TelemetryFrame, _ map[string]any) *AlertEvent {
	if prev == nil || curr.Electronics.TC == prev.Electronics.TC {
		return nil
	}
	return &AlertEvent{
		Text:  fmt.Sprintf("TC  %d", curr.Electronics.TC),
		Color: "tc",
	}
}

// TC2 — TC cut

const AlertTypeTC2 AlertType = "tc2_change"

type tc2ChangeAlert struct{}

func (tc2ChangeAlert) Meta() AlertMeta {
	return AlertMeta{
		Type:         AlertTypeTC2,
		Label:        "TC2 Change",
		Description:  "Full-screen overlay when TC2 (cut) setting changes.",
		DefaultColor: "tc",
	}
}

func (tc2ChangeAlert) Check(curr, prev *dto.TelemetryFrame, _ map[string]any) *AlertEvent {
	if prev == nil || curr.Electronics.TCCut == prev.Electronics.TCCut {
		return nil
	}
	return &AlertEvent{
		Text:  fmt.Sprintf("TC2  %d", curr.Electronics.TCCut),
		Color: "tc",
	}
}

// TC3 — TC slip

const AlertTypeTC3 AlertType = "tc3_change"

type tc3ChangeAlert struct{}

func (tc3ChangeAlert) Meta() AlertMeta {
	return AlertMeta{
		Type:         AlertTypeTC3,
		Label:        "TC3 Change",
		Description:  "Full-screen overlay when TC3 (slip) setting changes.",
		DefaultColor: "tc",
	}
}

func (tc3ChangeAlert) Check(curr, prev *dto.TelemetryFrame, _ map[string]any) *AlertEvent {
	if prev == nil || curr.Electronics.TCSlip == prev.Electronics.TCSlip {
		return nil
	}
	return &AlertEvent{
		Text:  fmt.Sprintf("TC3  %d", curr.Electronics.TCSlip),
		Color: "tc",
	}
}

func init() {
	RegisterAlert(tcChangeAlert{})
	RegisterAlert(tc2ChangeAlert{})
	RegisterAlert(tc3ChangeAlert{})
}
