// genicons generates app/build/appicon.png and app/build/windows/icon.ico
// from the canonical source icon at app/frontend/src/assets/sprint_logo_icon.png.
//
// Run from the app/ directory:
//
//	go run ./cmd/genicons
package main

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"image"
	"image/png"
	"os"
	"path/filepath"

	xdraw "golang.org/x/image/draw"
)

func main() {
	appDir, err := os.Getwd()
	if err != nil {
		fatal("getting working directory: %v", err)
	}

	srcPath := filepath.Join(appDir, "frontend", "src", "assets", "sprint_logo_icon.png")
	appiconPath := filepath.Join(appDir, "build", "appicon.png")
	icoPath := filepath.Join(appDir, "build", "windows", "icon.ico")

	srcData, err := os.ReadFile(srcPath)
	if err != nil {
		fatal("reading source icon: %v", err)
	}

	src, err := png.Decode(bytes.NewReader(srcData))
	if err != nil {
		fatal("decoding source PNG: %v", err)
	}

	if err := writeFile(appiconPath, srcData); err != nil {
		fatal("writing appicon.png: %v", err)
	}
	fmt.Printf("✓ %s\n", appiconPath)

	sizes := []int{256, 48, 32, 16}
	chunks := make([][]byte, len(sizes))
	for i, size := range sizes {
		var buf bytes.Buffer
		if err := png.Encode(&buf, scale(src, size)); err != nil {
			fatal("encoding %dx%d PNG: %v", size, size, err)
		}
		chunks[i] = buf.Bytes()
	}

	ico := buildICO(sizes, chunks)
	if err := writeFile(icoPath, ico); err != nil {
		fatal("writing icon.ico: %v", err)
	}
	fmt.Printf("✓ %s (%d bytes, sizes: %v)\n", icoPath, len(ico), sizes)
}

func scale(src image.Image, size int) image.Image {
	dst := image.NewRGBA(image.Rect(0, 0, size, size))
	xdraw.CatmullRom.Scale(dst, dst.Bounds(), src, src.Bounds(), xdraw.Over, nil)
	return dst
}

func writeFile(path string, data []byte) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

// buildICO assembles a multi-size ICO file with PNG-compressed images.
// PNG chunks in ICO are supported since Windows Vista.
func buildICO(sizes []int, chunks [][]byte) []byte {
	n := len(sizes)
	dataOffset := 6 + n*16 // ICONDIR(6) + N×ICONDIRENTRY(16)

	var buf bytes.Buffer

	// ICONDIR
	binary.Write(&buf, binary.LittleEndian, uint16(0)) // Reserved
	binary.Write(&buf, binary.LittleEndian, uint16(1)) // Type: icon
	binary.Write(&buf, binary.LittleEndian, uint16(n))

	// ICONDIRENTRYs
	offset := uint32(dataOffset)
	for i, size := range sizes {
		w := uint8(size)
		if size == 256 {
			w = 0 // 0 encodes 256 in the ICO spec
		}
		binary.Write(&buf, binary.LittleEndian, w)                      // Width
		binary.Write(&buf, binary.LittleEndian, w)                      // Height
		binary.Write(&buf, binary.LittleEndian, uint8(0))               // ColorCount
		binary.Write(&buf, binary.LittleEndian, uint8(0))               // Reserved
		binary.Write(&buf, binary.LittleEndian, uint16(1))              // Planes
		binary.Write(&buf, binary.LittleEndian, uint16(32))             // BitCount
		binary.Write(&buf, binary.LittleEndian, uint32(len(chunks[i]))) // BytesInRes
		binary.Write(&buf, binary.LittleEndian, offset)                 // ImageOffset
		offset += uint32(len(chunks[i]))
	}

	// Image data
	for _, chunk := range chunks {
		buf.Write(chunk)
	}

	return buf.Bytes()
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "genicons: "+format+"\n", args...)
	os.Exit(1)
}
