@echo off
setlocal
cd /d "%~dp0"
if not exist "node_modules\vite\bin\vite.js" (
  call npm.cmd ci
  if errorlevel 1 goto fallo
)
if not exist "dist-demo\index.html" (
  call npm.cmd run build:demo
  if errorlevel 1 goto fallo
)
call npm.cmd run demo -- --open /recorrido
if errorlevel 1 goto fallo
exit /b 0
:fallo
echo Si la demo ya esta abierta, visita http://127.0.0.1:4186/recorrido
pause
exit /b 1
