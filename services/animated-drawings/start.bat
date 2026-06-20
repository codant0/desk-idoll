@echo off
setlocal

echo ========================================
echo   AnimatedDrawings Service Launcher
echo ========================================
echo.

REM -- 检查 Python 是否可用 --
python --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Python not found. Please install Python 3.8+ and add it to PATH.
    pause
    exit /b 1
)

REM -- 切换到脚本所在目录 --
cd /d "%~dp0"

REM -- 安装 / 更新依赖 --
echo [INFO] Installing dependencies...
pip install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] Failed to install dependencies.
    pause
    exit /b 1
)

echo.
echo [INFO] Starting AnimatedDrawings service on http://127.0.0.1:5000
echo [INFO] Press Ctrl+C to stop.
echo.

REM -- 启动服务 --
python server.py

pause
