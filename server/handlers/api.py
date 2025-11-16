"""
API Handler - API处理器
负责处理所有API请求
遵循单一职责原则：只负责API请求处理
"""

import json
from http.server import SimpleHTTPRequestHandler
from typing import Dict, Any, Optional
from urllib.parse import urlparse, parse_qs

from services.session_service import session_service
from services.database_service import database_service
from config.settings import config
from utils.helpers import (
    parse_json_body, parse_query_string, extract_session_from_path,
    build_json_response, build_error_response, build_success_response,
    validate_node_data, normalize_path, get_content_type
)


class APIHandler(SimpleHTTPRequestHandler):
    """API处理器 - 单一职责：处理HTTP请求"""

    # API路由映射
    API_ROUTES = {
        '/api/nodes': {
            'GET': 'handle_get_nodes',
            'POST': 'handle_create_node',
            'PUT': 'handle_update_node',
            'DELETE': 'handle_delete_node'
        },
        '/api/nodes/': {
            'GET': 'handle_get_node',
            'PUT': 'handle_update_node',
            'DELETE': 'handle_delete_node'
        },
        '/api/meta': {
            'GET': 'handle_get_meta'
        },
        '/api/foreign/': {
            'GET': 'handle_get_foreign'
        },
        '/api/config': {
            'GET': 'handle_get_config',
            'POST': 'handle_update_config'
        },
        '/api/config/db-files': {
            'GET': 'handle_get_db_files'
        },
        '/api/config/tables': {
            'GET': 'handle_get_tables'
        },
        '/api/session': {
            'GET': 'handle_get_session',
            'POST': 'handle_create_session',
            'PUT': 'handle_update_session',
            'DELETE': 'handle_delete_session'
        },
        '/api/restore': {
            'POST': 'handle_restore_nodes'
        },
        '/api/sort-rebuild': {
            'POST': 'handle_sort_rebuild'
        },
        '/api/browse': {
            'GET': 'handle_browse'
        }
    }

    def __init__(self, *args, directory=None, **kwargs):
        super().__init__(*args, directory=str(config.STATIC_DIR), **kwargs)

    def do_GET(self):
        """处理GET请求"""
        self._handle_request('GET')

    def do_POST(self):
        """处理POST请求"""
        self._handle_request('POST')

    def do_PUT(self):
        """处理PUT请求"""
        self._handle_request('PUT')

    def do_DELETE(self):
        """处理DELETE请求"""
        self._handle_request('DELETE')

    def _handle_request(self, method: str):
        """处理请求的通用逻辑"""
        try:
            # 解析路径
            path = normalize_path(self.path)
            parsed = urlparse(path)

            # 尝试匹配API路由
            handler = self._match_api_route(parsed.path, method)

            if handler:
                # 获取会话ID
                session_id = self._extract_session_id(parsed)

                # 验证会话（除了创建会话本身和删除会话）
                if parsed.path != '/api/session' and method != 'POST' and not (parsed.path == '/api/session' and method == 'DELETE'):
                    if not session_id:
                        self._send_error('Missing session identifier', 401)
                        return

                    session = session_service.get_session(session_id)
                    if not session:
                        self._send_error('Invalid or expired session', 401)
                        return

                # 调用处理器
                getattr(self, handler)(parsed, session_id)
            else:
                # 尝试提供静态文件（不需要会话验证）
                self.serve_static_file(parsed.path)

        except Exception as e:
            self._send_error(f'Internal server error: {str(e)}', 500)

    def _match_api_route(self, path: str, method: str) -> Optional[str]:
        """匹配API路由"""
        # 特殊处理根路径
        if path == '/':
            return None

        # 精确匹配
        if path in self.API_ROUTES:
            return self.API_ROUTES[path].get(method)

        # 模糊匹配
        for route, methods in self.API_ROUTES.items():
            if route.endswith('/') and path.startswith(route):
                return methods.get(method)
            elif path != '/' and path.endswith('/') and route.startswith(path):
                return methods.get(method)

        return None

    def _extract_session_id(self, parsed) -> Optional[str]:
        """提取会话ID"""
        # 从查询参数提取
        query_params = parse_qs(parsed.query)
        session_query = query_params.get('session')
        if session_query:
            return session_query[0]

        # 从路径提取
        return extract_session_from_path(parsed.path)

    def _send_response(self, data: bytes, status: int = 200,
                      content_type: str = 'application/json; charset=utf-8'):
        """发送响应"""
        self.send_response(status)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        self.wfile.write(data)

    def _send_json(self, data: Any, status: int = 200):
        """发送JSON响应"""
        response = build_json_response(data, status)
        self._send_response(response, status)

    def _send_error(self, message: str, status: int = 400):
        """发送错误响应"""
        response = build_error_response(message, status)
        self._send_response(response, status)

    def _send_success(self, data: Any = None, message: str = "Success", status: int = 200):
        """发送成功响应"""
        response = build_success_response(data, message)
        self._send_response(response, status)

    def serve_static_file(self, path: str):
        """提供静态文件"""
        # 移除查询参数
        if '?' in path:
            path = path.split('?')[0]

        # 默认文件
        if path == '/':
            path = '/index.html'

        # 构建文件路径
        file_path = config.STATIC_DIR / path.lstrip('/')

        # 检查文件是否存在
        if not file_path.exists() or not file_path.is_file():
            self._send_error('File not found', 404)
            return

        # 读取文件
        try:
            with open(file_path, 'rb') as f:
                content = f.read()

            content_type = get_content_type(path)
            self._send_response(content, 200, content_type)
        except IOError:
            self._send_error('Failed to read file', 500)

    # ==================== Node Handlers ====================

    def handle_get_nodes(self, parsed, session_id: str):
        """获取所有节点"""
        nodes = database_service.get_all_nodes()
        self._send_json(nodes)

    def handle_get_node(self, parsed, session_id: str):
        """获取单个节点"""
        node_id = parsed.path.split('/')[-1]
        try:
            node_id = int(node_id)
        except ValueError:
            self._send_error('Invalid node ID', 400)
            return

        nodes = database_service.execute_query(
            f"SELECT * FROM {config.table_name} WHERE {config.id_field} = ?",
            (node_id,)
        )

        if nodes:
            self._send_json(nodes[0])
        else:
            self._send_error('Node not found', 404)

    def handle_create_node(self, parsed, session_id: str):
        """创建节点"""
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')
        data = parse_json_body(body)

        # 验证数据
        is_valid, error = validate_node_data(data)
        if not is_valid:
            self._send_error(error, 400)
            return

        # 创建节点
        node_id = database_service.create_node(data)
        self._send_success({'id': node_id}, 'Node created successfully', 201)

    def handle_update_node(self, parsed, session_id: str):
        """更新节点"""
        node_id = parsed.path.split('/')[-1]
        try:
            node_id = int(node_id)
        except ValueError:
            self._send_error('Invalid node ID', 400)
            return

        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')
        data = parse_json_body(body)

        # 验证数据
        is_valid, error = validate_node_data(data)
        if not is_valid:
            self._send_error(error, 400)
            return

        # 更新节点
        rows_affected = database_service.update_node(node_id, data)
        if rows_affected > 0:
            self._send_success(message='Node updated successfully')
        else:
            self._send_error('Node not found', 404)

    def handle_delete_node(self, parsed, session_id: str):
        """删除节点"""
        node_id = parsed.path.split('/')[-1]
        try:
            node_id = int(node_id)
        except ValueError:
            self._send_error('Invalid node ID', 400)
            return

        # 删除节点
        rows_affected = database_service.delete_node(node_id)
        if rows_affected > 0:
            self._send_success(message='Node deleted successfully')
        else:
            self._send_error('Node not found', 404)

    # ==================== Meta Handlers ====================

    def handle_get_meta(self, parsed, session_id: str):
        """获取元数据"""
        database_service.refresh_column_types()
        database_service.refresh_foreign_keys()

        meta = {
            'columns': config.COLUMN_TYPES,
            'foreignKeys': config.FOREIGN_KEYS,
            'columnInfo': config.COLUMN_INFO
        }
        self._send_json(meta)

    # ==================== Foreign Handlers ====================

    def handle_get_foreign(self, parsed, session_id: str):
        """获取外键选项"""
        column = parsed.path.split('/')[-1]
        options = database_service.fetch_foreign_options(column)
        self._send_json(options)

    # ==================== Config Handlers ====================

    def handle_get_config(self, parsed, session_id: str):
        """获取配置"""
        config_snapshot = config.get_config_snapshot()
        self._send_json(config_snapshot)

    def handle_update_config(self, parsed, session_id: str):
        """更新配置"""
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')
        new_config = parse_json_body(body)

        # 更新会话配置
        session = session_service.get_session(session_id)
        if session:
            session_service.update_session(session_id, new_config)

        # 更新服务器配置
        old_config = config.update_server_config(new_config)

        # 重新初始化数据库
        database_service._db_path = config.db_path
        database_service.ensure_schema()

        self._send_success(message='Configuration updated successfully')

    # ==================== Session Handlers ====================

    def handle_get_session(self, parsed, session_id: str):
        """获取会话信息"""
        sessions = session_service.get_all_sessions()
        self._send_json(sessions)

    def handle_create_session(self, parsed, session_id: str):
        """创建会话"""
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')
        config_payload = parse_json_body(body)

        try:
            session = session_service.create_session(config_payload)
            self._send_success(
                {'sessionId': session.id, 'config': session.config},
                'Session created successfully',
                201
            )
        except Exception as e:
            self._send_error(str(e), 409)

    def handle_update_session(self, parsed, session_id: str):
        """更新会话"""
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')
        config_payload = parse_json_body(body)

        # 检查是否强制更新
        query_params = parse_qs(parsed.query)
        force = query_params.get('force', ['false'])[0].lower() == 'true'

        try:
            session = session_service.update_session(session_id, config_payload, force)
            self._send_success(
                {'sessionId': session.id, 'config': session.config},
                'Session updated successfully'
            )
        except Exception as e:
            self._send_error(str(e), 409)

    def handle_delete_session(self, parsed, session_id: str):
        """删除会话"""
        if session_id:
            # 删除指定的会话
            session_service.destroy_session(session_id)
            self._send_success(message='Session deleted successfully')
        else:
            # 没有提供会话ID，可能是清理请求
            self._send_error('Session ID required', 400)

    # ==================== Other Handlers ====================

    def handle_restore_nodes(self, parsed, session_id: str):
        """恢复节点"""
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')
        data = parse_json_body(body)

        nodes = data.get('nodes', [])
        restored_count = 0

        for node in nodes:
            if isinstance(node, dict) and 'id' in node:
                node_id = node['id']
                del node['id']
                if database_service.update_node(node_id, node) > 0:
                    restored_count += 1
                else:
                    # 尝试创建
                    database_service.create_node(node)
                    restored_count += 1

        self._send_success(
            {'restored': restored_count},
            f'Restored {restored_count} nodes'
        )

    def handle_sort_rebuild(self, parsed, session_id: str):
        """重建排序"""
        database_service.rebuild_sort_order()
        self._send_success(message='Sort order rebuilt successfully')

    def handle_get_db_files(self, parsed, session_id: str):
        """获取数据库文件列表"""
        # 这里可以实现数据库文件浏览逻辑
        self._send_json([])

    def handle_get_tables(self, parsed, session_id: str):
        """获取表列表"""
        # 这里可以实现表列表获取逻辑
        self._send_json([])

    def handle_browse(self, parsed, session_id: str):
        """浏览文件"""
        # 这里可以实现文件浏览逻辑
        self._send_json([])

    def do_OPTIONS(self):
        """处理OPTIONS请求（CORS预检）"""
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()