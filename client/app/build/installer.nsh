; Custom installer hook: force-kill the app before the running-check,
; so the installer never shows the "cannot be closed" retry dialog.
!macro customCheckAppRunning
  nsExec::Exec 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
  Pop $0
  Sleep 1000
!macroend
