@echo off
echo ==========================================
echo           TreeDB 数据库管理工具
echo ==========================================
echo.
echo 正在启动 Python 服务器...
cd /d "%~dp0"
python start.py
if errorlevel 1 (
    echo.
    echo 启动失败！请检查：
    echo 1. Python 是否已安装
    echo 2. 数据库文件是否存在: data\databases\treedb.sqlite
    echo 3. 端口 3000-3010 是否被占用
    echo.
    pause
)