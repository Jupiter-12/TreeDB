"""
Database Service - 数据库服务
负责数据库连接、操作和元数据管理
遵循单一职责原则：只负责数据库操作
"""

import sqlite3
import os
from contextlib import contextmanager
from pathlib import Path
from typing import Dict, List, Any, Optional, Tuple, Union
from threading import RLock

from config.settings import config


class DatabaseService:
    """数据库服务 - 单一职责：管理数据库操作"""

    def __init__(self):
        self._db_path = config.db_path
        self._lock = RLock()
        self._connection_cache = {}

    @contextmanager
    def get_connection(self, db_path: Optional[Path] = None):
        """获取数据库连接上下文管理器"""
        path = db_path or self._db_path
        path_str = str(path)

        # 使用连接池
        thread_id = id(__import__('threading').current_thread())
        cache_key = (thread_id, path_str)

        with self._lock:
            if cache_key not in self._connection_cache:
                self._connection_cache[cache_key] = sqlite3.connect(
                    path_str,
                    check_same_thread=False,
                    timeout=30.0
                )
                # 启用外键约束
                self._connection_cache[cache_key].execute("PRAGMA foreign_keys = ON")
                # 设置行级锁定
                self._connection_cache[cache_key].execute("PRAGMA journal_mode = WAL")
                self._connection_cache[cache_key].execute("PRAGMA synchronous = NORMAL")

            conn = self._connection_cache[cache_key]

        try:
            yield conn
        except Exception:
            conn.rollback()
            raise

    def ensure_schema(self, db_path: Optional[Path] = None) -> None:
        """确保数据库表结构存在"""
        path = db_path or self._db_path

        # 确保数据库目录存在
        path.parent.mkdir(parents=True, exist_ok=True)

        with self.get_connection(path) as conn:
            cursor = conn.cursor()

            # 检查表是否存在
            cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{config.table_name}'")
            table_exists = cursor.fetchone()

            if not table_exists:
                # 创建基本表结构（只包含必需字段）
                cursor.execute(f'''
                    CREATE TABLE {config.table_name} (
                        {config.id_field} INTEGER PRIMARY KEY AUTOINCREMENT,
                        {config.parent_field} INTEGER DEFAULT NULL
                    )
                ''')

                # 创建索引
                cursor.execute(f'''
                    CREATE INDEX idx_{config.table_name}_{config.parent_field}
                    ON {config.table_name} ({config.parent_field})
                ''')

                # 自动初始化根节点
                if config.AUTO_BOOTSTRAP:
                    cursor.execute(f'''
                        INSERT INTO {config.table_name}
                        ({config.id_field}, {config.parent_field})
                        VALUES (1, NULL)
                    ''')

                conn.commit()

            # 检查并添加常用列（如果不存在）
            self._ensure_column_exists(conn, 'name', 'TEXT DEFAULT ""')
            # 不要强制添加sort_order列，使用动态检测

            conn.commit()

    def _ensure_column_exists(self, conn: sqlite3.Connection, column_name: str, column_def: str) -> bool:
        """确保列存在，如果不存在则添加"""
        cursor = conn.cursor()
        cursor.execute(f"PRAGMA table_info({config.table_name})")
        columns = [col[1] for col in cursor.fetchall()]

        if column_name not in columns:
            try:
                cursor.execute(f"ALTER TABLE {config.table_name} ADD COLUMN {column_name} {column_def}")
                return True
            except sqlite3.OperationalError as e:
                if "duplicate column name" in str(e).lower():
                    # Column already exists (likely due to race condition)
                    return False
                raise
        return False

    def refresh_column_types(self, db_path: Optional[Path] = None) -> None:
        """刷新列类型信息"""
        path = db_path or self._db_path

        with self.get_connection(path) as conn:
            cursor = conn.cursor()
            cursor.execute(f"PRAGMA table_info({config.table_name})")
            columns = cursor.fetchall()

            config.COLUMN_TYPES = {}
            for col in columns:
                _, col_name, col_type, _, _, _ = col
                col_type_upper = col_type.upper()
                if any(hint in col_type_upper for hint in config.INTEGER_TYPE_HINTS):
                    config.COLUMN_TYPES[col_name] = 'integer'
                elif any(hint in col_type_upper for hint in config.FLOAT_TYPE_HINTS):
                    config.COLUMN_TYPES[col_name] = 'float'
                elif any(hint in col_type_upper for hint in config.BOOLEAN_TYPE_HINTS):
                    config.COLUMN_TYPES[col_name] = 'boolean'
                else:
                    config.COLUMN_TYPES[col_name] = 'text'

    def refresh_foreign_keys(self, db_path: Optional[Path] = None) -> None:
        """刷新外键信息"""
        path = db_path or self._db_path

        with self.get_connection(path) as conn:
            cursor = conn.cursor()
            cursor.execute(f"PRAGMA foreign_key_list({config.table_name})")
            fks = cursor.fetchall()

            config.FOREIGN_KEYS = {}
            for fk in fks:
                _, _, table, from_col, to_col, _, _, _ = fk
                config.FOREIGN_KEYS[from_col] = {
                    'table': table,
                    'column': to_col
                }

    def collect_unique_info(self, conn: sqlite3.Connection, table_name: str) -> Dict[str, str]:
        """收集唯一列信息"""
        cursor = conn.cursor()
        info = {}

        # 主键
        cursor.execute(f"PRAGMA table_info({table_name})")
        columns = cursor.fetchall()
        for col in columns:
            _, col_name, _, _, _, is_pk = col
            if is_pk:
                info['primary'] = col_name
                break

        # 唯一约束
        cursor.execute(f"PRAGMA index_list({table_name})")
        indexes = cursor.fetchall()
        for idx in indexes:
            _, idx_name, is_unique, _, _ = idx
            if is_unique:
                cursor.execute(f"PRAGMA index_info({idx_name})")
                idx_cols = cursor.fetchall()
                if len(idx_cols) == 1:
                    _, _, col_name = idx_cols[0]
                    info['unique'] = col_name
                    break

        return info

    def fetch_foreign_options(self, column: str, limit: int = 500,
                            db_path: Optional[Path] = None) -> List[Dict[str, Any]]:
        """获取外键选项"""
        path = db_path or self._db_path

        if column not in config.FOREIGN_KEYS:
            return []

        fk_info = config.FOREIGN_KEYS[column]
        foreign_table = fk_info['table']
        foreign_column = fk_info['column']

        with self.get_connection(path) as conn:
            cursor = conn.cursor()

            # 获取主键和唯一列信息
            unique_info = self.collect_unique_info(conn, foreign_table)
            label_column = unique_info.get('unique', unique_info.get('primary', foreign_column))

            # 查询数据
            cursor.execute(f'''
                SELECT {foreign_column}, {label_column}
                FROM {foreign_table}
                ORDER BY {label_column}
                LIMIT ?
            ''', (limit,))

            results = []
            for value, label in cursor.fetchall():
                results.append({
                    'value': str(value),
                    'label': str(label) or f"ID {value}"
                })

        return results

    def rebuild_sort_order(self, db_path: Optional[Path] = None) -> None:
        """重建排序"""
        path = db_path or self._db_path

        with self.get_connection(path) as conn:
            cursor = conn.cursor()

            # 检查是否有sort_order列
            cursor.execute(f"PRAGMA table_info({config.table_name})")
            columns = [col[1] for col in cursor.fetchall()]

            # 如果没有排序列，尝试添加一个
            sort_column = None
            for possible_sort_col in ['sort_order', 'sort', 'sortorder', 'order_by']:
                if possible_sort_col in columns:
                    sort_column = possible_sort_col
                    break

            if not sort_column:
                # 添加sort_order列
                cursor.execute(f"ALTER TABLE {config.table_name} ADD COLUMN sort_order INTEGER DEFAULT 0")
                sort_column = 'sort_order'

            # 获取所有节点，按层级排序
            cursor.execute(f'''
                WITH RECURSIVE tree_path AS (
                    SELECT {config.id_field}, {config.parent_field}, 0 as depth
                    FROM {config.table_name}
                    WHERE {config.parent_field} IS NULL
                    UNION ALL
                    SELECT t.{config.id_field}, t.{config.parent_field}, tp.depth + 1
                    FROM {config.table_name} t
                    JOIN tree_path tp ON t.{config.parent_field} = tp.{config.id_field}
                )
                SELECT {config.id_field}
                FROM tree_path
                ORDER BY depth, {config.parent_field}, {config.id_field}
            ''')

            nodes = cursor.fetchall()
            sort_order = 10

            # 更新排序值
            for (node_id,) in nodes:
                cursor.execute(f'''
                    UPDATE {config.table_name}
                    SET {sort_column} = ?
                    WHERE {config.id_field} = ?
                ''', (sort_order, node_id))
                sort_order += 10

            conn.commit()

    def execute_query(self, query: str, params: Tuple = (),
                     db_path: Optional[Path] = None) -> List[Dict[str, Any]]:
        """执行查询"""
        path = db_path or self._db_path

        with self.get_connection(path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            cursor.execute(query, params)
            return [dict(row) for row in cursor.fetchall()]

    def execute_update(self, query: str, params: Tuple = (),
                      db_path: Optional[Path] = None) -> int:
        """执行更新"""
        path = db_path or self._db_path

        with self.get_connection(path) as conn:
            cursor = conn.cursor()
            cursor.execute(query, params)
            conn.commit()
            return cursor.rowcount

    def get_all_nodes(self, db_path: Optional[Path] = None) -> List[Dict[str, Any]]:
        """获取所有节点"""
        path = db_path or self._db_path

        with self.get_connection(path) as conn:
            # 先设置 row_factory
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            # 检查是否有排序列
            cursor.execute(f"PRAGMA table_info({config.table_name})")
            columns = [col[1] for col in cursor.fetchall()]

            # 动态构建ORDER BY子句
            order_by = config.id_field
            for possible_sort_col in ['sort_order', 'sort', 'sortorder', 'order_by']:
                if possible_sort_col in columns:
                    order_by = f"{possible_sort_col}, {config.id_field}"
                    break

            query = f"SELECT * FROM {config.table_name} ORDER BY {order_by}"
            cursor.execute(query)

            return [dict(row) for row in cursor.fetchall()]

    def create_node(self, data: Dict[str, Any],
                   db_path: Optional[Path] = None) -> int:
        """创建节点"""
        columns = list(data.keys())
        placeholders = ', '.join(['?' for _ in columns])
        query = f'''
            INSERT INTO {config.table_name} ({', '.join(columns)})
            VALUES ({placeholders})
        '''
        with self.get_connection(db_path) as conn:
            cursor = conn.cursor()
            cursor.execute(query, list(data.values()))
            conn.commit()
            return cursor.lastrowid

    def update_node(self, node_id: int, data: Dict[str, Any],
                   db_path: Optional[Path] = None) -> int:
        """更新节点"""
        if not data:
            return 0

        set_clause = ', '.join([f"{k} = ?" for k in data.keys()])
        query = f'''
            UPDATE {config.table_name}
            SET {set_clause}, updated_at = CURRENT_TIMESTAMP
            WHERE {config.id_field} = ?
        '''
        params = list(data.values()) + [node_id]
        return self.execute_update(query, tuple(params), db_path)

    def delete_node(self, node_id: int, db_path: Optional[Path] = None) -> int:
        """删除节点"""
        query = f'''
            DELETE FROM {config.table_name}
            WHERE {config.id_field} = ?
        '''
        return self.execute_update(query, (node_id,), db_path)

    def get_table_list(self, db_path: str) -> List[str]:
        """获取数据库中的所有表名"""
        try:
            with self.get_connection(Path(db_path)) as conn:
                cursor = conn.cursor()
                # 查询所有表名（排除系统表）
                cursor.execute("""
                    SELECT name FROM sqlite_master
                    WHERE type='table'
                    AND name NOT LIKE 'sqlite_%'
                    ORDER BY name
                """)
                tables = [row[0] for row in cursor.fetchall()]
                return tables
        except Exception as e:
            raise Exception(f"获取表列表失败: {str(e)}")


# 全局数据库服务实例
database_service = DatabaseService()