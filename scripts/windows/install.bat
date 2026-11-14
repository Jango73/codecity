@echo off
setlocal EnableDelayedExpansion

set "HERE=%~dp0..\.."
for %%I in ("%HERE%") do set "HERE=%%~fI"

where node >nul 2>&1
if errorlevel 1 (
  echo node is required but missing 1>&2
  exit /b 1
)
where npm >nul 2>&1
if errorlevel 1 (
  echo npm is required but missing 1>&2
  exit /b 1
)

pushd "%HERE%"
call npm install
if errorlevel 1 (
  popd
  exit /b 1
)
popd

echo Dependencies installed in %HERE%\node_modules
exit /b 0
