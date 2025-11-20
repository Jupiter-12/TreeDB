"""
Settings Module - 配置管理模块
负责应用配置的加载、管理和更新
遵循单一职责原则：只负责配置管理
"""

import os
import copy
import socket
from pathlib import Path
from threading import RLock
from typing import Dict, Any, Optional
from contextlib import contextmanager


class ConfigManager:
    """配置管理器 - 单一职责：管理应用配置"""

    def __init__(self):
        # 基础路径配置
        self.BASE_DIR = Path(__file__).resolve().parent.parent.parent
        self.STATIC_DIR = self.BASE_DIR / 'public'
        self.BROWSER_ROOT = Path(os.environ.get('TREE_DB_BROWSER_ROOT', self.BASE_DIR)).resolve()

        # 数据库配置
        self.DEFAULT_DB_PATH = (self.BASE_DIR / 'data' / 'databases' / 'treedb.sqlite').resolve()
        self.ALLOWED_DB_EXTENSIONS = {'.db', '.sqlite', '.sqlite3', '.sqlite2'}

        # 默认配置
        self._config = {
            'DB_PATH': str(Path(os.environ.get('DB_PATH', self.DEFAULT_DB_PATH)).resolve()),
            'TABLE_NAME': os.environ.get('TABLE_NAME', 'tree_nodes'),
            'ID_FIELD': os.environ.get('ID_FIELD', 'id'),
            'PARENT_FIELD': os.environ.get('PARENT_FIELD', 'parent_id'),
            'AUTO_BOOTSTRAP': os.environ.get('AUTO_BOOTSTRAP', 'true').lower() != 'false',
        }

        # 服务器配置
        self.HOST = os.environ.get('HOST', '127.0.0.1')
        # 如果指定了端口则使用，否则自动查找可用端口
        if 'PORT' in os.environ:
            self.PORT = int(os.environ.get('PORT'))
        else:
            self.PORT = self._find_available_port(3000, 3999)

        # 会话配置
        self.SESSION_TIMEOUT_SECONDS = int(os.environ.get('SESSION_TIMEOUT_SECONDS', '1800'))

        # 类型提示配置
        self.INTEGER_TYPE_HINTS = {'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT'}
        self.FLOAT_TYPE_HINTS = {'REAL', 'FLOAT', 'DOUBLE', 'NUMERIC', 'DECIMAL'}
        self.BOOLEAN_TYPE_HINTS = {'BOOLEAN', 'BOOL'}
        self.TRUTHY_STRINGS = {'true', '1', 'yes', 'y', 'on'}
        self.FALSY_STRINGS = {'false', '0', 'no', 'n', 'off'}

        # 运行时配置
        self.COLUMN_TYPES = {}
        self.FOREIGN_KEYS = {}
        self.COLUMN_INFO = {}

        # 锁
        self._lock = RLock()

        # 初始化运行时变量
        self._refresh_runtime_variables()

    def get_config_internal(self) -> Dict[str, Any]:
        """获取内部配置"""
        with self._lock:
            return copy.deepcopy(self._config)

    def get_config_snapshot(self) -> Dict[str, Any]:
        """获取配置快照"""
        with self._lock:
            return self.build_config_snapshot(self._config)

    def build_config_snapshot(self, cfg: Dict[str, Any]) -> Dict[str, Any]:
        """构建配置快照"""
        snapshot = {}
        for key, value in cfg.items():
            if isinstance(value, bool):
                snapshot[key] = str(value).lower()
            else:
                snapshot[key] = str(value)
        return snapshot

    def apply_config_updates(self, new_config: Dict[str, Any]) -> None:
        """应用配置更新"""
        with self._lock:
            self._config.update(new_config)
            self._refresh_runtime_variables()

    def _refresh_runtime_variables(self) -> None:
        """刷新运行时变量"""
        normalized_db_path = self.normalize_db_path(self._config.get('DB_PATH'))
        self._config['DB_PATH'] = normalized_db_path
        self.DB_PATH = Path(normalized_db_path)
        self.TABLE_NAME = self._config['TABLE_NAME']
        self.ID_FIELD = self._config['ID_FIELD']
        self.PARENT_FIELD = self._config['PARENT_FIELD']
        self.AUTO_BOOTSTRAP = self._config.get('AUTO_BOOTSTRAP', False)

    def update_server_config(self, new_config: Dict[str, Any]) -> Dict[str, Any]:
        """更新服务器配置"""
        with self._lock:
            old_config = self.get_config_snapshot()
            self.apply_config_updates(new_config)
            return old_config

    def normalize_db_path(self, value: Optional[Any]) -> str:
        """标准化数据库路径，确保相对路径基于项目根目录"""
        if not value:
            path = self.DEFAULT_DB_PATH
        else:
            path = Path(str(value))
            if not path.is_absolute():
                path = (self.BASE_DIR / path).resolve()
            else:
                path = path.resolve()
        return str(path)

    def make_resource_key(self, config: Optional[Dict[str, Any]] = None) -> tuple:
        """创建资源键"""
        if config is None:
            config = self._config
        return (config['DB_PATH'], config['TABLE_NAME'])

    @property
    def db_path(self) -> Path:
        """获取数据库路径"""
        return self.DB_PATH

    @property
    def table_name(self) -> str:
        """获取表名"""
        return self.TABLE_NAME

    @property
    def id_field(self) -> str:
        """获取ID字段"""
        return self.ID_FIELD

    @property
    def parent_field(self) -> str:
        """获取父级字段"""
        return self.PARENT_FIELD

    @property
    def host(self) -> str:
        """获取主机地址"""
        return self.HOST

    @property
    def port(self) -> int:
        """获取端口"""
        return self.PORT

    def parse_bool(self, value: Any) -> bool:
        """解析布尔值"""
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.lower().strip() in self.TRUTHY_STRINGS
        if isinstance(value, (int, float)):
            return value != 0
        return False

    def _find_available_port(self, start: int, end: int) -> int:
        """查找可用端口"""
        for port in range(start, end + 1):
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
                    sock.bind((self.HOST, port))
                    return port
            except OSError:
                continue
        # 如果没有找到可用端口，抛出异常
        raise RuntimeError(f"No available ports found between {start} and {end}")


# 全局配置实例
config = ConfigManager()
