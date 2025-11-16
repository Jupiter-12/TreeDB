"""
Server Compatibility Layer - 服务器兼容层
为了保持向后兼容，将原来的server.py重命名
使用新的模块化架构
"""

# 导入新的应用入口
from .app import TreeDBApplication, main

# 导出主要函数以保持兼容
def run_server():
    """运行服务器（兼容旧接口）"""
    app = TreeDBApplication()
    app.run()

# 主函数（兼容直接运行此文件）
if __name__ == '__main__':
    main()