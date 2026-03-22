package main

import (
	"embed"
	"log"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	app := NewApp()

	err := wails.Run(&options.App{
		Title:  "Sprint",
		Width:  1440,
		Height: 900,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		// Match design.md background #080809
		BackgroundColour: &options.RGBA{R: 8, G: 8, B: 9, A: 255},
		OnStartup:        app.Startup,
		OnDomReady:       app.DomReady,
		OnShutdown:       app.Shutdown,
		Bind: []interface{}{
			app,
		},
		// Glassmorphism requires transparency support
		Windows: &windows.Options{
			WebviewIsTransparent: true,
			WindowIsTranslucent:  true,
			DisableWindowIcon:    false,
		},
		// Mac: &mac.Options{
		// 	TitleBar:             mac.TitleBarHiddenInset(),
		// 	WebviewIsTransparent: true,
		// 	WindowIsTranslucent:  true,
		// 	About: &mac.AboutInfo{
		// 		Title:   "Sprint",
		// 		Message: "Sim racing telemetry platform",
		// 	},
		// },
	})
	if err != nil {
		log.Fatal(err)
	}
}
