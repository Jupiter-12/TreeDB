"""
Application Entry Point - 应用入口
负责应用的启动和初始化
遵循单一职责原则：只负责应用启动
"""

import os
import sys
import time
import threading
from http.server import ThreadingHTTPServer

# 确保可以导入本地模块
sys.path.insert(0, os.path.dirname(__file__))

from config.settings import config
from services.session_service import session_service
from services.database_service import database_service
from handlers.api import APIHandler


class TreeDBApplication:
    """TreeDB应用 - 单一职责：管理应用生命周期"""

    def __init__(self):
        self.server = None
        self.cleanup_thread = None
        self.running = False

    def initialize(self):
        """初始化应用"""
        print("Initializing TreeDB Server...")
        print(f"Host: {config.host}")
        print(f"Port: {config.port}")
        print(f"Static Directory: {config.STATIC_DIR}")
        print(f"Database: {config.db_path}")

        # 确保数据库结构
        database_service.ensure_schema()

        # 刷新元数据
        database_service.refresh_column_types()
        database_service.refresh_foreign_keys()

        print("Database initialized successfully")

    def start_cleanup_worker(self):
        """启动清理工作线程"""
        def cleanup_worker():
            """清理工作线程"""
            while self.running:
                try:
                    session_service.cleanup_expired_sessions()
                    time.sleep(60)  # 每分钟清理一次
                except Exception as e:
                    print(f"Cleanup worker error: {e}")
                    time.sleep(60)

        self.cleanup_thread = threading.Thread(target=cleanup_worker, daemon=True)
        self.cleanup_thread.start()
        print("Cleanup worker started")

    def create_server(self):
        """创建HTTP服务器"""
        self.server = ThreadingHTTPServer(
            (config.host, config.port),
            APIHandler
        )
        self.server.allow_reuse_address = True

    def run(self):
        """运行应用"""
        try:
            self.initialize()
            self.start_cleanup_worker()
            self.create_server()

            self.running = True
            print(f"\nServer listening on http://{config.host}:{config.port}")
            print("Press Ctrl+C to stop\n")

            self.server.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server...")
            self.stop()
        except Exception as e:
            print(f"Server error: {e}")
            self.stop()
            sys.exit(1)

    def stop(self):
        """停止应用"""
        self.running = False
        if self.server:
            self.server.shutdown()
            self.server.server_close()
        print("Server stopped")


def main():
    """主函数"""
    app = TreeDBApplication()
    app.run()


if __name__ == '__main__':
    main()