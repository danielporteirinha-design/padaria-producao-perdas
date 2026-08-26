@echo off
REM Inicia o agente de impressao. Deixe esta janela ABERTA.
REM Para o agente subir sozinho com o Windows, veja o LEIA-ME.md.

title Agente de impressao - Padaria Pao de Mel
cd /d "%~dp0"
python agente.py

REM Se cair, a janela fica aberta para dar tempo de ler o erro.
echo.
echo  O agente parou. Leia a mensagem acima.
pause
