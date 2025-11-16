"""
Helper Functions - 工具函数模块
负责通用的辅助函数
遵循单一职责原则：只提供工具函数
"""

import json
import os
from pathlib import Path
from typing import Dict, Any, List, Optional, Union, Tuple
from urllib.parse import unquote, parse_qs, urlparse

from config.settings import config


def sanitize_payload(payload: bytes) -> str:
    """清理载荷数据"""
    try:
        return payload.decode('utf-8')
    except UnicodeDecodeError:
        return payload.decode('utf-8', errors='replace')


def looks_like_int(value: str) -> bool:
    """检查字符串是否看起来像整数"""
    if not value:
        return False
    value = value.strip()
    if value.startswith(('+', '-')):
        value = value[1:]
    return value.isdigit()


def coerce_to_int(value: str) -> Optional[int]:
    """将字符串强制转换为整数"""
    try:
        return int(float(value))
    except (ValueError, TypeError):
        return None


def normalize_incoming_value(key: str, value: Any) -> Any:
    """规范化输入值"""
    if value is None:
        return None

    if key in config.COLUMN_TYPES:
        target_type = config.COLUMN_TYPES[key]
        str_value = str(value).strip()

        if target_type == 'integer':
            return coerce_to_int(str_value)
        elif target_type == 'float':
            try:
                return float(str_value)
            except ValueError:
                return None
        elif target_type == 'boolean':
            if str_value.lower() in config.TRUTHY_STRINGS:
                return True
            elif str_value.lower() in config.FALSY_STRINGS:
                return False
            else:
                return None

    return value


def resolve_browse_directory(raw_value: str) -> Path:
    """解析浏览目录"""
    if not raw_value:
        return config.BROWSER_ROOT

    try:
        # 尝试作为绝对路径
        path = Path(raw_value)
        if path.is_absolute():
            return path.resolve()
    except (OSError, ValueError):
        pass

    # 尝试作为相对路径
    try:
        path = config.BROWSER_ROOT / raw_value
        return path.resolve()
    except (OSError, ValueError):
        return config.BROWSER_ROOT


def is_allowed_db_file(path: Path) -> bool:
    """检查是否为允许的数据库文件"""
    if not path.is_file():
        return False
    return path.suffix.lower() in config.ALLOWED_DB_EXTENSIONS


def list_browse_entries(directory: Path) -> List[Dict[str, Any]]:
    """列出目录条目"""
    entries = []

    try:
        for item in sorted(directory.iterdir(), key=lambda p: (p.is_file(), p.name.lower())):
            try:
                stat = item.stat()
                entries.append({
                    'name': item.name,
                    'type': 'directory' if item.is_dir() else 'file',
                    'size': stat.st_size if item.is_file() else None,
                    'modified': stat.st_mtime,
                    'path': str(item.relative_to(config.BROWSER_ROOT))
                })
            except (OSError, PermissionError):
                continue
    except (OSError, PermissionError):
        pass

    return entries


def quote_ident(name: str) -> str:
    """引用标识符"""
    return f'"{name.replace('"', '""')}"'


def build_label_expression(label_columns: List[str], value_col: str) -> str:
    """构建标签表达式"""
    if not label_columns:
        return value_col
    if len(label_columns) == 1:
        return label_columns[0]
    parts = [f"COALESCE(NULLIF({col}, ''), '')" for col in label_columns]
    parts.append(value_col)
    return f"({', '.join(parts)})"


def build_order_expression(label_columns: List[str], value_col: str) -> str:
    """构建排序表达式"""
    if not label_columns:
        return value_col
    return build_label_expression(label_columns, value_col)


def dedupe_columns(columns: List[Tuple[str, str]]) -> List[str]:
    """去重列"""
    seen = set()
    result = []
    for name, _ in columns:
        if name not in seen:
            seen.add(name)
            result.append(name)
    return result


def build_final_label(label_value: Any, id_value: Any) -> str:
    """构建最终标签"""
    if label_value is None or label_value == '':
        return f"ID {id_value}"
    return str(label_value)


def detect_primary_key(conn, table_name: str, fallback: str) -> str:
    """检测主键"""
    cursor = conn.cursor()
    cursor.execute(f"PRAGMA table_info({table_name})")
    columns = cursor.fetchall()

    for _, col_name, _, _, _, is_pk in columns:
        if is_pk:
            return col_name

    return fallback


def parse_json_body(body: str) -> Dict[str, Any]:
    """解析JSON请求体"""
    try:
        return json.loads(body)
    except json.JSONDecodeError:
        return {}


def parse_query_string(query: str) -> Dict[str, List[str]]:
    """解析查询字符串"""
    if not query:
        return {}
    return {k: v if isinstance(v, list) else [v]
            for k, v in parse_qs(query).items()}


def extract_session_from_path(path: str) -> Optional[str]:
    """从路径中提取会话ID"""
    parts = path.strip('/').split('/')
    if 'session' in parts:
        idx = parts.index('session')
        if idx + 1 < len(parts):
            return unquote(parts[idx + 1])
    return None


def build_json_response(data: Any, status: int = 200) -> bytes:
    """构建JSON响应"""
    return json.dumps(data, ensure_ascii=False).encode('utf-8')


def build_error_response(message: str, status: int = 400) -> bytes:
    """构建错误响应"""
    return build_json_response({'error': message}, status)


def build_success_response(data: Any = None, message: str = "Success") -> bytes:
    """构建成功响应"""
    if data is None:
        return build_json_response({'message': message})
    return build_json_response({'message': message, 'data': data})


def validate_node_data(data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
    """验证节点数据"""
    if not isinstance(data, dict):
        return False, "Invalid data format"

    # 检查必需字段
    if config.parent_field in data and data[config.parent_field] is not None:
        try:
            int(data[config.parent_field])
        except (ValueError, TypeError):
            return False, f"Invalid {config.parent_field} value"

    return True, None


def validate_session_id(session_id: str) -> bool:
    """验证会话ID格式"""
    if not session_id:
        return False
    return len(session_id) == 36 and session_id.count('-') == 4


def normalize_path(path: str) -> str:
    """规范化路径"""
    # 确保路径以/开头
    if not path.startswith('/'):
        path = '/' + path
    # 移除多余的斜杠
    while '//' in path:
        path = path.replace('//', '/')
    return path


def get_content_type(path: str) -> str:
    """根据文件扩展名获取内容类型"""
    ext = Path(path).suffix.lower()
    content_types = {
        '.html': 'text/html; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.json': 'application/json; charset=utf-8',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ico': 'image/x-icon',
        '.txt': 'text/plain; charset=utf-8',
    }
    return content_types.get(ext, 'application/octet-stream')