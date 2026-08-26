@echo off
REM ---------------------------------------------------------------
REM Responde "o agente esta rodando?" — pergunta que deixou de ter
REM resposta obvia quando ele passou a rodar sem janela.
REM ---------------------------------------------------------------

title Estado do agente de impressao
cd /d "%~dp0"

echo.
echo  ==========================================================
echo   ESTADO DO AGENTE DE IMPRESSAO
echo  ==========================================================
echo.

schtasks /Query /TN "Agente de impressao Padaria" /FO LIST 2>nul | findstr /C:"Status" /C:"Status:" /C:"Ultima execucao" /C:"Last Run"
if errorlevel 1 (
  echo   A tarefa de sistema NAO esta instalada.
  echo   Rode instalar-servico.bat como administrador.
  echo.
  pause
  exit /b 1
)

echo.
echo  ---------- ultimas linhas do log ----------
echo.
powershell -NoProfile -Command "if (Test-Path 'agente.log') { Get-Content 'agente.log' -Tail 12 } else { 'Nenhum log ainda.' }"
echo.
echo  ==========================================================
echo   Uma linha 'aguardando - nada na fila' nos ultimos minutos
echo   significa que esta tudo de pe.
echo  ==========================================================
echo.
pause
