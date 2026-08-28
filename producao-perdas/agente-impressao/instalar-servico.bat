@echo off
REM ---------------------------------------------------------------
REM Instala o agente como TAREFA DE SISTEMA do Windows.
REM
REM POR QUE ISTO SUBSTITUIU A JANELA ABERTA (ago/2026)
REM O agente rodava numa janela de console que alguem precisava deixar
REM aberta. Num balcao de padaria isso e' uma falha esperando a hora:
REM qualquer operador fecha sem querer e a impressao para sem ninguem
REM perceber. Foi a primeira coisa que aconteceu no dia 1.
REM
REM Como tarefa de sistema:
REM   - sobe no BOOT, antes de qualquer login
REM   - roda SEM JANELA (pythonw), entao nao ha o que fechar por engano
REM   - se travar ou morrer, o Windows reinicia sozinho em 1 minuto
REM   - continua rodando com a tela bloqueada e entre trocas de usuario
REM
REM PRECISA SER EXECUTADO COMO ADMINISTRADOR.
REM Botao direito neste arquivo > "Executar como administrador".
REM
REM Para remover: desinstalar-servico.bat
REM ---------------------------------------------------------------

title Instalar o agente como servico
cd /d "%~dp0"

net session >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [ERRO] Este arquivo precisa ser executado como ADMINISTRADOR.
  echo.
  echo  Feche esta janela, clique com o botao DIREITO em
  echo  instalar-servico.bat e escolha "Executar como administrador".
  echo.
  pause
  exit /b 1
)

REM --- Achar o pythonw.exe (Python sem janela) ---------------------
set "PYW="
for /f "delims=" %%P in ('py -c "import sys,os;print(os.path.join(os.path.dirname(sys.executable),'pythonw.exe'))" 2^>nul') do set "PYW=%%P"
if not defined PYW (
  for /f "delims=" %%P in ('where pythonw 2^>nul') do set "PYW=%%P"
)
if not defined PYW (
  echo.
  echo  [ERRO] Nao encontrei o pythonw.exe.
  echo  Rode instalar.bat antes deste arquivo.
  echo.
  pause
  exit /b 1
)
if not exist "%PYW%" (
  echo.
  echo  [ERRO] Caminho do pythonw invalido: %PYW%
  echo.
  pause
  exit /b 1
)

echo.
echo  Python sem janela: %PYW%
echo  Pasta do agente:   %~dp0
echo.

REM --- Monta o XML da tarefa ---------------------------------------
REM Via XML, e nao pela linha de comando do schtasks, porque so' assim da'
REM para pedir reinicio automatico em caso de falha e execucao sem limite
REM de tempo — que e' o que transforma "um programa aberto" em "um
REM servico que se cuida sozinho".
set "XML=%TEMP%\agente-padaria.xml"

> "%XML%" echo ^<?xml version="1.0" encoding="UTF-16"?^>
>>"%XML%" echo ^<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task"^>
>>"%XML%" echo   ^<RegistrationInfo^>^<Description^>Agente de impressao - Padaria Pao de Mel^</Description^>^</RegistrationInfo^>
>>"%XML%" echo   ^<Triggers^>^<BootTrigger^>^<Enabled^>true^</Enabled^>^</BootTrigger^>^</Triggers^>
>>"%XML%" echo   ^<Principals^>^<Principal id="Author"^>^<UserId^>S-1-5-18^</UserId^>^<RunLevel^>HighestAvailable^</RunLevel^>^</Principal^>^</Principals^>
>>"%XML%" echo   ^<Settings^>
>>"%XML%" echo     ^<MultipleInstancesPolicy^>IgnoreNew^</MultipleInstancesPolicy^>
>>"%XML%" echo     ^<DisallowStartIfOnBatteries^>false^</DisallowStartIfOnBatteries^>
>>"%XML%" echo     ^<StopIfGoingOnBatteries^>false^</StopIfGoingOnBatteries^>
>>"%XML%" echo     ^<AllowHardTerminate^>true^</AllowHardTerminate^>
>>"%XML%" echo     ^<StartWhenAvailable^>true^</StartWhenAvailable^>
>>"%XML%" echo     ^<RunOnlyIfNetworkAvailable^>false^</RunOnlyIfNetworkAvailable^>
>>"%XML%" echo     ^<RestartOnFailure^>^<Interval^>PT1M^</Interval^>^<Count^>999^</Count^>^</RestartOnFailure^>
>>"%XML%" echo     ^<ExecutionTimeLimit^>PT0S^</ExecutionTimeLimit^>
>>"%XML%" echo     ^<Enabled^>true^</Enabled^>
>>"%XML%" echo     ^<Hidden^>false^</Hidden^>
>>"%XML%" echo     ^<RunOnlyIfIdle^>false^</RunOnlyIfIdle^>
>>"%XML%" echo     ^<Priority^>5^</Priority^>
>>"%XML%" echo   ^</Settings^>
>>"%XML%" echo   ^<Actions Context="Author"^>
>>"%XML%" echo     ^<Exec^>
>>"%XML%" echo       ^<Command^>%PYW%^</Command^>
>>"%XML%" echo       ^<Arguments^>"%~dp0agente.py"^</Arguments^>
>>"%XML%" echo       ^<WorkingDirectory^>%~dp0^</WorkingDirectory^>
>>"%XML%" echo     ^</Exec^>
>>"%XML%" echo   ^</Actions^>
>>"%XML%" echo ^</Task^>

schtasks /Create /TN "Agente de impressao Padaria" /XML "%XML%" /F
if errorlevel 1 (
  echo.
  echo  [ERRO] Nao consegui criar a tarefa.
  del "%XML%" >nul 2>nul
  pause
  exit /b 1
)
del "%XML%" >nul 2>nul

REM --- Tira o atalho antigo da pasta Inicializar, se existir --------
REM Os dois juntos rodariam duas copias do agente, cada uma pegando
REM metade da fila.
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Agente de impressao.lnk" >nul 2>nul

echo.
echo  Tarefa criada. Iniciando agora...
schtasks /Run /TN "Agente de impressao Padaria" >nul 2>nul

echo.
echo  ==========================================================
echo   PRONTO. O agente agora:
echo     - sobe sozinho quando o PC liga, antes do login
echo     - roda sem janela: ninguem fecha por engano
echo     - se travar, o Windows reinicia em 1 minuto
echo.
echo   Para conferir se esta rodando: estado-do-agente.bat
echo   Para acompanhar: agente.log, nesta pasta
echo  ==========================================================
echo.
pause
