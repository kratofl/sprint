//go:build windows

package capture

import (
	"runtime"
	"sync/atomic"
	"syscall"
	"unsafe"
)

var (
	procCreateWindowExW         = user32.NewProc("CreateWindowExW")
	procRegisterClassExW        = user32.NewProc("RegisterClassExW")
	procDefWindowProcW          = user32.NewProc("DefWindowProcW")
	procPostQuitMessage         = user32.NewProc("PostQuitMessage")
	procGetMessageW             = user32.NewProc("GetMessageW")
	procTranslateMessage        = user32.NewProc("TranslateMessage")
	procDispatchMessageW        = user32.NewProc("DispatchMessageW")
	procDestroyWindow           = user32.NewProc("DestroyWindow")
	procGetWindowRect           = user32.NewProc("GetWindowRect")
	procSetLayeredWindowAttribs = user32.NewProc("SetLayeredWindowAttributes")
	procGetSystemMetrics        = user32.NewProc("GetSystemMetrics")
	procSetWindowPos            = user32.NewProc("SetWindowPos")
	procGetClientRect           = user32.NewProc("GetClientRect")
	procBeginPaint              = user32.NewProc("BeginPaint")
	procEndPaint                = user32.NewProc("EndPaint")
	procInvalidateRect          = user32.NewProc("InvalidateRect")
	procLoadCursorW             = user32.NewProc("LoadCursorW")
	procShowWindow              = user32.NewProc("ShowWindow")
	procUpdateWindow            = user32.NewProc("UpdateWindow")
	procGetCursorPos            = user32.NewProc("GetCursorPos")
	procScreenToClient          = user32.NewProc("ScreenToClient")
	procSetCursor               = user32.NewProc("SetCursor")
	procLoadImageW              = user32.NewProc("LoadImageW")
	procSetForegroundWindow     = user32.NewProc("SetForegroundWindow")
	procSetFocus                = user32.NewProc("SetFocus")
	procGetModuleHandleW        = kernel32.NewProc("GetModuleHandleW")

	procCreateSolidBrush = gdi32.NewProc("CreateSolidBrush")
	procDeleteBrush      = gdi32.NewProc("DeleteObject")
	procFillRect         = user32.NewProc("FillRect")
	procFrameRect        = user32.NewProc("FrameRect")
	procSelectGDIObject  = gdi32.NewProc("SelectObject")
	procSetTextColor     = gdi32.NewProc("SetTextColor")
	procSetBkMode        = gdi32.NewProc("SetBkMode")
	procDrawTextW        = user32.NewProc("DrawTextW")
	procCreateFontW      = gdi32.NewProc("CreateFontW")
	procDeleteGDIObject  = gdi32.NewProc("DeleteObject")
	procSetPixel         = gdi32.NewProc("SetPixel")
	procCreatePen        = gdi32.NewProc("CreatePen")
	procMoveToEx         = gdi32.NewProc("MoveToEx")
	procLineTo           = gdi32.NewProc("LineTo")
)

const (
	wsPopup      = 0x80000000
	wsVisible    = 0x10000000
	wsExTopmost  = 0x00000008
	wsExLayered  = 0x00080000
	lwaAlpha      = uintptr(0x00000002)
	overlayAlpha  = uintptr(180)        // ~71% opaque
	bgColor       = uintptr(0x000a0a0a) // BGR near-black background
	borderColor   = uintptr(0x006C90FF) // BGR for orange #ff906c
	smCxScreen   = 0
	smCyScreen   = 1
	hwndTop      = 0
	swpNoActivate = 0x0010
	htCaption     = 2
	htTopLeft     = 13
	htTopRight    = 14
	htBottomLeft  = 16
	htBottomRight = 17
	wmPaint       = 0x000F
	wmNcHitTest   = 0x0084
	wmSizing      = 0x0214
	wmKeyDown     = 0x0100
	wmDestroy     = 0x0002
	wmCreate      = 0x0001
	vkReturn      = 0x0D
	vkEscape      = 0x1B
	wmsLeft       = 1
	wmsRight      = 2
	wmsTop        = 3
	wmsTopLeft    = 4
	wmsTopRight   = 5
	wmsBottom     = 6
	wmsBottomLeft = 7
	wmsBottomRight = 8
	dtCenter      = 0x00000001
	dtVCenter     = 0x00000004
	dtSingleLine  = 0x00000020
	transparent   = 1
	swShow        = 5
	swpNone       = 0
	borderThick   = int32(3)
	handleSize    = int32(8)
	minSide       = 80
	instrHeight   = int32(22)
)

type wndClassExW struct {
	Size       uint32
	Style      uint32
	WndProc    uintptr
	ClsExtra   int32
	WndExtra   int32
	Instance   uintptr
	Icon       uintptr
	Cursor     uintptr
	Background uintptr
	MenuName   *uint16
	ClassName  *uint16
	IconSm     uintptr
}

type msg struct {
	Hwnd    uintptr
	Message uint32
	WParam  uintptr
	LParam  uintptr
	Time    uint32
	Pt      point
}

type point struct {
	X, Y int32
}

type paintStruct struct {
	Hdc         uintptr
	Erase       int32
	RcPaint     winRect
	Restore     int32
	IncUpdate   int32
	Reserved    [32]byte
}

type winRect struct {
	Left, Top, Right, Bottom int32
}

// overlayState is shared between the window proc (locked OS thread) and the
// calling goroutine via atomic read after the message loop exits.
var overlayState struct {
	aspectW, aspectH int32
	resultX, resultY int32
	resultW, resultH int32
	confirmed        atomic.Bool
}

// overlayWndProc is the Win32 window procedure for the bounds selector overlay.
//
//go:nosplit
func overlayWndProc(hwnd, msg, wParam, lParam uintptr) uintptr {
	switch uint32(msg) {
	case wmCreate:
		return 0

	case wmPaint:
		var ps paintStruct
		hdc, _, _ := procBeginPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
		if hdc != 0 {
			paintOverlay(hwnd, hdc)
			procEndPaint.Call(hwnd, uintptr(unsafe.Pointer(&ps)))
		}
		return 0

	case wmNcHitTest:
		var rc winRect
		procGetClientRect.Call(hwnd, uintptr(unsafe.Pointer(&rc)))
		var cur point
		procGetCursorPos.Call(uintptr(unsafe.Pointer(&cur)))
		procScreenToClient.Call(hwnd, uintptr(unsafe.Pointer(&cur)))

		w := rc.Right - rc.Left
		h := rc.Bottom - rc.Top
		x, y := cur.X, cur.Y

		if x < handleSize && y < handleSize {
			return htTopLeft
		}
		if x > w-handleSize && y < handleSize {
			return htTopRight
		}
		if x < handleSize && y > h-handleSize {
			return htBottomLeft
		}
		if x > w-handleSize && y > h-handleSize {
			return htBottomRight
		}
		return htCaption

	case wmSizing:
		rc := (*winRect)(unsafe.Pointer(lParam))
		w := rc.Right - rc.Left
		_ = rc.Bottom - rc.Top // unused; height is always derived from width
		aW := overlayState.aspectW
		aH := overlayState.aspectH
		if aW <= 0 || aH <= 0 {
			return 1
		}

		// Derive height from width to maintain aspect ratio.
		newH := w * aH / aW
		if newH < minSide {
			newH = minSide
			w = newH * aW / aH
		}
		if w < minSide {
			w = minSide
			newH = w * aH / aW
		}

		switch wParam {
		case wmsTopLeft, wmsTop:
			rc.Left = rc.Right - w
			rc.Top = rc.Bottom - newH
		case wmsTopRight:
			rc.Right = rc.Left + w
			rc.Top = rc.Bottom - newH
		case wmsBottomLeft:
			rc.Left = rc.Right - w
			rc.Bottom = rc.Top + newH
		default:
			rc.Right = rc.Left + w
			rc.Bottom = rc.Top + newH
		}
		procInvalidateRect.Call(hwnd, 0, 1)
		return 1

	case wmKeyDown:
		switch wParam {
		case vkReturn:
			var wr winRect
			procGetWindowRect.Call(hwnd, uintptr(unsafe.Pointer(&wr)))
			overlayState.resultX = wr.Left
			overlayState.resultY = wr.Top
			overlayState.resultW = wr.Right - wr.Left
			overlayState.resultH = wr.Bottom - wr.Top
			overlayState.confirmed.Store(true)
			procDestroyWindow.Call(hwnd)
		case vkEscape:
			overlayState.confirmed.Store(false)
			procDestroyWindow.Call(hwnd)
		}
		return 0

	case wmDestroy:
		procPostQuitMessage.Call(0)
		return 0
	}

	r, _, _ := procDefWindowProcW.Call(hwnd, msg, wParam, lParam)
	return r
}

// paintOverlay renders the overlay: dark semi-transparent interior, orange border,
// corner handles, a gapped X crosshair in the center, and orange instruction text.
func paintOverlay(hwnd, hdc uintptr) {
	var rc winRect
	procGetClientRect.Call(hwnd, uintptr(unsafe.Pointer(&rc)))
	w := rc.Right
	h := rc.Bottom

	// Dark background — visible at window-level alpha.
	bgBrush, _, _ := procCreateSolidBrush.Call(bgColor)
	procFillRect.Call(hdc, uintptr(unsafe.Pointer(&rc)), bgBrush)
	procDeleteGDIObject.Call(bgBrush)

	// Orange border.
	borderBrush, _, _ := procCreateSolidBrush.Call(borderColor)
	for i := int32(0); i < borderThick; i++ {
		r := winRect{i, i, w - i, h - i}
		procFrameRect.Call(hdc, uintptr(unsafe.Pointer(&r)), borderBrush)
	}

	// Corner handles (8×8 solid orange squares).
	corners := [][4]int32{
		{0, 0, handleSize, handleSize},
		{w - handleSize, 0, w, handleSize},
		{0, h - handleSize, handleSize, h},
		{w - handleSize, h - handleSize, w, h},
	}
	for _, c := range corners {
		r := winRect{c[0], c[1], c[2], c[3]}
		procFillRect.Call(hdc, uintptr(unsafe.Pointer(&r)), borderBrush)
	}
	procDeleteGDIObject.Call(borderBrush)

	// Gapped X crosshair at center.
	shorter := w
	if h < w {
		shorter = h
	}
	armLen := shorter / 6
	if armLen < 10 {
		armLen = 10
	}
	const xGap = int32(6)
	cx, cy := w/2, h/2
	pen, _, _ := procCreatePen.Call(0, 2, borderColor)
	oldPen, _, _ := procSelectGDIObject.Call(hdc, pen)
	procMoveToEx.Call(hdc, uintptr(cx-armLen), uintptr(cy-armLen), 0)
	procLineTo.Call(hdc, uintptr(cx-xGap), uintptr(cy-xGap))
	procMoveToEx.Call(hdc, uintptr(cx+xGap), uintptr(cy+xGap), 0)
	procLineTo.Call(hdc, uintptr(cx+armLen), uintptr(cy+armLen))
	procMoveToEx.Call(hdc, uintptr(cx+armLen), uintptr(cy-armLen), 0)
	procLineTo.Call(hdc, uintptr(cx+xGap), uintptr(cy-xGap))
	procMoveToEx.Call(hdc, uintptr(cx-xGap), uintptr(cy+xGap), 0)
	procLineTo.Call(hdc, uintptr(cx-armLen), uintptr(cy+armLen))
	procSelectGDIObject.Call(hdc, oldPen)
	procDeleteGDIObject.Call(pen)

	// Orange instruction text inside the border.
	procSetBkMode.Call(hdc, transparent)
	procSetTextColor.Call(hdc, borderColor)

	topText := syscall.StringToUTF16("DRAG TO POSITION  ·  CORNER TO RESIZE")
	topR := winRect{borderThick + 4, borderThick + 4, w - borderThick - 4, borderThick + instrHeight}
	procDrawTextW.Call(
		hdc,
		uintptr(unsafe.Pointer(&topText[0])),
		^uintptr(0),
		uintptr(unsafe.Pointer(&topR)),
		dtCenter|dtVCenter|dtSingleLine,
	)

	btmText := syscall.StringToUTF16("ENTER  ·  CONFIRM    ESC  ·  CANCEL")
	btmR := winRect{borderThick + 4, h - borderThick - instrHeight - 4, w - borderThick - 4, h - borderThick - 4}
	procDrawTextW.Call(
		hdc,
		uintptr(unsafe.Pointer(&btmText[0])),
		^uintptr(0),
		uintptr(unsafe.Pointer(&btmR)),
		dtCenter|dtVCenter|dtSingleLine,
	)
}

// SelectRegion opens a topmost borderless overlay window on the primary monitor
// so the user can drag-position and corner-resize a selection rectangle with the
// given aspect ratio (aspectW:aspectH). initX/Y/W/H are the starting position and
// size (pass zeros to auto-center). It blocks until the user presses Enter or Esc.
// Returns (x, y, w, h, confirmed). x/y are in primary monitor screen coordinates.
func SelectRegion(aspectW, aspectH, initX, initY, initW, initH int) (x, y, w, h int, confirmed bool) {
	result := make(chan struct{ x, y, w, h int; ok bool }, 1)

	go func() {
		runtime.LockOSThread()
		defer runtime.UnlockOSThread()

		// Store aspect ratio for the window proc.
		overlayState.aspectW = int32(aspectW)
		overlayState.aspectH = int32(aspectH)
		overlayState.confirmed.Store(false)

		hInst, _, _ := procGetModuleHandleW.Call(0)

		className, _ := syscall.UTF16PtrFromString("SprintBoundsSelector")
		wc := wndClassExW{
			Size:     uint32(unsafe.Sizeof(wndClassExW{})),
			WndProc:  syscall.NewCallback(overlayWndProc),
			Instance: hInst,
		}
		wc.ClassName = className
		procRegisterClassExW.Call(uintptr(unsafe.Pointer(&wc)))

		// Compute initial position and size.
		monW, _, _ := procGetSystemMetrics.Call(smCxScreen)
		monH, _, _ := procGetSystemMetrics.Call(smCyScreen)

		startW := initW
		startH := initH
		startX := initX
		startY := initY
		if startW <= 0 || startH <= 0 {
			// Default to the exact screen resolution (1:1 pixel mapping).
			startW = aspectW
			startH = aspectH
		}
		if startX <= 0 && startY <= 0 {
			startX = (int(monW) - startW) / 2
			startY = (int(monH) - startH) / 2
		}

		titlePtr, _ := syscall.UTF16PtrFromString("SprintBoundsSelector")
		hwnd, _, _ := procCreateWindowExW.Call(
			wsExTopmost|wsExLayered,
			uintptr(unsafe.Pointer(className)),
			uintptr(unsafe.Pointer(titlePtr)),
			wsPopup,
			uintptr(startX), uintptr(startY),
			uintptr(startW), uintptr(startH),
			0, 0, hInst, 0,
		)
		if hwnd == 0 {
			result <- struct{ x, y, w, h int; ok bool }{}
			return
		}

		// Semi-transparent window — mouse clicks hit the full area (not click-through).
		procSetLayeredWindowAttribs.Call(hwnd, 0, overlayAlpha, lwaAlpha)
		procShowWindow.Call(hwnd, swShow)
		procUpdateWindow.Call(hwnd)
		procSetForegroundWindow.Call(hwnd)
		procSetFocus.Call(hwnd)

		var m msg
		for {
			r, _, _ := procGetMessageW.Call(uintptr(unsafe.Pointer(&m)), 0, 0, 0)
			if r == 0 || r == ^uintptr(0) {
				break
			}
			procTranslateMessage.Call(uintptr(unsafe.Pointer(&m)))
			procDispatchMessageW.Call(uintptr(unsafe.Pointer(&m)))
		}

		if overlayState.confirmed.Load() {
			result <- struct{ x, y, w, h int; ok bool }{
				x:  int(overlayState.resultX),
				y:  int(overlayState.resultY),
				w:  int(overlayState.resultW),
				h:  int(overlayState.resultH),
				ok: true,
			}
		} else {
			result <- struct{ x, y, w, h int; ok bool }{}
		}
	}()

	r := <-result
	return r.x, r.y, r.w, r.h, r.ok
}
