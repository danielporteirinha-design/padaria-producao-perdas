@echo off
REM ---------------------------------------------------------------
REM Faz o agente subir junto com o Windows.
REM
REM POR QUE ISTO EXISTE (ago/2026)
REM O agente so' imprime enquanto a janela dele esta aberta. No primeiro
REM dia de uso a fila inteira ficou parada porque ninguem tinha aberto o
REM programa — e a lista de producao do dia seguinte dependia disso.
REM
REM Depender de alguem lembrar de abrir um programa todo dia, num balcao
REM de padaria as 5 da manha, nao e' um plano. Isto cria o atalho na
REM pasta de Inicializar do Windows, e o agente passa a subir sozinho.
REM
REM Para DESFAZER: Windows+R, digite shell:startup, e apague o atalho
REM "Agente de impressao" que esta la' dentro.
REM ---------------------------------------------------------------

title Inicio automatico do agente
cd /d "%~dp0"

echo.
echo  Criando o atalho na pasta de Inicializar do Windows...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$destino = [Environment]::GetFolderPath('Startup') + '\Agente de impressao.lnk';" ^
  "$atalho = (New-Object -ComObject WScript.Shell).CreateShortcut($destino);" ^
  "$atalho.TargetPath = '%~dp0iniciar.bat';" ^
  "$atalho.WorkingDirectory = '%~dp0';" ^
  "$atalho.Description = 'Agente de impressao - Padaria Pao de Mel';" ^
  "$atalho.Save();" ^
  "Write-Host ('  Atalho criado em: ' + $destino)"

if errorlevel 1 (
  echo.
  echo  [ERRO] Nao consegui criar o atalho.
  echo.
  echo  Faca a mao:
  echo    1. Tecla Windows + R
  echo    2. Digite  shell:startup  e Enter
  echo    3. Arraste o iniciar.bat para dentro dessa pasta segurando ALT
  echo.
  pause
  exit /b 1
)

echo.
echo  Pronto. Da proxima vez que este PC ligar, o agente sobe sozinho.
echo.
echo  IMPORTANTE: isto vale a partir do proximo reinicio. Agora, abra o
echo  iniciar.bat uma vez para o agente comecar a trabalhar hoje.
echo.
pause
