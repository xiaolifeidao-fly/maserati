!macro customInit
  nsExec::ExecToLog 'taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"'
  Pop $0
!macroend

!macro customUnInstallCheck
  ${if} $R0 == 0
    Return
  ${endIf}

  DetailPrint "Old uninstaller reported failure, attempting forced cleanup"
  nsExec::ExecToLog 'taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"'
  Pop $0
  Sleep 1000

  ClearErrors
  RMDir /r "$INSTDIR"

  ${ifNot} ${Errors}
    DetailPrint "Forced cleanup succeeded, continuing installation"
    StrCpy $R0 0
  ${endif}
!macroend

!macro customUnInit
  nsExec::ExecToLog 'taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}"'
  Pop $0
!macroend
