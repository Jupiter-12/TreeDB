"""
TreeDB Core Service
简化的树形数据库服务
遵循KISS原则，提供简洁的API
"""

import sqlite3
import json
from pathlib import Path
from typing import List, Dict, Any, Optional, Union
from contextlib import contextmanager
from datetime import datetime


class TreeDBError(Exception):
    """TreeDB基础异常类"""
    def __init__(self, message: str, code: int = 500):
        super().__init__(message)
        self.code = code
        self.message = message


class ValidationError(TreeDBError):
    """数据验证错误"""
    def __init__(self, message: str):
        super().__init__(message, 400)


class DatabaseError(TreeDBError):
    """数据库操作错误"""
    def __init__(self, message: str):
        super().__init__(message, 500)


class NotFoundError(TreeDBError):
    """资源未找到错误"""
    def __init__(self, message: str = 'Resource not found'):
        super().__init__(message, 404)


class TreeDBService:
    """
    简化的树形数据库服务
    单一职责：提供树形数据的CRUD操作
    """

    def __init__(self, db_path: Union[str, Path]):
        """
        初始化服务

        Args:
            db_path: 数据库文件路径
        """
        self.db_path = Path(db_path)
        self._table_cache = {}

    @contextmanager
    def get_connection(self, db_path: Optional[Path] = None):
        """
        获取数据库连接上下文管理器

        Args:
            db_path: 可选的数据库路径，默认使用初始化时的路径

        Yields:
            sqlite3.Connection: 数据库连接对象
        """
        path = db_path or self.db_path
        conn = sqlite3.connect(str(path), check_same_thread=False)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
        except sqlite3.Error as e:
            raise DatabaseError(f'Database operation failed: {str(e)}')
        finally:
            conn.close()

    def _ensure_table_exists(self, table_name: str, conn: sqlite3.Connection) -> None:
        """
        确保表存在，如果不存在则创建

        Args:
            table_name: 表名
            conn: 数据库连接
        """
        # 检查表是否已缓存
        if table_name in self._table_cache:
            return

        # 检查表是否存在
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type='table' AND name=?",
            (table_name,)
        )

        if not cursor.fetchone():
            # 创建基础表结构
            cursor.execute(f'''
                CREATE TABLE {table_name} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    parent_id INTEGER,
                    name TEXT NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (parent_id) REFERENCES {table_name}(id) ON DELETE CASCADE
                )
            ''')
            conn.commit()

        # 缓存表信息
        self._table_cache[table_name] = True

    def _validate_fields(self, data: Dict[str, Any], table_name: str,
                        conn: sqlite3.Connection) -> Dict[str, Any]:
        """
        验证并清理数据字段

        Args:
            data: 输入数据
            table_name: 表名
            conn: 数据库连接

        Returns:
            Dict[str, Any]: 清理后的数据
        """
        # 获取表结构
        cursor = conn.cursor()
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = {row['name'] for row in cursor.fetchall()}

        # 清理数据，只保留表中的字段
        cleaned_data = {}
        for key, value in data.items():
            if key in columns:
                cleaned_data[key] = value

        # 验证必需字段
        if 'name' in columns and not cleaned_data.get('name'):
            raise ValidationError('Name field is required')

        return cleaned_data

    def get_all_nodes(self, table_name: str = 'tree_nodes') -> List[Dict[str, Any]]:
        """
        获取所有节点数据

        Args:
            table_name: 表名，默认为 'tree_nodes'

        Returns:
            List[Dict[str, Any]]: 节点列表
        """
        with self.get_connection() as conn:
            self._ensure_table_exists(table_name, conn)

            cursor = conn.cursor()
            cursor.execute(f"SELECT * FROM {table_name} ORDER BY sort_order, name")

            return [dict(row) for row in cursor.fetchall()]

    def get_node_by_id(self, node_id: int, table_name: str = 'tree_nodes') -> Optional[Dict[str, Any]]:
        """
        根据ID获取节点

        Args:
            node_id: 节点ID
            table_name: 表名

        Returns:
            Optional[Dict[str, Any]]: 节点数据，如果不存在则返回None
        """
        with self.get_connection() as conn:
            self._ensure_table_exists(table_name, conn)

            cursor = conn.cursor()
            cursor.execute(
                f"SELECT * FROM {table_name} WHERE id = ?",
                (node_id,)
            )

            row = cursor.fetchone()
            return dict(row) if row else None

    def create_node(self, data: Dict[str, Any], table_name: str = 'tree_nodes') -> int:
        """
        创建新节点

        Args:
            data: 节点数据
            table_name: 表名

        Returns:
            int: 新创建节点的ID
        """
        with self.get_connection() as conn:
            self._ensure_table_exists(table_name, conn)

            # 验证和清理数据
            data = self._validate_fields(data, table_name, conn)

            # 添加时间戳
            data['created_at'] = datetime.now().isoformat()
            data['updated_at'] = datetime.now().isoformat()

            # 构建SQL
            columns = list(data.keys())
            placeholders = ', '.join(['?' for _ in columns])
            values = list(data.values())

            cursor = conn.cursor()
            cursor.execute(
                f"INSERT INTO {table_name} ({', '.join(columns)}) "
                f"VALUES ({placeholders})",
                values
            )

            conn.commit()
            return cursor.lastrowid

    def update_node(self, node_id: int, data: Dict[str, Any],
                   table_name: str = 'tree_nodes') -> bool:
        """
        更新节点

        Args:
            node_id: 节点ID
            data: 更新的数据
            table_name: 表名

        Returns:
            bool: 是否更新成功
        """
        with self.get_connection() as conn:
            self._ensure_table_exists(table_name, conn)

            # 验证和清理数据
            data = self._validate_fields(data, table_name, conn)

            if not data:
                return False

            # 添加更新时间戳
            data['updated_at'] = datetime.now().isoformat()

            # 构建SQL
            set_clause = ', '.join([f"{key} = ?" for key in data.keys()])
            values = list(data.values()) + [node_id]

            cursor = conn.cursor()
            cursor.execute(
                f"UPDATE {table_name} SET {set_clause} WHERE id = ?",
                values
            )

            conn.commit()
            return cursor.rowcount > 0

    def delete_node(self, node_id: int, table_name: str = 'tree_nodes') -> bool:
        """
        删除节点及其所有子节点

        Args:
            node_id: 节点ID
            table_name: 表名

        Returns:
            bool: 是否删除成功
        """
        with self.get_connection() as conn:
            self._ensure_table_exists(table_name, conn)

            # SQLite的ON DELETE CASCADE会自动删除子节点
            cursor = conn.cursor()
            cursor.execute(
                f"DELETE FROM {table_name} WHERE id = ?",
                (node_id,)
            )

            conn.commit()
            return cursor.rowcount > 0

    def get_table_meta(self, table_name: str = 'tree_nodes') -> Dict[str, Any]:
        """
        获取表的元数据信息

        Args:
            table_name: 表名

        Returns:
            Dict[str, Any]: 表元数据
        """
        with self.get_connection() as conn:
            self._ensure_table_exists(table_name, conn)

            # 获取表结构
            cursor = conn.cursor()
            cursor.execute(f"PRAGMA table_info({table_name})")
            columns = [dict(row) for row in cursor.fetchall()]

            # 识别主键和外键字段
            id_field = None
            parent_field = None
            name_field = None

            for col in columns:
                if col['pk'] == 1:
                    id_field = col['name']
                if 'parent' in col['name'].lower():
                    parent_field = col['name']
                if 'name' in col['name'].lower() and not name_field:
                    name_field = col['name']

            return {
                'table_name': table_name,
                'columns': columns,
                'id_field': id_field or 'id',
                'parent_field': parent_field or 'parent_id',
                'name_field': name_field or 'name'
            }

    def get_children(self, parent_id: Optional[int], table_name: str = 'tree_nodes') -> List[Dict[str, Any]]:
        """
        获取子节点

        Args:
            parent_id: 父节点ID，None表示获取根节点
            table_name: 表名

        Returns:
            List[Dict[str, Any]]: 子节点列表
        """
        with self.get_connection() as conn:
            self._ensure_table_exists(table_name, conn)

            cursor = conn.cursor()
            if parent_id is None:
                cursor.execute(
                    f"SELECT * FROM {table_name} "
                    f"WHERE parent_id IS NULL ORDER BY sort_order, name"
                )
            else:
                cursor.execute(
                    f"SELECT * FROM {table_name} "
                    f"WHERE parent_id = ? ORDER BY sort_order, name",
                    (parent_id,)
                )

            return [dict(row) for row in cursor.fetchall()]

    def move_node(self, node_id: int, new_parent_id: Optional[int],
                  table_name: str = 'tree_nodes') -> bool:
        """
        移动节点到新的父节点下

        Args:
            node_id: 要移动的节点ID
            new_parent_id: 新的父节点ID，None表示移动到根级别
            table_name: 表名

        Returns:
            bool: 是否移动成功
        """
        # 检查是否会形成循环
        if new_parent_id is not None and self._would_create_cycle(
            node_id, new_parent_id, table_name
        ):
            raise ValidationError('Cannot move node: would create a cycle')

        return self.update_node(node_id, {'parent_id': new_parent_id}, table_name)

    def _would_create_cycle(self, node_id: int, parent_id: int,
                           table_name: str, visited: Optional[set] = None) -> bool:
        """
        检查移动节点是否会形成循环

        Args:
            node_id: 要移动的节点ID
            parent_id: 目标父节点ID
            table_name: 表名
            visited: 已访问的节点ID集合

        Returns:
            bool: 是否会形成循环
        """
        if visited is None:
            visited = set()

        if node_id in visited:
            return True

        visited.add(node_id)

        # 获取父节点的所有祖先
        current_parent = parent_id
        while current_parent is not None:
            if current_parent == node_id:
                return True

            parent_data = self.get_node_by_id(current_parent, table_name)
            if not parent_data:
                break

            current_parent = parent_data.get('parent_id')

        return False