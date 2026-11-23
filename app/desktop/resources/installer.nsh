; Hooks into electron-builder's NSIS installer (`nsis.include` in scripts/package.mjs).

; Builds up to 1.1.0-beta.3 shipped the dash renderer's Rust build folder, unused, in
; resources\app.asar.unpacked. Before installing, the old uninstaller moves every file into
; %TEMP%\nsXXXX.tmp\old-install, a few characters longer than the install folder, so the
; deepest of those files pass the 260-character path limit, cannot be moved, and the update
; stops with "Failed to uninstall old application files ... 2". Removed here first, from the
; install the update replaces ($INSTDIR is that install by now); nothing ever read it.
!macro customInit
  RMDir /r "$INSTDIR\resources\app.asar.unpacked\node_modules\@sprint"
!macroend
