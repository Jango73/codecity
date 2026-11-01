@echo off
setlocal EnableDelayedExpansion

set "PATH_ARG="
set "LAYOUT_ARG=compact"
set "OPEN_ARG=1"

:parse
if "%~1"=="" goto done_parse
if /I "%~1"=="--path" (
  set "PATH_ARG=%~2"
  shift
  shift
  goto parse
)
if /I "%~1"=="--layout" (
  set "LAYOUT_ARG=%~2"
  shift
  shift
  goto parse
)
if /I "%~1"=="--no-open" (
  set "OPEN_ARG=0"
  shift
  goto parse
)
if /I "%~1"=="--help" (
  echo usage: run.bat [path] [--path ^<directory^>] [--layout grid^|spiral^|manhattan^|compact^|treemap] [--no-open]
  exit /b 0
)
set "ARG=%~1"
if not "!ARG:~0,2!"=="--" (
  set "PATH_ARG=%~1"
  shift
  goto parse
)
echo unknown argument: %~1 (see --help) 1>&2
exit /b 1

:done_parse

set "HERE=%~dp0..\.."
for %%I in ("%HERE%") do set "HERE=%%~fI"

where node >nul 2>&1
if errorlevel 1 (
  echo node is required but missing 1>&2
  exit /b 1
)

if not exist "%HERE%\node_modules" (
  pushd "%HERE%"
  call npm install
  if errorlevel 1 (
    popd
    exit /b 1
  )
  popd
)

set "TARGET=%PATH_ARG%"
if "%TARGET%"=="" set "TARGET=%HERE%\src"

set "CITY="
for /f "delims=" %%C in ('node "%HERE%\tools\build-city.mjs" "%TARGET%" "%LAYOUT_ARG%"') do (
  set "LINE=%%C"
  echo %%C
  if not defined CITY (
    set "CITY=!LINE:* -> =!"
  )
)

if "%OPEN_ARG%"=="1" (
  if defined CITY start "" "!CITY!"
)

endlocal
exit /b 0
