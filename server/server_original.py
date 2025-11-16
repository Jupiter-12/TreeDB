import json
import os
import sqlite3
import threading
import time
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from urllib.parse import unquote
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from threading import RLock
from uuid import uuid4
from datetime import datetime, timedelta
from contextlib import contextmanager
import copy

BASE_DIR = Path(__file__).resolve().parent.parent  # 回到项目根目录
STATIC_DIR = BASE_DIR / 'public'  # 静态文件目录
BROWSER_ROOT = Path(os.environ.get('TREE_DB_BROWSER_ROOT', BASE_DIR)).resolve()
ALLOWED_DB_EXTENSIONS = {'.db', '.sqlite', '.sqlite3', '.sqlite2'}
CONFIG_LOCK = RLock()
# 简化数据库路径设置，直接使用绝对路径
DEFAULT_DB_PATH = BASE_DIR / 'data' / 'databases' / 'treedb.sqlite'
CONFIG = {
    'DB_PATH': str(Path(os.environ.get('DB_PATH', DEFAULT_DB_PATH)).resolve()),  # 数据库放在data/databases目录
    'TABLE_NAME': os.environ.get('TABLE_NAME', 'tree_nodes'),
    'ID_FIELD': os.environ.get('ID_FIELD', 'id'),
    'PARENT_FIELD': os.environ.get('PARENT_FIELD', 'parent_id'),
    'AUTO_BOOTSTRAP': os.environ.get('AUTO_BOOTSTRAP', 'true').lower() != 'false',
}
HOST = os.environ.get('HOST', '127.0.0.1')
PORT = int(os.environ.get('PORT', '3000'))
COLUMN_TYPES = {}
FOREIGN_KEYS = {}
COLUMN_INFO = {}

SESSION_LOCK = RLock()
SESSIONS = {}
RESOURCE_LOCKS = {}
SESSION_TIMEOUT_SECONDS = int(os.environ.get('SESSION_TIMEOUT_SECONDS', '1800'))

INTEGER_TYPE_HINTS = {'INT', 'INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT'}
FLOAT_TYPE_HINTS = {'REAL', 'FLOAT', 'DOUBLE', 'NUMERIC', 'DECIMAL'}
BOOLEAN_TYPE_HINTS = {'BOOLEAN', 'BOOL'}
TRUTHY_STRINGS = {'true', '1', 'yes', 'y', 'on'}
FALSY_STRINGS = {'false', '0', 'no', 'n', 'off'}

DB_PATH = Path(CONFIG['DB_PATH'])
TABLE_NAME = CONFIG['TABLE_NAME']
ID_FIELD = CONFIG['ID_FIELD']
PARENT_FIELD = CONFIG['PARENT_FIELD']
AUTO_BOOTSTRAP = CONFIG['AUTO_BOOTSTRAP']


def get_config_internal():
    with CONFIG_LOCK:
        return dict(CONFIG)


def get_config_snapshot():
    cfg = get_config_internal()
    return build_config_snapshot(cfg)


def build_config_snapshot(cfg):
    return {
        'db_path': cfg['DB_PATH'],
        'table_name': cfg['TABLE_NAME'],
        'id_field': cfg['ID_FIELD'],
        'parent_field': cfg['PARENT_FIELD'],
        'auto_bootstrap': cfg['AUTO_BOOTSTRAP'],
    }


def apply_config_updates(new_config):
    with CONFIG_LOCK:
        CONFIG.update(new_config)
    refresh_runtime_variables()


def refresh_runtime_variables():
    global DB_PATH, TABLE_NAME, ID_FIELD, PARENT_FIELD, AUTO_BOOTSTRAP
    cfg = get_config_internal()
    DB_PATH = Path(cfg['DB_PATH'])
    TABLE_NAME = cfg['TABLE_NAME']
    ID_FIELD = cfg['ID_FIELD']
    PARENT_FIELD = cfg['PARENT_FIELD']
    AUTO_BOOTSTRAP = cfg['AUTO_BOOTSTRAP']


class SessionConflictError(Exception):
    pass


class SessionNotFoundError(Exception):
    pass


def make_resource_key(config):
    return (config['DB_PATH'], config['TABLE_NAME'])


def cleanup_expired_sessions_locked(now=None):
    if SESSION_TIMEOUT_SECONDS <= 0:
        return
    reference = now or datetime.utcnow()

    # 清理过期的会话（超过30分钟未活动）
    expired_ids = []
    for session_id, session in list(SESSIONS.items()):
        last_seen = session.get('last_seen')
        if not last_seen:
            continue
        if reference - last_seen > timedelta(seconds=SESSION_TIMEOUT_SECONDS):
            expired_ids.append(session_id)

    # 清理超过5分钟未活动的会话（更积极的清理）
    stale_threshold = timedelta(minutes=5)
    stale_ids = []
    for session_id, session in list(SESSIONS.items()):
        last_seen = session.get('last_seen')
        if not last_seen:
            continue
        if reference - last_seen > stale_threshold and session_id not in expired_ids:
            stale_ids.append(session_id)

    # 清理所有过期的和陈旧的会话
    for session_id in expired_ids + stale_ids:
        session = SESSIONS.pop(session_id, None)
        if not session:
            continue
        key = make_resource_key(session['config'])
        if RESOURCE_LOCKS.get(key) == session_id:
            RESOURCE_LOCKS.pop(key, None)


def get_session_record(session_id, touch=True):
    if not session_id:
        return None
    with SESSION_LOCK:
        cleanup_expired_sessions_locked()
        session = SESSIONS.get(session_id)
        if session and touch:
            session['last_seen'] = datetime.utcnow()
        return session


@contextmanager
def session_context(session, *, refresh_meta=False, ensure_schema_required=False):
    global COLUMN_TYPES, FOREIGN_KEYS, COLUMN_INFO
    if session is None:
        raise SessionNotFoundError('会话不存在')
    with CONFIG_LOCK:
        previous_config = get_config_internal()
        previous_column_types = COLUMN_TYPES
        previous_foreign_keys = FOREIGN_KEYS
        previous_column_info = COLUMN_INFO
        try:
            apply_config_updates(session['config'])
            session.setdefault('column_types', {})
            session.setdefault('foreign_keys', {})
            session.setdefault('column_info', {})
            COLUMN_TYPES = session['column_types']
            FOREIGN_KEYS = session['foreign_keys']
            COLUMN_INFO = session['column_info']
            if ensure_schema_required:
                ensure_schema()
            if refresh_meta or session.get('meta_dirty', True):
                refresh_column_types()
                session['meta_dirty'] = False
            yield
        finally:
            COLUMN_TYPES = previous_column_types
            FOREIGN_KEYS = previous_foreign_keys
            COLUMN_INFO = previous_column_info
            apply_config_updates(previous_config)


def initialize_session(session, *, ensure_schema_flag=True):
    with session_context(session, refresh_meta=True, ensure_schema_required=ensure_schema_flag):
        pass


def build_session_record(config):
    now = datetime.utcnow()
    return {
        'id': uuid4().hex,
        'config': config,
        'column_types': {},
        'column_info': {},
        'foreign_keys': {},
        'meta_dirty': True,
        'created_at': now,
        'last_seen': now,
    }


def create_session(config_payload):
    normalized = normalize_config_payload(config_payload)
    session = build_session_record(normalized)
    resource_key = make_resource_key(normalized)
    with SESSION_LOCK:
        cleanup_expired_sessions_locked()
        owner = RESOURCE_LOCKS.get(resource_key)
        if owner and owner in SESSIONS:
            raise SessionConflictError('该数据库及数据表正在被其他会话使用。')
        SESSIONS[session['id']] = session
        RESOURCE_LOCKS[resource_key] = session['id']
    try:
        initialize_session(session)
    except Exception:
        with SESSION_LOCK:
            SESSIONS.pop(session['id'], None)
            if RESOURCE_LOCKS.get(resource_key) == session['id']:
                RESOURCE_LOCKS.pop(resource_key, None)
        raise
    return session


def update_session_config(session_id, config_payload, force=False):
    normalized = normalize_config_payload(config_payload)
    with SESSION_LOCK:
        cleanup_expired_sessions_locked()
        session = SESSIONS.get(session_id)
        if not session:
            raise SessionNotFoundError('会话不存在或已过期。')
        old_config = session['config']
        old_key = make_resource_key(old_config)
        new_key = make_resource_key(normalized)
        if new_key != old_key:
            owner = RESOURCE_LOCKS.get(new_key)
            if owner and owner != session_id:
                if not force:
                    raise SessionConflictError('该数据库及数据表正在被其他会话使用。')
                else:
                    # 强制释放其他会话
                    if owner in SESSIONS:
                        SESSIONS.pop(owner, None)
        session['config'] = normalized
        session['column_types'] = {}
        session['column_info'] = {}
        session['foreign_keys'] = {}
        session['meta_dirty'] = True
        session['last_seen'] = datetime.utcnow()
        RESOURCE_LOCKS[new_key] = session_id
        if new_key != old_key and RESOURCE_LOCKS.get(old_key) == session_id:
            RESOURCE_LOCKS.pop(old_key, None)
    try:
        initialize_session(session)
    except Exception:
        with SESSION_LOCK:
            session['config'] = old_config
            session['column_types'] = {}
            session['column_info'] = {}
            session['foreign_keys'] = {}
            session['meta_dirty'] = True
            RESOURCE_LOCKS[old_key] = session_id
            if RESOURCE_LOCKS.get(new_key) == session_id:
                RESOURCE_LOCKS.pop(new_key, None)
        raise
    return session


def destroy_session(session_id):
    with SESSION_LOCK:
        session = SESSIONS.pop(session_id, None)
        if not session:
            return False
        resource_key = make_resource_key(session['config'])
        if RESOURCE_LOCKS.get(resource_key) == session_id:
            RESOURCE_LOCKS.pop(resource_key, None)
        return True
def parse_bool(value):
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {'true', '1', 'yes', 'y', 'on'}:
            return True
        if lowered in {'false', '0', 'no', 'n', 'off'}:
            return False
    return False


def resolve_browse_directory(raw_value):
    if raw_value is None or str(raw_value).strip() == '':
        candidate = BROWSER_ROOT
    else:
        candidate = Path(str(raw_value)).expanduser()
        if not candidate.is_absolute():
            candidate = (BROWSER_ROOT / candidate).resolve()
    resolved = candidate.resolve()
    if not resolved.exists():
        raise FileNotFoundError('目录不存在')
    if not resolved.is_dir():
        raise NotADirectoryError('目标不是目录')
    return resolved


def is_allowed_db_file(path: Path) -> bool:
    return path.is_file() and path.suffix.lower() in ALLOWED_DB_EXTENSIONS


def list_browse_entries(directory: Path):
    entries = []
    try:
        for item in sorted(directory.iterdir(), key=lambda p: (p.is_file(), p.name.lower())):
            resolved = item.resolve()
            if item.is_dir():
                entry = {
                    'type': 'directory',
                    'name': item.name,
                    'path': str(resolved),
                }
            elif is_allowed_db_file(item):
                entry = {
                    'type': 'file',
                    'name': item.name,
                    'path': str(resolved),
                }
            else:
                continue
            try:
                entry['relative_path'] = str(resolved.relative_to(BROWSER_ROOT))
            except ValueError:
                entry['relative_path'] = None
            entries.append(entry)
    except OSError as exc:
        raise RuntimeError(f'读取目录失败: {exc}') from exc
    return entries


def normalize_config_payload(payload):
    if not isinstance(payload, dict):
        raise ValueError('配置格式应为对象')
    required_keys = ['db_path', 'table_name', 'id_field', 'parent_field']
    for key in required_keys:
        if key not in payload:
            raise ValueError(f'缺少配置字段: {key}')
    db_path_raw = str(payload.get('db_path', '')).strip()
    if not db_path_raw:
        raise ValueError('数据库路径不能为空')
    table_name = str(payload.get('table_name', '')).strip()
    if not table_name:
        raise ValueError('表名不能为空')
    id_field = str(payload.get('id_field', '')).strip()
    if not id_field:
        raise ValueError('主键字段不能为空')
    parent_field = str(payload.get('parent_field', '')).strip()
    if not parent_field:
        raise ValueError('父节点字段不能为空')
    auto_bootstrap = parse_bool(payload.get('auto_bootstrap', False))
    try:
        resolved_path = str(Path(db_path_raw).expanduser().resolve())
    except OSError as exc:
        raise ValueError(f'无法解析数据库路径: {exc}')
    return {
        'DB_PATH': resolved_path,
        'TABLE_NAME': table_name,
        'ID_FIELD': id_field,
        'PARENT_FIELD': parent_field,
        'AUTO_BOOTSTRAP': auto_bootstrap,
    }


def update_server_config(new_config):
    old_config = get_config_internal()
    try:
        apply_config_updates(new_config)
        ensure_schema()
        refresh_column_types()
    except sqlite3.Error:
        apply_config_updates(old_config)
        refresh_column_types()
        raise


def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA foreign_keys = ON')
    return conn


def ensure_schema():
    if not AUTO_BOOTSTRAP:
        refresh_column_types()
        return
    with get_connection() as conn:
        table_q = quote_ident(TABLE_NAME)
        id_q = quote_ident(ID_FIELD)
        parent_q = quote_ident(PARENT_FIELD)
        conn.execute(
            f"""
            CREATE TABLE IF NOT EXISTS {table_q} (
              {id_q} INTEGER PRIMARY KEY AUTOINCREMENT,
              {parent_q} INTEGER REFERENCES {table_q}({id_q}) ON DELETE SET NULL,
              name TEXT,
              manager TEXT,
              budget REAL
            )
            """
        )
        cur = conn.execute(f"SELECT COUNT(*) AS count FROM {table_q}")
        row = cur.fetchone()
        if row and row[0] == 0:
            conn.executemany(
                f"INSERT INTO {table_q} ({parent_q}, name, manager, budget) VALUES (?, ?, ?, ?)",
                [
                    (None, '总部', 'Alice', 3_000_000),
                    (1, '财务部', 'Bob', 800_000),
                    (1, '技术部', 'Carol', 1_200_000),
                    (3, '后端组', 'David', 450_000),
                    (3, '前端组', 'Eve', 420_000),
                ],
            )
    refresh_column_types()


class TreeRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/meta':
            return self.handle_meta(parsed)
        if parsed.path == '/api/nodes':
            return self.handle_get_nodes(parsed)
        if parsed.path == '/api/config':
            return self.handle_get_config(parsed)
        if parsed.path == '/api/config/db-files':
            return self.handle_browse_databases(parsed)
        if parsed.path == '/api/config/tables':
            return self.handle_list_tables(parsed)
        if parsed.path.startswith('/api/foreign/'):
            column = self.extract_foreign_column(parsed.path)
            return self.handle_foreign_options(parsed, column)
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/nodes':
            return self.handle_create_node(parsed)
        if parsed.path == '/api/nodes/restore':
            return self.handle_restore_nodes(parsed)
        if parsed.path == '/api/sort-order/rebuild':
            return self.handle_rebuild_sort_order(parsed)
        if parsed.path == '/api/config':
            return self.handle_update_config(parsed)
        return self.send_error(404, 'Not Found')

    def do_PUT(self):
        parsed = urlparse(self.path)
        node_id = self.extract_id(parsed.path)
        if node_id is None:
            return self.send_error(404, 'Not Found')
        return self.handle_update_node(parsed, node_id)

    def do_DELETE(self):
        parsed = urlparse(self.path)
        if parsed.path == '/api/session':
            return self.handle_delete_session(parsed)
        node_id = self.extract_id(parsed.path)
        if node_id is None:
            return self.send_error(404, 'Not Found')
        return self.handle_delete_node(parsed, node_id)

    def log_message(self, format, *args):
        # Keep default logging but prefix for clarity
        super().log_message("[TreeServer] " + format, *args)

    @staticmethod
    def extract_session_id_param(parsed):
        params = parse_qs(parsed.query)
        values = params.get('session') if params else None
        if not values:
            return None
        for value in values:
            if value is None:
                continue
            candidate = value.strip()
            if candidate:
                return candidate
        return None

    def require_session(self, parsed, *, touch=True):
        session_id = self.extract_session_id_param(parsed)
        if not session_id:
            header_value = self.headers.get('X-Session-Id')
            if header_value:
                candidate = header_value.strip()
                if candidate:
                    session_id = candidate
        if not session_id:
            self.send_json(400, {'error': '缺少会话标识。'})
            return None, None
        session = get_session_record(session_id, touch=touch)
        if not session:
            self.send_json(410, {'error': '会话不存在或已过期。'})
            return None, None
        return session_id, session

    def handle_meta(self, parsed):
        session_id, session = self.require_session(parsed)
        if not session:
            return
        try:
            with session_context(session, refresh_meta=True):
                payload = {
                    'columns': dict(COLUMN_TYPES),
                    'foreign_keys': copy.deepcopy(FOREIGN_KEYS),
                    'column_info': copy.deepcopy(COLUMN_INFO),
                }
            self.send_json(200, payload)
        except sqlite3.Error as exc:
            self.send_json(500, {'error': str(exc)})

    def handle_get_nodes(self, parsed):
        session_id, session = self.require_session(parsed)
        if not session:
            return
        try:
            with session_context(session, refresh_meta=False):
                with get_connection() as conn:
                    cur = conn.execute(
                        f"SELECT * FROM {quote_ident(TABLE_NAME)} ORDER BY {quote_ident(ID_FIELD)}"
                    )
                    rows = [dict(row) for row in cur.fetchall()]
            self.send_json(200, rows)
        except sqlite3.Error as exc:
            self.send_json(500, {'error': str(exc)})

    def handle_get_config(self, parsed):
        session_id = self.extract_session_id_param(parsed)
        if session_id:
            session = get_session_record(session_id, touch=False)
            if not session:
                return self.send_json(410, {'error': '会话不存在或已过期。'})
            snapshot = build_config_snapshot(session['config'])
            snapshot['session_id'] = session_id
            return self.send_json(200, snapshot)
        snapshot = get_config_snapshot()
        snapshot['session_id'] = None
        self.send_json(200, snapshot)

    def handle_browse_databases(self, parsed):
        params = parse_qs(parsed.query)
        dir_param = params.get('dir', [''])
        dir_value = dir_param[0] if dir_param else ''
        try:
            directory = resolve_browse_directory(dir_value)
            entries = list_browse_entries(directory)
        except FileNotFoundError:
            return self.send_json(404, {'error': '目录不存在'})
        except NotADirectoryError:
            return self.send_json(400, {'error': '目标不是目录'})
        except ValueError as exc:
            return self.send_json(403, {'error': str(exc)})
        except RuntimeError as exc:
            return self.send_json(500, {'error': str(exc)})

        try:
            if directory == BROWSER_ROOT:
                relative_path = ''
            else:
                relative_path = str(directory.relative_to(BROWSER_ROOT))
        except ValueError:
            relative_path = None

        parent_path = None
        parent_dir = directory.parent
        if parent_dir != directory:
            parent_path = str(parent_dir)

        payload = {
            'root': str(BROWSER_ROOT),
            'directory': str(directory),
            'relative_path': relative_path,
            'parent': parent_path,
            'entries': entries,
        }
        self.send_json(200, payload)

    def handle_list_tables(self, parsed):
        params = parse_qs(parsed.query)
        path_param = params.get('db_path', [''])
        db_path_raw = path_param[0] if path_param else ''
        if not db_path_raw:
            return self.send_json(400, {'error': '缺少 db_path 参数'})
        candidate = Path(db_path_raw).expanduser()
        if not candidate.is_absolute():
            candidate = Path.cwd() / candidate
        try:
            resolved = candidate.resolve()
        except OSError as exc:
            return self.send_json(400, {'error': f'无法解析路径: {exc}'})
        if not resolved.exists():
            return self.send_json(404, {'error': '数据库文件不存在'})
        if not resolved.is_file():
            return self.send_json(400, {'error': '目标不是文件'})

        try:
            with sqlite3.connect(str(resolved)) as conn:
                cur = conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name COLLATE NOCASE"
                )
                table_names = [row[0] for row in cur.fetchall()]
                tables = []
                for name in table_names:
                    try:
                        pragma = conn.execute(f"PRAGMA table_info({quote_ident(name)})")
                        columns = [col[1] for col in pragma.fetchall()]
                    except sqlite3.Error:
                        columns = []
                    tables.append({'name': name, 'columns': columns})
        except sqlite3.Error as exc:
            return self.send_json(500, {'error': str(exc)})

        self.send_json(200, {
            'db_path': str(resolved),
            'tables': tables,
        })

    def handle_foreign_options(self, parsed, column):
        if column is None:
            return self.send_json(404, {'error': '未知字段'})
        session_id, session = self.require_session(parsed)
        if not session:
            return
        try:
            with session_context(session, refresh_meta=True):
                if column not in FOREIGN_KEYS:
                    refresh_foreign_keys()
                if column not in FOREIGN_KEYS:
                    return self.send_json(404, {'error': '未知字段'})
                options = fetch_foreign_options(column)
            self.send_json(200, options)
        except sqlite3.Error as exc:
            self.send_json(500, {'error': str(exc)})

    def handle_create_node(self, parsed):
        payload = self.read_json_body()
        if payload is None:
            return
        session_id, session = self.require_session(parsed)
        if not session:
            return
        try:
            with session_context(session, refresh_meta=True):
                sanitized = sanitize_payload(payload)
                columns = [key for key in sanitized.keys() if key != ID_FIELD]
                if not columns:
                    return self.send_json(400, {'error': '无可插入的字段'})
                placeholders = ', '.join(['?'] * len(columns))
                column_sql = ', '.join(quote_ident(col) for col in columns)
                values = [normalize_incoming_value(col, sanitized[col]) for col in columns]
                insert_sql = f"INSERT INTO {quote_ident(TABLE_NAME)} ({column_sql}) VALUES ({placeholders})"
                with get_connection() as conn:
                    cur = conn.execute(insert_sql, values)
                    new_id = cur.lastrowid
                    cur = conn.execute(
                        f"SELECT * FROM {quote_ident(TABLE_NAME)} WHERE {quote_ident(ID_FIELD)} = ?",
                        (new_id,),
                    )
                    row = cur.fetchone()
            self.send_json(201, dict(row))
        except sqlite3.Error as exc:
            self.send_json(500, {'error': str(exc)})

    def handle_restore_nodes(self, parsed):
        payload = self.read_json_body()
        if payload is None:
            return
        nodes = payload.get('nodes') if isinstance(payload, dict) else None
        if not nodes or not isinstance(nodes, list):
            return self.send_json(400, {'error': '无效的恢复数据'})
        session_id, session = self.require_session(parsed)
        if not session:
            return
        try:
            with session_context(session, refresh_meta=True):
                allowed_columns = set(COLUMN_TYPES.keys()) | {ID_FIELD}
                prepared = []
                for node in nodes:
                    if not isinstance(node, dict):
                        raise ValueError('恢复数据格式错误')
                    if ID_FIELD not in node:
                        raise ValueError('缺少主键字段，无法恢复')
                    restored = {}
                    for key, value in node.items():
                        if key not in allowed_columns:
                            continue
                        if key == ID_FIELD:
                            restored[key] = int(value)
                        else:
                            restored[key] = normalize_incoming_value(key, value)
                    prepared.append(restored)
                table_ident = quote_ident(TABLE_NAME)
                with get_connection() as conn:
                    conn.execute('BEGIN')
                    for restored in prepared:
                        columns = list(restored.keys())
                        if not columns:
                            continue
                        column_sql = ', '.join(quote_ident(col) for col in columns)
                        placeholders = ', '.join(['?'] * len(columns))
                        values = [restored[col] for col in columns]
                        conn.execute(
                            f"INSERT OR REPLACE INTO {table_ident} ({column_sql}) VALUES ({placeholders})",
                            values,
                        )
                    conn.commit()
                refresh_column_types()
                restored_count = len(prepared)
            self.send_json(200, {'restored': restored_count})
        except (ValueError, TypeError) as exc:
            self.send_json(400, {'error': str(exc)})
        except sqlite3.Error as exc:
            self.send_json(500, {'error': str(exc)})

    def handle_update_node(self, parsed, node_id: int):
        payload = self.read_json_body()
        if payload is None:
            return
        session_id, session = self.require_session(parsed)
        if not session:
            return
        try:
            with session_context(session, refresh_meta=True):
                sanitized = sanitize_payload(payload)
                columns = [key for key in sanitized.keys() if key != ID_FIELD]
                if not columns:
                    return self.send_json(400, {'error': '无可更新的字段'})
                assignments = ', '.join([f"{quote_ident(col)} = ?" for col in columns])
                values = [normalize_incoming_value(col, sanitized[col]) for col in columns]
                values.append(node_id)
                sql = f"UPDATE {quote_ident(TABLE_NAME)} SET {assignments} WHERE {quote_ident(ID_FIELD)} = ?"
                with get_connection() as conn:
                    cur = conn.execute(sql, values)
                    if cur.rowcount == 0:
                        return self.send_json(404, {'error': '记录不存在'})
                    cur = conn.execute(
                        f"SELECT * FROM {quote_ident(TABLE_NAME)} WHERE {quote_ident(ID_FIELD)} = ?",
                        (node_id,),
                    )
                    row = cur.fetchone()
            self.send_json(200, dict(row))
        except sqlite3.Error as exc:
            self.send_json(500, {'error': str(exc)})

    def handle_delete_node(self, parsed, node_id: int):
        session_id, session = self.require_session(parsed)
        if not session:
            return
        try:
            with session_context(session, refresh_meta=False):
                table_ident = quote_ident(TABLE_NAME)
                id_ident = quote_ident(ID_FIELD)
                parent_ident = quote_ident(PARENT_FIELD)
                recursive_sql = f"""
                WITH RECURSIVE subtree(id, depth) AS (
                  SELECT {id_ident}, 0 FROM {table_ident} WHERE {id_ident} = ?
                  UNION ALL
                  SELECT t.{id_ident}, depth + 1
                  FROM {table_ident} AS t
                  JOIN subtree s ON t.{parent_ident} = s.id
                )
                SELECT id, depth FROM subtree
                """
                with get_connection() as conn:
                    cur = conn.execute(recursive_sql, (node_id,))
                    rows = cur.fetchall()
                    if not rows:
                        return self.send_json(404, {'error': '记录不存在'})
                    ordered = sorted(
                        rows,
                        key=lambda row: row['depth'] if isinstance(row, sqlite3.Row) else row[1],
                        reverse=True,
                    )
                    for row in ordered:
                        target_id = row['id'] if isinstance(row, sqlite3.Row) else row[0]
                        conn.execute(
                            f"DELETE FROM {table_ident} WHERE {id_ident} = ?",
                            (target_id,),
                        )
            self.send_response(204)
            self.send_header('Cache-Control', 'no-store')
            self.end_headers()
        except sqlite3.Error as exc:
            self.send_json(500, {'error': str(exc)})

    def handle_update_config(self, parsed):
        payload = self.read_json_body()
        if payload is None:
            return
        session_id = self.extract_session_id_param(parsed)
        try:
            # 检查是否有force参数
            force = payload.pop('force', False) if isinstance(payload, dict) else False

            if session_id:
                session = update_session_config(session_id, payload, force=force)
            else:
                # 即使没有session_id，如果force为true，也要检查资源冲突
                if force:
                    normalized = normalize_config_payload(payload)
                    resource_key = make_resource_key(normalized)
                    with SESSION_LOCK:
                        cleanup_expired_sessions_locked()
                        owner = RESOURCE_LOCKS.get(resource_key)
                        if owner and owner in SESSIONS:
                            SESSIONS.pop(owner, None)
                            RESOURCE_LOCKS.pop(resource_key, None)
                session = create_session(payload)
            snapshot = build_config_snapshot(session['config'])
            snapshot['session_id'] = session['id']
            self.send_json(200, snapshot)
        except SessionConflictError as exc:
            self.send_json(409, {'error': str(exc)})
        except SessionNotFoundError as exc:
            self.send_json(410, {'error': str(exc)})
        except ValueError as exc:
            self.send_json(400, {'error': str(exc)})
        except sqlite3.Error as exc:
            self.send_json(500, {'error': str(exc)})

    def handle_rebuild_sort_order(self, parsed):
        session_id, session = self.require_session(parsed)
        if not session:
            return
        try:
            with session_context(session, refresh_meta=True):
                sort_column = 'sort_order'
                if sort_column not in COLUMN_TYPES:
                    return self.send_json(404, {'error': '当前表不存在 sort_order 列'})
                updated = rebuild_sort_order()
            self.send_json(200, {'updated': updated})
        except sqlite3.Error as exc:
            self.send_json(500, {'error': str(exc)})

    def handle_delete_session(self, parsed):
        session_id = self.extract_session_id_param(parsed)
        if not session_id:
            return self.send_json(400, {'error': '缺少会话标识。'})
        removed = destroy_session(session_id)
        if not removed:
            return self.send_json(410, {'error': '会话不存在或已过期。'})
        self.send_response(204)
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()

    def read_json_body(self):
        length = self.headers.get('Content-Length')
        if not length:
            return {}
        try:
            size = int(length)
        except ValueError:
            size = 0
        body = self.rfile.read(size) if size > 0 else b''
        if not body:
            return {}
        try:
            return json.loads(body.decode('utf-8'))
        except json.JSONDecodeError:
            self.send_json(400, {'error': 'JSON 解析失败'})
            return None

    def send_json(self, status, payload):
        response = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(response)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(response)

    @staticmethod
    def extract_id(path: str):
        if not path.startswith('/api/nodes/'):
            return None
        raw = path[len('/api/nodes/'):]
        raw = raw.split('?')[0].split('#')[0]
        raw = unquote(raw)
        try:
            return int(raw)
        except ValueError:
            return None

    @staticmethod
    def extract_foreign_column(path: str):
        if not path.startswith('/api/foreign/'):
            return None
        raw = path[len('/api/foreign/'):]
        raw = raw.split('?')[0].split('#')[0]
        return unquote(raw)


def sanitize_payload(payload):
    if not isinstance(payload, dict):
        return {}
    allowed = {}
    for key, value in payload.items():
        if key == ID_FIELD:
            continue
        if key in COLUMN_TYPES:
            allowed[key] = value
    return allowed


def looks_like_int(value):
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    if isinstance(value, float):
        return value.is_integer()
    text = str(value).strip()
    if not text:
        return False
    try:
        number = float(text)
    except ValueError:
        return False
    return number.is_integer()


def coerce_to_int(value):
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(round(value))
    text = str(value).strip()
    if not text:
        return 0
    number = float(text)
    return int(round(number))


def normalize_incoming_value(key, value):
    column_type = (COLUMN_TYPES.get(key, '') or '').upper()
    base_type = column_type.replace(' UNSIGNED', '').split('(')[0].strip()
    is_integer_type = base_type in INTEGER_TYPE_HINTS
    is_numeric_type = is_integer_type or base_type in FLOAT_TYPE_HINTS
    is_boolean_type = base_type in BOOLEAN_TYPE_HINTS
    is_foreign_field = key == PARENT_FIELD or key in FOREIGN_KEYS

    if value == '' or value is None:
        if is_boolean_type:
            return 0
        if is_numeric_type or is_foreign_field:
            return None
        return ''

    if isinstance(value, bool):
        if is_numeric_type:
            return int(value)
        return value

    if isinstance(value, (int, float)):
        if is_integer_type or (is_foreign_field and looks_like_int(value)):
            return coerce_to_int(value)
        if is_numeric_type and not is_integer_type:
            return float(value)
        return value

    if is_boolean_type:
        lowered = str(value).strip().lower()
        if lowered in TRUTHY_STRINGS:
            return 1
        if lowered in FALSY_STRINGS:
            return 0
        return int(bool(value))

    if is_integer_type or (is_foreign_field and looks_like_int(value)):
        text = str(value).strip()
        if not text:
            return None
        if looks_like_int(text):
            return coerce_to_int(text)
        return value

    if is_numeric_type:
        try:
            return float(str(value).strip())
        except (TypeError, ValueError):
            return value

    return value


def refresh_column_types():
    COLUMN_TYPES.clear()
    COLUMN_INFO.clear()
    try:
        with get_connection() as conn:
            unique_single, unique_composites = collect_unique_info(conn, TABLE_NAME)
            cur = conn.execute(f"PRAGMA table_info({quote_ident(TABLE_NAME)})")
            for row in cur.fetchall():
                name = row['name'] if isinstance(row, sqlite3.Row) else row[1]
                col_type = row['type'] if isinstance(row, sqlite3.Row) else row[2]
                normalized_type = (col_type or '').upper()
                notnull = bool(row['notnull'] if isinstance(row, sqlite3.Row) else row[3])
                default_value = row['dflt_value'] if isinstance(row, sqlite3.Row) else row[4]
                is_pk = bool(row['pk'] if isinstance(row, sqlite3.Row) else row[5])
                COLUMN_TYPES[name] = normalized_type
                COLUMN_INFO[name] = {
                    'type': normalized_type,
                    'notnull': notnull,
                    'default_value': default_value,
                    'primary_key': is_pk,
                    'unique': bool(unique_single.get(name)) if not is_pk else False,
                    'unique_groups': unique_composites.get(name, []),
                }
    except sqlite3.Error as exc:
        print(f"无法读取表结构: {exc}")
    try:
        refresh_foreign_keys()
    except sqlite3.Error as exc:
        print(f"无法读取外键结构: {exc}")


def refresh_foreign_keys():
    FOREIGN_KEYS.clear()
    try:
        with get_connection() as conn:
            cur = conn.execute(f"PRAGMA foreign_key_list({quote_ident(TABLE_NAME)})")
            rows = cur.fetchall()
            for row in rows:
                from_col = row['from'] if isinstance(row, sqlite3.Row) else row[3]
                ref_table = row['table'] if isinstance(row, sqlite3.Row) else row[2]
                ref_col = row['to'] if isinstance(row, sqlite3.Row) else row[4]
                if not from_col or not ref_table or not ref_col:
                    continue
                raw_candidates = choose_label_columns(conn, ref_table, ref_col)
                label_columns = dedupe_columns([ref_col] + raw_candidates)
                FOREIGN_KEYS[from_col] = {
                    'table': ref_table,
                    'ref_column': ref_col,
                    'label_columns': label_columns,
                    'label_column': label_columns[0] if label_columns else ref_col,
                    'primary_column': detect_primary_key(conn, ref_table, ref_col),
                }
    except sqlite3.Error as exc:
        print(f"无法读取外键结构: {exc}")


def collect_unique_info(conn, table_name):
    unique_single = {}
    unique_composites = {}
    try:
        cur = conn.execute(f"PRAGMA index_list({quote_ident(table_name)})")
        for row in cur.fetchall():
            unique = row['unique'] if isinstance(row, sqlite3.Row) else row[2]
            origin = row['origin'] if isinstance(row, sqlite3.Row) else row[3]
            if not unique or origin == 'pk':
                continue
            index_name = row['name'] if isinstance(row, sqlite3.Row) else row[1]
            if not index_name:
                continue
            columns = []
            info_cursor = conn.execute(f"PRAGMA index_info({quote_ident(index_name)})")
            for info_row in info_cursor.fetchall():
                col_name = info_row['name'] if isinstance(info_row, sqlite3.Row) else info_row[2]
                if col_name:
                    columns.append(col_name)
            if not columns:
                continue
            if len(columns) == 1:
                unique_single[columns[0]] = True
            else:
                for col in columns:
                    groups = unique_composites.setdefault(col, [])
                    if columns not in groups:
                        groups.append(columns)
    except sqlite3.Error:
        pass
    return unique_single, unique_composites


def choose_label_columns(conn, table_name, primary_col):
    ordered = []
    try:
        cur = conn.execute(f"PRAGMA table_info({quote_ident(table_name)})")
        preferred = []
        neutral_text = []
        others = []
        deprioritized = []
        fallback = primary_col
        positive_keywords = ('name', 'title', 'label', 'desc', 'description', 'text', 'display')
        negative_keywords = ('order', 'sort', 'rank', 'idx', 'index', 'sequence', 'seq', 'position', 'pos', 'step', 'flag', 'status', 'code', 'id')
        for row in cur.fetchall():
            col_name = row['name'] if isinstance(row, sqlite3.Row) else row[1]
            col_type = (row['type'] if isinstance(row, sqlite3.Row) else row[2]) or ''
            is_pk = bool(row['pk'] if isinstance(row, sqlite3.Row) else row[5])
            if is_pk:
                fallback = col_name
            if col_name == primary_col:
                continue
            lowered = col_name.lower()
            normalized_type = col_type.upper()
            is_text_type = normalized_type == '' or any(token in normalized_type for token in ('CHAR', 'TEXT', 'CLOB'))
            if any(keyword in lowered for keyword in positive_keywords):
                preferred.append(col_name)
                continue
            if any(keyword in lowered for keyword in negative_keywords):
                deprioritized.append(col_name)
                continue
            if is_text_type:
                neutral_text.append(col_name)
                continue
            others.append(col_name)
        def append_unique(target_list):
            for item in target_list:
                if item not in ordered:
                    ordered.append(item)

        append_unique(preferred)
        append_unique(neutral_text)
        append_unique(others)
        append_unique(deprioritized)
    except sqlite3.Error:
        pass
    if fallback not in ordered:
        ordered.append(fallback)
    if primary_col not in ordered:
        ordered.append(primary_col)
    return ordered


def fetch_foreign_options(column, limit=500):
    info = FOREIGN_KEYS[column]
    value_col = info['ref_column']
    label_columns = info.get('label_columns') or [value_col]
    table_name = info['table']
    label_expr = build_label_expression(label_columns, value_col)
    order_expr = build_order_expression(label_columns, value_col)
    select_list = f"{label_expr}, {quote_ident(value_col)} AS value_raw, {quote_ident(info.get('primary_column', value_col))} AS primary_display"
    sql = (
        f"SELECT {select_list} FROM {quote_ident(table_name)} "
        f"ORDER BY {order_expr} LIMIT ?"
    )
    with get_connection() as conn:
        cur = conn.execute(sql, (limit,))
        return [
            {
                'value': row['value_raw'],
                'label': build_final_label(row['label'], row['primary_display'] if 'primary_display' in row.keys() else row['value_raw']),
            }
            for row in cur.fetchall()
        ]


def quote_ident(name: str) -> str:
    escaped = name.replace('"', '""')
    return f'"{escaped}"'


def build_label_expression(label_columns, value_col):
    parts = []
    for column in label_columns:
        ident = quote_ident(column)
        parts.append(f"NULLIF(TRIM(CAST({ident} AS TEXT)), '')")
    parts.append(f"CAST({quote_ident(value_col)} AS TEXT)")
    coalesce_args = ', '.join(parts)
    return f"COALESCE({coalesce_args}) AS label"


def build_order_expression(label_columns, value_col):
    if label_columns:
        return ', '.join(quote_ident(col) for col in label_columns)
    return quote_ident(value_col)


def dedupe_columns(columns):
    seen = set()
    ordered = []
    for column in columns:
        if column in seen:
            continue
        seen.add(column)
        ordered.append(column)
    return ordered


def build_final_label(label_value, id_value):
    text = str(label_value).strip() if label_value is not None else ''
    if id_value is None:
        return text
    id_text = str(id_value).strip()
    if not id_text:
        return text
    if not text:
        return id_text
    if id_text.lower() in {text.lower(), f'({text.lower()})'}:
        return text
    return f"{text} (#{id_text})"


def detect_primary_key(conn, table_name, fallback):
    try:
        cur = conn.execute(f"PRAGMA table_info({quote_ident(table_name)})")
        for row in cur.fetchall():
            col_name = row['name'] if isinstance(row, sqlite3.Row) else row[1]
            is_pk = bool(row['pk'] if isinstance(row, sqlite3.Row) else row[5])
            if is_pk:
                return col_name
    except sqlite3.Error:
        pass
    return fallback


def rebuild_sort_order():
    table_ident = quote_ident(TABLE_NAME)
    sort_ident = quote_ident('sort_order')
    id_ident = quote_ident(ID_FIELD)
    temp_table = 'tmp_sort_rebuild'
    inserted = 0
    with get_connection() as conn:
        conn.execute('BEGIN')
        conn.execute(f'DROP TABLE IF EXISTS {temp_table}')
        conn.execute(f'CREATE TEMP TABLE {temp_table} (id INTEGER PRIMARY KEY, new_sort_order INTEGER)')
        conn.execute(
            f'''
            INSERT INTO {temp_table} (id, new_sort_order)
            SELECT
              {id_ident} AS id,
              (ROW_NUMBER() OVER (
                  ORDER BY
                    CASE WHEN {sort_ident} IS NULL THEN 1 ELSE 0 END,
                    {sort_ident},
                    {id_ident}
              ) - 1) * 1000 AS new_sort_order
            FROM {table_ident}
            '''
        )
        cur = conn.execute(f'SELECT COUNT(*) FROM {temp_table}')
        row = cur.fetchone()
        inserted = row[0] if row else 0
        conn.execute(
            f'''
            WITH params AS (
              SELECT COALESCE(MAX(ABS(new_sort_order)), 0) + 1000 AS base_width
              FROM {temp_table}
            )
            UPDATE {table_ident}
            SET {sort_ident} = -(
              SELECT tmp.new_sort_order * params.base_width + {table_ident}.{id_ident}
              FROM {temp_table} AS tmp, params
              WHERE tmp.id = {table_ident}.{id_ident}
            )
            WHERE {id_ident} IN (SELECT id FROM {temp_table})
            '''
        )
        conn.execute(
            f'''
            UPDATE {table_ident}
            SET {sort_ident} = (
              SELECT new_sort_order
              FROM {temp_table}
              WHERE {temp_table}.id = {table_ident}.{id_ident}
            )
            WHERE {id_ident} IN (SELECT id FROM {temp_table})
            '''
        )
        conn.execute(f'DROP TABLE IF EXISTS {temp_table}')
        conn.commit()
    return inserted


def main():
    ensure_schema()
    refresh_column_types()

    # 启动后台清理线程
    def cleanup_worker():
        while True:
            with SESSION_LOCK:
                cleanup_expired_sessions_locked()
            time.sleep(60)  # 每分钟清理一次

    cleanup_thread = threading.Thread(target=cleanup_worker, daemon=True)
    cleanup_thread.start()

    server = ThreadingHTTPServer((HOST, PORT), TreeRequestHandler)
    print(f'Server listening on http://{HOST}:{PORT}')
    print('Press Ctrl+C to stop')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nShutting down...')
    finally:
        server.server_close()


if __name__ == '__main__':
    main()
