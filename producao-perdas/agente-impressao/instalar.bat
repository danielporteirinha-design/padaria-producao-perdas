@echo off
REM Instala as bibliotecas que o agente precisa.
REM Rode UMA VEZ, com dois cliques.

cd /d "%~dp0"
call _encontrar-python.bat
if errorlevel 1 (
  pause
  exit /b 1
)

echo.
echo  Python encontrado: %PY%
%PY% --version
echo.
echo  Instalando as bibliotecas do agente de impressao...
echo.

%PY% -m pip install --upgrade pip
%PY% -m pip install requests Pillow python-escpos pywin32
if errorlevel 1 (
  echo.
  echo  [ERRO] A instalacao das bibliotecas falhou.
  echo  Verifique se este PC tem internet e tente de novo.
  echo.
  pause
  exit /b 1
)

echo.
echo  Pronto. Agora:
echo    1. Copie config.exemplo.ini para config.ini
echo    2. Preencha a senha e o nome da impressora no config.ini
echo       (use listar-impressoras.bat para ver o nome exato)
echo    3. De dois cliques em iniciar.bat
echo.
pause
