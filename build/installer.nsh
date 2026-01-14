!include "FileFunc.nsh"
!include "LogicLib.nsh"
!include "WinMessages.nsh"
!pragma warning disable 6001 ; disable 'Variable not referenced or never set' warnings treated as errors
!pragma warning disable 6010 ; disable possible macro-related warnings

Var ExistingVersion
Var ExistingInstall
Var UninstallCmd
Var CompareResult

!macro KillRunningApp
  ; 强制关闭运行中的程序（使用 electron-builder 注入的 APP_FILENAME/PRODUCT_FILENAME）
  nsExec::ExecToStack 'taskkill /F /IM ${APP_FILENAME}.exe /T'
  Pop $0
  nsExec::ExecToStack 'taskkill /F /IM ${PRODUCT_FILENAME}.exe /T'
  Pop $0
  ; 尝试通过窗口类关闭（Chrome_WidgetWin_1 是 Electron 默认窗口类）
  FindWindow $1 "Chrome_WidgetWin_1" ""
  ${If} $1 != 0
    SendMessage $1 ${WM_CLOSE} 0 0 /TIMEOUT=2000
  ${EndIf}
!macroend

!macro UninstallExisting
  ${If} $UninstallCmd != ""
    ; 静默卸载旧版本（如果支持）
    ExecWait '$UninstallCmd /S'
  ${EndIf}
!macroend

!macro customInit
  ; 读取已安装信息（卸载表）
  ReadRegStr $ExistingVersion HKCU 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_ID}' 'DisplayVersion'
  ${If} $ExistingVersion == ""
    ; 尝试机器级
    ReadRegStr $ExistingVersion HKLM 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_ID}' 'DisplayVersion'
  ${EndIf}

  ReadRegStr $ExistingInstall HKCU 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_ID}' 'InstallLocation'
  ${If} $ExistingInstall == ""
    ReadRegStr $ExistingInstall HKLM 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_ID}' 'InstallLocation'
  ${EndIf}

  ReadRegStr $UninstallCmd HKCU 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_ID}' 'UninstallString'
  ${If} $UninstallCmd == ""
    ReadRegStr $UninstallCmd HKLM 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${APP_ID}' 'UninstallString'
  ${EndIf}

  ${If} $ExistingVersion != ""
    ; 简化逻辑：存在旧版本则先强制关闭并卸载后继续安装
    ; 若需严格阻止降级，可引入 VersionCompare 宏或自行实现语义版本比较
    !insertmacro KillRunningApp
    !insertmacro UninstallExisting
  ${EndIf}

  ; 设置默认安装目录：若未发现已安装路径，则默认使用 C:\\sms_tools 根目录
  ${If} $ExistingInstall == ""
    StrCpy $INSTDIR "C:\\sms_tools"
  ${Else}
    StrCpy $INSTDIR $ExistingInstall
  ${EndIf}
!macroend

!macro customInstall
  ; 可在此扩展安装后逻辑
!macroend

!macro customUnInstall
  ; 卸载前先强制关闭运行的程序
  !insertmacro KillRunningApp
!macroend
