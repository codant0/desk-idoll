#!/usr/bin/env bash
set -e

echo "========================================"
echo "  AnimatedDrawings Service Launcher"
echo "========================================"
echo

# -- 检查 Python3 是否可用 --
if ! command -v python3 &> /dev/null; then
    echo "[ERROR] python3 not found. Please install Python 3.8+."
    exit 1
fi

# -- 切换到脚本所在目录 --
cd "$(dirname "$0")"

# -- 安装 / 更新依赖 --
echo "[INFO] Installing dependencies..."
pip3 install -r requirements.txt

echo
echo "[INFO] Starting AnimatedDrawings service on http://127.0.0.1:5000"
echo "[INFO] Press Ctrl+C to stop."
echo

# -- 启动服务 --
python3 server.py
