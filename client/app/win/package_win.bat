@echo off
setlocal

cd /d "%~dp0\.."
if errorlevel 1 exit /b %errorlevel%

set NODE_OPTIONS=--max-old-space-size=4096
if exist dist rmdir /s /q dist

call npm run build
if errorlevel 1 exit /b %errorlevel%

if exist .env copy /y .env dist\.env >nul

set ARCH=%1
if "%ARCH%"=="" set ARCH=all
if /i "%ARCH%"=="x86" set ARCH=x64
if /i "%ARCH%"=="arm" set ARCH=arm64

if /i "%ARCH%"=="x64" (
  call npx electron-builder --win --x64
  exit /b %errorlevel%
)

if /i "%ARCH%"=="arm64" (
  call npx electron-builder --win --arm64
  exit /b %errorlevel%
)

if /i "%ARCH%"=="all" (
  call npx electron-builder --win --x64 --arm64
  exit /b %errorlevel%
)

echo Unsupported win arch: %ARCH%. Use x86/x64, arm/arm64, or all. 1>&2
exit /b 1
