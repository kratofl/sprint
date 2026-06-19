package alerts

import (
	"testing"

	"github.com/kratofl/sprint/pkg/dto"
)

func TestTCAlertsUseCorrectChannelAndLabel(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		alertType AlertType
		mutate    func(*dto.TelemetryFrame)
		wantText  string
	}{
		{
			name:      "tc1",
			alertType: AlertTypeTC,
			mutate:    func(f *dto.TelemetryFrame) { f.Electronics.TC = 3 },
			wantText:  "TC1  3",
		},
		{
			name:      "tc2",
			alertType: AlertTypeTC2,
			mutate:    func(f *dto.TelemetryFrame) { f.Electronics.TCCut = 5 },
			wantText:  "TC2  5",
		},
		{
			name:      "tc3",
			alertType: AlertTypeTC3,
			mutate:    func(f *dto.TelemetryFrame) { f.Electronics.TCSlip = 7 },
			wantText:  "TC3  7",
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			prev := baselineTCFrame()
			curr := *prev
			tc.mutate(&curr)

			a, ok := GetAlert(tc.alertType)
			if !ok {
				t.Fatalf("alert %q not registered", tc.alertType)
			}
			got := a.Check(&curr, prev, nil)
			if got == nil {
				t.Fatalf("expected alert event for %q channel change", tc.alertType)
			}
			if got.Text != tc.wantText {
				t.Fatalf("alert text = %q, want %q", got.Text, tc.wantText)
			}
		})
	}
}

func TestTCAlertsIgnoreOtherTCChannels(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name      string
		alertType AlertType
		mutate    func(*dto.TelemetryFrame)
	}{
		{
			name:      "tc1 ignores tc3",
			alertType: AlertTypeTC,
			mutate:    func(f *dto.TelemetryFrame) { f.Electronics.TCSlip++ },
		},
		{
			name:      "tc2 ignores tc1",
			alertType: AlertTypeTC2,
			mutate:    func(f *dto.TelemetryFrame) { f.Electronics.TC++ },
		},
		{
			name:      "tc3 ignores tc2",
			alertType: AlertTypeTC3,
			mutate:    func(f *dto.TelemetryFrame) { f.Electronics.TCCut++ },
		},
	}

	for _, tc := range cases {
		tc := tc
		t.Run(tc.name, func(t *testing.T) {
			prev := baselineTCFrame()
			curr := *prev
			tc.mutate(&curr)

			a, ok := GetAlert(tc.alertType)
			if !ok {
				t.Fatalf("alert %q not registered", tc.alertType)
			}
			if got := a.Check(&curr, prev, nil); got != nil {
				t.Fatalf("expected no alert event, got %q", got.Text)
			}
		})
	}
}

func TestTCAlertsPriorityWhenMultipleChannelsChange(t *testing.T) {
	t.Parallel()

	prev := baselineTCFrame()
	curr := *prev
	curr.Electronics.TC++
	curr.Electronics.TCCut++
	curr.Electronics.TCSlip++

	tc1, ok := GetAlert(AlertTypeTC)
	if !ok {
		t.Fatalf("alert %q not registered", AlertTypeTC)
	}
	tc2, ok := GetAlert(AlertTypeTC2)
	if !ok {
		t.Fatalf("alert %q not registered", AlertTypeTC2)
	}
	tc3, ok := GetAlert(AlertTypeTC3)
	if !ok {
		t.Fatalf("alert %q not registered", AlertTypeTC3)
	}

	if got := tc1.Check(&curr, prev, nil); got == nil {
		t.Fatal("expected TC1 alert when all channels change")
	}
	if got := tc2.Check(&curr, prev, nil); got != nil {
		t.Fatalf("expected TC2 alert to be suppressed by TC1 change, got %q", got.Text)
	}
	if got := tc3.Check(&curr, prev, nil); got != nil {
		t.Fatalf("expected TC3 alert to be suppressed by TC1/TC2 change, got %q", got.Text)
	}
}

func baselineTCFrame() *dto.TelemetryFrame {
	return &dto.TelemetryFrame{
		Electronics: dto.Electronics{
			TC:              2,
			TCCut:           4,
			TCSlip:          6,
			TCAvailable:     true,
			TCCutAvailable:  true,
			TCSlipAvailable: true,
		},
	}
}
