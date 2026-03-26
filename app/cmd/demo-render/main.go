// Command demo-render generates a sample dashboard PNG with realistic telemetry data.
//
// Usage:
//
//	go run ./cmd/demo-render              → writes demo_dash.png
//	go run ./cmd/demo-render -o out.png   → writes out.png
package main

import (
	"flag"
	"fmt"
	"image/png"
	"os"
	"time"

	"github.com/kratofl/sprint/app/internal/vocore"
	"github.com/kratofl/sprint/pkg/dto"
)

func main() {
	outFile := flag.String("o", "demo_dash.png", "output PNG file path")
	flag.Parse()

	frame := demoFrame()
	renderer := vocore.NewDashRenderer(800, 480)

	img, err := renderer.RenderFrame(frame)
	if err != nil {
		fmt.Fprintf(os.Stderr, "render failed: %v\n", err)
		os.Exit(1)
	}

	f, err := os.Create(*outFile)
	if err != nil {
		fmt.Fprintf(os.Stderr, "create file: %v\n", err)
		os.Exit(1)
	}
	defer f.Close()

	if err := png.Encode(f, img); err != nil {
		fmt.Fprintf(os.Stderr, "encode PNG: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("✓ %s (800×480)\n", *outFile)
}

// demoFrame returns a realistic telemetry frame simulating lap 12 at Monza
// in a Ferrari 499P during a practice session.
func demoFrame() *dto.TelemetryFrame {
	return &dto.TelemetryFrame{
		Timestamp: time.Now().UnixNano(),
		Session: dto.Session{
			Game:        "LeMansUltimate",
			Track:       "Monza GP",
			Car:         "Ferrari 499P",
			SessionType: dto.SessionPractice,
			SessionTime: 2847.5,
			BestLapTime: 100.789,
		},
		Car: dto.CarState{
			SpeedMS:    52.3, // ~188 km/h
			Gear:       4,
			RPM:        8420,
			MaxRPM:     10500,
			Throttle:   0.87,
			Brake:      0.0,
			Clutch:     0.0,
			Steering:   -0.12,
			Fuel:       67.2,
			FuelPerLap: 2.83,
		},
		Tires: [4]dto.TireState{
			{Position: dto.FrontLeft, TempInner: 99, TempMiddle: 97, TempOuter: 94, WearPercent: 12, Compound: "Medium"},
			{Position: dto.FrontRight, TempInner: 98, TempMiddle: 96, TempOuter: 93, WearPercent: 11, Compound: "Medium"},
			{Position: dto.RearLeft, TempInner: 95, TempMiddle: 93, TempOuter: 90, WearPercent: 8, Compound: "Medium"},
			{Position: dto.RearRight, TempInner: 96, TempMiddle: 94, TempOuter: 91, WearPercent: 9, Compound: "Medium"},
		},
		Lap: dto.LapState{
			CurrentLap:     12,
			CurrentLapTime: 42.567,
			LastLapTime:    101.456,
			BestLapTime:    100.789,
			TargetLapTime:  100.789,
			Sector:         2,
			Sector1Time:    28.412,
			Sector2Time:    0, // in progress
			TrackPosition:  0.43,
		},
		Flags: dto.Flags{},
	}
}
