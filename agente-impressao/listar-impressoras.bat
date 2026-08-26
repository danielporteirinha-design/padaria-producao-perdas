@echo off
REM Mostra o nome EXATO das impressoras instaladas neste PC, para copiar
REM para o config.ini. Existe como .bat porque dois cliques num .py so'
REM funcionam se a extensao estiver associada ao Python — e com o Install
REM Manager ela costuma nao estar.

title Impressoras instaladas
cd /d "%~dp0"

call _encontrar-python.bat
if errorlevel 1 (
  pause
  exit /b 1
)

%PY% listar-impressoras.py
echo.
pause
