@echo off
setlocal DisableDelayedExpansion
set "signTool=%AKX_DESKTOP_WINDOWS_SIGNTOOL%"
set "certificateFile=%AKX_DESKTOP_WINDOWS_CER_FILE%"
set "tokenPin=%AKX_DESKTOP_WINDOWS_TOKEN_PIN%"
set "keyContainer=%AKX_DESKTOP_WINDOWS_KEY_CONTAINER%"
set "targetFile=%AKX_DESKTOP_WINDOWS_SIGN_TARGET%"
set "appendSignature="
if "%AKX_DESKTOP_WINDOWS_SIGN_APPEND%"=="1" set "appendSignature=/as"
set "AKX_DESKTOP_WINDOWS_SIGNTOOL="
set "AKX_DESKTOP_WINDOWS_CER_FILE="
set "AKX_DESKTOP_WINDOWS_TOKEN_PIN="
set "AKX_DESKTOP_WINDOWS_KEY_CONTAINER="
set "AKX_DESKTOP_WINDOWS_SIGN_TARGET="
set "AKX_DESKTOP_WINDOWS_SIGN_APPEND="
set "signTool=" & set "certificateFile=" & set "tokenPin=" & set "keyContainer=" & set "targetFile=" & set "appendSignature=" & "%signTool%" sign /v /fd sha256 /f "%certificateFile%" /kc "[{{%tokenPin%}}]=%keyContainer%" /csp "eToken Base Cryptographic Provider" %appendSignature% /tr http://timestamp.digicert.com /td sha256 "%targetFile%"
exit /b %errorlevel%
