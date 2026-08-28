@echo off
REM Remove a tarefa de sistema do agente. Executar como administrador.

title Remover o agente do inicio automatico
net session >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [ERRO] Execute como administrador ^(botao direito^).
  echo.
  pause
  exit /b 1
)

schtasks /End /TN "Agente de impressao Padaria" >nul 2>nul
schtasks /Delete /TN "Agente de impressao Padaria" /F
echo.
echo  Removido. O agente nao sobe mais sozinho.
echo  Para rodar a mao, use iniciar.bat.
echo.
pause
