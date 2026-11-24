@echo off
setlocal
cd /d "%~dp0"

set "URL=http://localhost:8000/"

where py >nul 2>nul
if %errorlevel%==0 (
    start "Simulacra server" /min py -m http.server 8000 --bind 127.0.0.1
) else (
    where python >nul 2>nul
    if %errorlevel%==0 (
        start "Simulacra server" /min python -m http.server 8000 --bind 127.0.0.1
    ) else (
        echo Python non e' installato o non e' disponibile nel PATH.
        echo Installa Python 3 e riprova.
        pause
        exit /b 1
    )
)

timeout /t 2 /nobreak >nul
start "" "%URL%"
endlocal
