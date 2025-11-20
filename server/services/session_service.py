"""
Session Service - 会话服务
负责会话的创建、管理、验证和清理
遵循单一职责原则：只负责会话管理
"""

from datetime import datetime
from threading import RLock
from typing import Dict, Optional, Any, List
from contextlib import contextmanager

from models.session import SessionRecord, SessionConflictError, SessionNotFoundError
from config.settings import config


class SessionService:
    """会话服务 - 单一职责：管理用户会话"""

    def __init__(self):
        self._sessions: Dict[str, SessionRecord] = {}
        self._resource_locks: Dict[tuple, str] = {}
        self._lock = RLock()
        self._session_timeout = config.SESSION_TIMEOUT_SECONDS

    def create_session(self, config_payload: Dict[str, Any]) -> SessionRecord:
        """创建新会话"""
        normalized = self._normalize_config_payload(config_payload)
        session = self._build_session_record(normalized)
        resource_key = config.make_resource_key(normalized)

        with self._lock:
            self._cleanup_expired_sessions()

            # 检查资源冲突
            owner = self._resource_locks.get(resource_key)
            if owner and owner in self._sessions:
                raise SessionConflictError()

            # 保存会话
            self._sessions[session.id] = session
            self._resource_locks[resource_key] = session.id

        return session

    def update_session(self, session_id: str, config_payload: Dict[str, Any], force: bool = False) -> SessionRecord:
        """更新会话配置"""
        normalized = self._normalize_config_payload(config_payload)

        with self._lock:
            self._cleanup_expired_sessions()
            session = self._sessions.get(session_id)

            if not session:
                raise SessionNotFoundError()

            old_config = session.config
            old_key = config.make_resource_key(old_config)
            new_key = config.make_resource_key(normalized)

            # 处理资源锁定
            if new_key != old_key:
                owner = self._resource_locks.get(new_key)
                if owner and owner != session_id:
                    if owner in self._sessions:
                        if not force:
                            raise SessionConflictError()
                        else:
                            # 强制释放
                            if owner in self._sessions:
                                del self._sessions[owner]
                            self._resource_locks[new_key] = session_id

                # 释放旧资源
                self._resource_locks.pop(old_key, None)
                self._resource_locks[new_key] = session_id

            # 更新会话
            session.config = normalized
            session.touch()

        return session

    def destroy_session(self, session_id: str) -> None:
        """销毁会话"""
        with self._lock:
            session = self._sessions.get(session_id)
            if session:
                resource_key = config.make_resource_key(session.config)
                self._resource_locks.pop(resource_key, None)
                del self._sessions[session_id]

    def get_session(self, session_id: str, touch: bool = True) -> Optional[SessionRecord]:
        """获取会话"""
        if not session_id:
            return None

        with self._lock:
            self._cleanup_expired_sessions()
            session = self._sessions.get(session_id)

            if session and touch:
                session.touch()

        return session

    @contextmanager
    def session_context(self, session_id: str, *, refresh_meta: bool = False,
                       ensure_schema_required: bool = False):
        """会话上下文管理器"""
        session = self.get_session(session_id)
        if not session:
            raise SessionNotFoundError()

        if refresh_meta:
            session.refreshed_at = datetime.utcnow()

        yield session

    def initialize_session(self, session: SessionRecord, *, ensure_schema_flag: bool = True) -> None:
        """初始化会话"""
        session.touch()
        if ensure_schema_flag:
            session.refreshed_at = datetime.utcnow()

    def get_all_sessions(self) -> List[Dict[str, Any]]:
        """获取所有会话信息"""
        with self._lock:
            self._cleanup_expired_sessions()
            return [session.to_dict() for session in self._sessions.values()]

    def cleanup_expired_sessions(self, now: Optional[datetime] = None) -> int:
        """清理过期会话"""
        if self._session_timeout <= 0:
            return 0

        reference = now or datetime.utcnow()
        expired_sessions = []

        with self._lock:
            for session_id, session in list(self._sessions.items()):
                if session.is_expired(self._session_timeout):
                    expired_sessions.append(session_id)

            # 删除过期会话
            for session_id in expired_sessions:
                session = self._sessions.get(session_id)
                if session:
                    resource_key = config.make_resource_key(session.config)
                    self._resource_locks.pop(resource_key, None)
                    del self._sessions[session_id]

        return len(expired_sessions)

    def _cleanup_expired_sessions(self) -> None:
        """内部清理过期会话（带锁）"""
        if self._session_timeout <= 0:
            return

        reference = datetime.utcnow()
        expired_sessions = []

        for session_id, session in list(self._sessions.items()):
            if session.is_expired(self._session_timeout):
                expired_sessions.append(session_id)

        # 删除过期会话
        for session_id in expired_sessions:
            session = self._sessions.get(session_id)
            if session:
                resource_key = config.make_resource_key(session.config)
                self._resource_locks.pop(resource_key, None)
                del self._sessions[session_id]

    def _build_session_record(self, config: Dict[str, Any]) -> SessionRecord:
        """构建会话记录"""
        return SessionRecord(config=config.copy())

    def _normalize_config_payload(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        """规范化配置载荷"""
        normalized = {}
        for key, value in payload.items():
            if key == 'DB_PATH':
                normalized[key] = config.normalize_db_path(value)
            elif key in ['TABLE_NAME', 'ID_FIELD', 'PARENT_FIELD']:
                normalized[key] = str(value) if value is not None else ''
            elif key == 'AUTO_BOOTSTRAP':
                normalized[key] = config.parse_bool(value)
            else:
                normalized[key] = value
        return normalized

    def get_resource_owner(self, resource_key: tuple) -> Optional[str]:
        """获取资源所有者"""
        with self._lock:
            return self._resource_locks.get(resource_key)

    def force_release_resource(self, resource_key: tuple) -> bool:
        """强制释放资源"""
        with self._lock:
            owner = self._resource_locks.get(resource_key)
            if owner and owner in self._sessions:
                del self._sessions[owner]
                self._resource_locks.pop(resource_key, None)
                return True
            return False


# 全局会话服务实例
session_service = SessionService()
