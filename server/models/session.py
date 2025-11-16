"""
Session Model - 会话模型
负责会话的数据结构和异常定义
遵循单一职责原则：只负责会话数据结构
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, Any, Optional
from uuid import UUID, uuid4


@dataclass
class SessionRecord:
    """会话记录数据类"""
    id: str = field(default_factory=lambda: str(uuid4()))
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_seen: datetime = field(default_factory=datetime.utcnow)
    config: Dict[str, Any] = field(default_factory=dict)
    meta: Optional[Dict[str, Any]] = field(default=None)
    refreshed_at: Optional[datetime] = field(default=None)

    def touch(self) -> None:
        """更新最后活跃时间"""
        self.last_seen = datetime.utcnow()

    def is_expired(self, timeout_seconds: int) -> bool:
        """检查会话是否过期"""
        return (datetime.utcnow() - self.last_seen).total_seconds() > timeout_seconds

    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            'id': self.id,
            'created_at': self.created_at.isoformat(),
            'last_seen': self.last_seen.isoformat(),
            'config': self.config,
            'meta': self.meta,
            'refreshed_at': self.refreshed_at.isoformat() if self.refreshed_at else None
        }


class SessionError(Exception):
    """会话相关错误基类"""
    pass


class SessionConflictError(SessionError):
    """会话冲突错误"""
    def __init__(self, message: str = "该数据库及数据表正在被其他会话使用。"):
        super().__init__(message)


class SessionNotFoundError(SessionError):
    """会话未找到错误"""
    def __init__(self, message: str = "会话不存在或已过期。"):
        super().__init__(message)