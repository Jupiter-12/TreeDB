#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
TreeDB Python服务器启动脚本
"""

import os
import sys
from pathlib import Path

# 设置工作目录为项目根目录
project_root = Path(__file__).parent
os.chdir(project_root)

# 设置数据库路径环境变量
db_path = project_root / 'data' / 'databases' / 'treedb.sqlite'
os.environ['DB_PATH'] = str(db_path.resolve())

# 添加server目录到Python路径
server_dir = project_root / 'server'
sys.path.insert(0, str(server_dir))

print(f"项目根目录: {project_root}")
print(f"服务器目录: {server_dir}")
print(f"数据库文件路径: {db_path.resolve()}")
print(f"数据库文件存在: {db_path.exists()}")
print(f"环境变量DB_PATH: {os.environ.get('DB_PATH')}")

# 导入并运行服务器
if __name__ == '__main__':
    try:
        # 检查端口是否被占用，如果是则使用备用端口
        port = int(os.environ.get('PORT', '3000'))

        # 如果3000端口被占用，尝试3001-3010
        if port == 3000:
            import socket
            for test_port in range(3000, 3011):
                try:
                    test_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                    test_socket.bind(('localhost', test_port))
                    test_socket.close()
                    port = test_port
                    break
                except OSError:
                    continue
            else:
                print("无法找到可用端口 3000-3010")
                sys.exit(1)

        # 设置端口环境变量
        os.environ['PORT'] = str(port)
        print(f"使用端口: {port}")

        # 导入并运行新的模块化应用
        # Change to server directory and run
        import subprocess
        import sys
        result = subprocess.run([sys.executable, 'app.py'], cwd='server')
        sys.exit(result.returncode)
    except KeyboardInterrupt:
        print("\n服务器已停止")
        sys.exit(0)
    except Exception as e:
        print(f"启动服务器时出错: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)