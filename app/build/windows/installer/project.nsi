; Sprint Windows Installer
; Build with: makensis /DVERSION=1.2.3 project.nsi

!ifndef VERSION
  !define VERSION "0.0.0"
!endif

!define APP_NAME      "Sprint"
!define PUBLISHER     "kratofl"
!define INSTALL_DIR   "$PROGRAMFILES64\${APP_NAME}"
!define UNINSTALL_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APP_NAME}"

Name          "${APP_NAME} ${VERSION}"
OutFile       "..\..\bin\Sprint-amd64-installer.exe"
InstallDir    "${INSTALL_DIR}"
InstallDirRegKey HKLM "${UNINSTALL_KEY}" "InstallDir"

RequestExecutionLevel admin
Unicode True

!include "MUI2.nsh"
!include "x64.nsh"

!define MUI_ICON   "..\icon.ico"
!define MUI_UNICON "..\icon.ico"
!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_COMPONENTS
!insertmacro MUI_PAGE_INSTFILES

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "English"

Function .onInit
  ${IfNot} ${RunningX64}
    MessageBox MB_OK|MB_ICONSTOP "Sprint requires a 64-bit version of Windows."
    Abort
  ${EndIf}
  SetRegView 64
FunctionEnd

Section "Sprint (required)" SecCore
  SectionIn RO

  SetOutPath "${INSTALL_DIR}"
  File "..\..\bin\Sprint.exe"
  File "..\..\bin\DefaultDash.json"

  SetOutPath "${INSTALL_DIR}\DeviceCatalog"
  File "..\..\bin\DeviceCatalog\*.json"

  WriteUninstaller "${INSTALL_DIR}\Uninstall.exe"

  WriteRegStr   HKLM "${UNINSTALL_KEY}" "DisplayName"     "${APP_NAME}"
  WriteRegStr   HKLM "${UNINSTALL_KEY}" "DisplayVersion"  "${VERSION}"
  WriteRegStr   HKLM "${UNINSTALL_KEY}" "Publisher"       "${PUBLISHER}"
  WriteRegStr   HKLM "${UNINSTALL_KEY}" "InstallDir"      "${INSTALL_DIR}"
  WriteRegStr   HKLM "${UNINSTALL_KEY}" "UninstallString" '"${INSTALL_DIR}\Uninstall.exe"'
  WriteRegStr   HKLM "${UNINSTALL_KEY}" "DisplayIcon"     "${INSTALL_DIR}\Sprint.exe"
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoModify"        1
  WriteRegDWORD HKLM "${UNINSTALL_KEY}" "NoRepair"        1
SectionEnd

Section "Start Menu shortcut" SecStartMenu
  CreateDirectory "$SMPROGRAMS\${APP_NAME}"
  CreateShortcut  "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"  "${INSTALL_DIR}\Sprint.exe"
  CreateShortcut  "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk"    "${INSTALL_DIR}\Uninstall.exe"
SectionEnd

Section /o "Desktop shortcut" SecDesktop
  CreateShortcut "$DESKTOP\${APP_NAME}.lnk" "${INSTALL_DIR}\Sprint.exe"
SectionEnd

!insertmacro MUI_FUNCTION_DESCRIPTION_BEGIN
  !insertmacro MUI_DESCRIPTION_TEXT ${SecCore}      "Sprint application, preset device catalog, and default dashboard layout."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecStartMenu} "Add Sprint to the Start Menu so it appears in Windows Search."
  !insertmacro MUI_DESCRIPTION_TEXT ${SecDesktop}   "Add a shortcut to the Desktop."
!insertmacro MUI_FUNCTION_DESCRIPTION_END

Section "Uninstall"
  Delete "${INSTALL_DIR}\Sprint.exe"
  Delete "${INSTALL_DIR}\DefaultDash.json"
  Delete "${INSTALL_DIR}\Uninstall.exe"
  RMDir  /r "${INSTALL_DIR}\DeviceCatalog"
  RMDir  "${INSTALL_DIR}"

  Delete "$SMPROGRAMS\${APP_NAME}\${APP_NAME}.lnk"
  Delete "$SMPROGRAMS\${APP_NAME}\Uninstall.lnk"
  RMDir  "$SMPROGRAMS\${APP_NAME}"

  Delete "$DESKTOP\${APP_NAME}.lnk"

  DeleteRegKey HKLM "${UNINSTALL_KEY}"
SectionEnd
