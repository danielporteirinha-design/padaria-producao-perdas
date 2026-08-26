@echo off
REM Instala as bibliotecas que o agente precisa.
REM Rode UMA VEZ, com dois cliques.

echo.
echo  Instalando as bibliotecas do agente de impressao...
echo.

python -m pip install --upgrade pip
python -m pip install requests Pillow python-escpos pywin32

echo.
echo  Pronto. Agora:
echo    1. Copie config.exemplo.ini para config.ini
echo    2. Preencha a senha e o nome da impressora no config.ini
echo    3. De dois cliques em iniciar.bat
echo.
pause
