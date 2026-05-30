@echo off
setlocal enabledelayedexpansion

echo =======================================================================
echo               Maieutic Local Setup ^& Start Script
echo =======================================================================
echo.
echo   This script will check your environment, install dependencies,
echo   set up your database, and launch Maieutic.
echo.
echo   [Note] If any installation fails, please try running this file 
echo          as Administrator (Right-click -^> Run as administrator).
echo =======================================================================
echo.

:: Check for Git
where git >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [!] Git is not installed.
    echo [i] Attempting to install Git via winget...
    where winget >nul 2>&1
    if !ERRORLEVEL! neq 0 (
        echo [!] winget was not found. Please install Git manually:
        echo     https://git-scm.com/download/win
        pause
        exit /b 1
    )
    winget install -e --id Git.Git --accept-package-agreements --accept-source-agreements
    if !ERRORLEVEL! neq 0 (
        echo [!] Git installation failed. Please run as Administrator or install manually.
        pause
        exit /b 1
    )
    echo [OK] Git installed successfully.
    set "NEED_PATH_REFRESH=1"
) else (
    echo [OK] Git is already installed.
)

:: Check for Node.js
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [!] Node.js is not installed.
    set "INSTALL_NODE=1"
) else (
    :: Check Node.js version >= 20
    node -e "if (parseInt(process.versions.node.split('.')[0]) < 20) process.exit(1)" >nul 2>&1
    if !ERRORLEVEL! neq 0 (
        echo [!] Node.js version is older than v20.
        set "INSTALL_NODE=1"
    ) else (
        echo [OK] Node.js is already installed (v20+).
    )
)

if "!INSTALL_NODE!"=="1" (
    echo [i] Attempting to install/upgrade Node.js LTS via winget...
    where winget >nul 2>&1
    if !ERRORLEVEL! neq 0 (
        echo [!] winget was not found. Please install Node.js manually:
        echo     https://nodejs.org/en/download
        pause
        exit /b 1
    )
    winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    if !ERRORLEVEL! neq 0 (
        echo [!] Node.js installation failed. Please run as Administrator or install manually.
        pause
        exit /b 1
    )
    echo [OK] Node.js installed successfully.
    set "NEED_PATH_REFRESH=1"
)

:: Refresh Path if needed
if "!NEED_PATH_REFRESH!"=="1" (
    echo [i] Refreshing environment PATH...
    for /f "delims=" %%I in ('powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')"') do set "PATH=%%I"
)

:: Check for pnpm
where pnpm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [!] pnpm is not installed.
    echo [i] Attempting to install pnpm globally...
    call npm install -g pnpm
    if !ERRORLEVEL! neq 0 (
        echo [!] Failed to install pnpm via npm. Trying winget...
        winget install -e --id pnpm.pnpm --accept-package-agreements --accept-source-agreements
        if !ERRORLEVEL! neq 0 (
            echo [!] Failed to install pnpm. Please install it manually: npm install -g pnpm
            pause
            exit /b 1
        )
    )
    echo [OK] pnpm installed successfully.
    :: Refresh Path again for pnpm
    for /f "delims=" %%I in ('powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')"') do set "PATH=%%I"
) else (
    echo [OK] pnpm is already installed.
)

:: Final sanity check of path environment
where git >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Git is still not found in current session PATH.
    echo Please restart this batch script or open a new terminal window.
    pause
)
where node >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [WARNING] Node.js is still not found in current session PATH.
    echo Please restart this batch script or open a new terminal window.
    pause
)
where pnpm >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [WARNING] pnpm is still not found in current session PATH.
    echo Please restart this batch script or open a new terminal window.
    pause
)

:: Run environment setup and API key validation
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup-env.ps1"
if %ERRORLEVEL% neq 0 (
    echo [!] Environment setup script failed.
    pause
    exit /b 1
)

echo.
echo =======================================================================
echo   Installing Dependencies...
echo =======================================================================
call pnpm install
if %ERRORLEVEL% neq 0 (
    echo [!] Dependency installation failed.
    pause
    exit /b 1
)

echo.
echo =======================================================================
echo   Preparing Local Database...
echo =======================================================================
call pnpm prisma db push
if %ERRORLEVEL% neq 0 (
    echo [!] Database push failed.
    pause
    exit /b 1
)

echo.
echo =======================================================================
echo   Seeding Demo/Classroom Data...
echo =======================================================================
call pnpm reset-demo
if %ERRORLEVEL% neq 0 (
    echo [!] Database seeding failed.
    pause
    exit /b 1
)

echo.
echo =======================================================================
echo   Starting Server ^& Launching Browser...
echo =======================================================================
echo.
echo   * App will start at http://localhost:3000
echo   * Press Ctrl+C in this window to stop the server.
echo.

:: Launch browser in background after 3 seconds
start /b powershell -NoProfile -Command "Start-Sleep -Seconds 3; Start-Process 'http://localhost:3000'"

:: Run dev server
call pnpm dev

pause
