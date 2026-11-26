@echo off
rem DuoDesk Virtual Display Driver (IddCx UMDF 2.x — ARM64 & x64) build & Partner Center CAB script.
rem Requires Visual Studio 2022 + Windows 11 WDK (Windows Driver Kit).
rem Usage:
rem   build.cmd [ARM64|x64|all] [--cab]
setlocal enabledelayedexpansion
set TARGET=%1
if "%TARGET%"=="" set TARGET=all
set MAKE_CAB=0
if /i "%1"=="--cab" (set TARGET=all & set MAKE_CAB=1)
if /i "%2"=="--cab" set MAKE_CAB=1

set VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe
if not exist "%VSWHERE%" (
  echo Error: Visual Studio 2022 with C++ and Windows Driver Kit ^(WDK^) is required.
  exit /b 1
)
for /f "usebackq delims=" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.Component.MSBuild -find MSBuild\**\Bin\MSBuild.exe`) do set MSBUILD=%%i
if not defined MSBUILD (
  echo Error: MSBuild.exe not found.
  exit /b 1
)

set SRC=%~dp0
if /i "%TARGET%"=="all" (
  call :build_arch ARM64 || exit /b 1
  call :build_arch x64 || exit /b 1
) else (
  call :build_arch %TARGET% || exit /b 1
)
exit /b 0

:build_arch
set ARCH=%1
echo === Building DuoDeskVdd (%ARCH% Release) ===
"%MSBUILD%" "%SRC%DuoDeskVdd.vcxproj" /p:Configuration=Release /p:Platform=%ARCH% /m /v:minimal || exit /b 1
set OUT=%SRC%out\%ARCH%\Release\DuoDeskVdd
if not exist "%OUT%" mkdir "%OUT%"
copy /y "%SRC%out\%ARCH%\Release\DuoDeskVdd.dll" "%OUT%\DuoDeskVdd.dll" >nul
copy /y "%SRC%DuoDeskVdd.inf" "%OUT%\DuoDeskVdd.inf" >nul

rem Generate catalog (.cat) via Inf2Cat if WDK bin is installed
for /d %%k in ("%ProgramFiles(x86)%\Windows Kits\10\bin\10.*") do (
  if exist "%%k\x86\inf2cat.exe" set INF2CAT=%%k\x86\inf2cat.exe
)
if defined INF2CAT (
  if /i "%ARCH%"=="ARM64" (
    "%INF2CAT%" /driver:"%OUT%" /os:10_RS5_ARM64 /uselocaltime
  ) else (
    "%INF2CAT%" /driver:"%OUT%" /os:10_RS5_X64 /uselocaltime
  )
) else (
  echo Note: inf2cat.exe not found; catalog file was not generated.
)

if "%MAKE_CAB%"=="1" (
  echo === Creating Microsoft Partner Center submission CAB (%ARCH%) ===
  set DDF=%SRC%out\%ARCH%\Release\submit.ddf
  (
    echo .OPTION EXPLICIT
    echo .Set CabinetFileCountThreshold=0
    echo .Set FolderFileCountThreshold=0
    echo .Set FolderSizeThreshold=0
    echo .Set MaxCabinetSize=0
    echo .Set MaxDiskFileCount=0
    echo .Set MaxDiskSize=0
    echo .Set CompressionType=MSZIP
    echo .Set Cabinet=on
    echo .Set Compress=on
    echo .Set CabinetNameTemplate=DuoDeskVdd-%ARCH%.cab
    echo .Set DiskDirectoryTemplate=%SRC%out\%ARCH%\Release
    echo .Set DestinationDir=DuoDeskVdd
    echo "%OUT%\DuoDeskVdd.dll"
    echo "%OUT%\DuoDeskVdd.inf"
  ) > "!DDF!"
  makecab /f "!DDF!" || exit /b 1
  echo Created "%SRC%out\%ARCH%\Release\DuoDeskVdd-%ARCH%.cab"
)
exit /b 0
