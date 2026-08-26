@echo off
REM ---------------------------------------------------------------
REM Descobre como chamar o Python neste PC e deixa em %PY%.
REM
REM POR QUE ISTO EXISTE (ago/2026)
REM Os .bat chamavam "python" direto. Funciona quando o instalador
REM classico do python.org e' usado com "Add Python to PATH" marcado.
REM Mas o python.org passou a distribuir o PYTHON INSTALL MANAGER, que
REM instala o atalho "py" e nem sempre deixa "python" no PATH — e ai o
REM dois cliques abria e fechava a janela sem dizer nada.
REM
REM Ordem de tentativa: "py -3" (o atalho oficial, que sabe achar a
REM versao certa) e depois "python" (instalacao classica).
REM ---------------------------------------------------------------

set "PY="

where py >nul 2>nul && set "PY=py -3"
if not defined PY (
  where python >nul 2>nul && set "PY=python"
)

if not defined PY (
  echo.
  echo  [ERRO] Python nao encontrado neste computador.
  echo.
  echo  Instale em https://www.python.org/downloads/
  echo  Na primeira tela do instalador, marque "Add Python to PATH".
  echo.
  exit /b 1
)

REM Ter o atalho nao garante que exista uma VERSAO instalada: o Install
REM Manager pode estar presente sem nenhum Python por baixo.
%PY% --version >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [ERRO] O atalho do Python existe, mas nenhuma versao esta instalada.
  echo.
  echo  Abra o Prompt de Comando e rode:  py install 3.13
  echo  Depois rode este arquivo de novo.
  echo.
  set "PY="
  exit /b 1
)

exit /b 0
