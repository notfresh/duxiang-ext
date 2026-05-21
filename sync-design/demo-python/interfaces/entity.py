"""同步实体接口定义"""
from abc import ABC, abstractmethod
from enum import Enum
from typing import Any, Optional, List


class ConflictState(Enum):
    """冲突状态枚举"""
    NONE = "NONE"
    CONFLICT_PENDING = "CONFLICT_PENDING"


class IConflictData(ABC):
    """冲突数据接口 - 存储冲突双方的版本信息"""

    @abstractmethod
    def get_local_version(self) -> dict:
        """获取本地版本数据"""
        pass

    @abstractmethod
    def get_remote_version(self) -> dict:
        """获取对端版本数据"""
        pass

    @abstractmethod
    def get_conflict_time(self) -> int:
        """获取冲突发生时间（毫秒时间戳）"""
        pass


class ISyncEntity(ABC):
    """任何需要同步的数据对象必须实现此接口"""

    @abstractmethod
    def get_primary_key(self) -> str:
        """获取全局唯一主键"""
        pass

    @abstractmethod
    def get_seq(self) -> int:
        """获取实体版本号（节点本地序列号）"""
        pass

    @abstractmethod
    def get_version(self) -> int:
        """获取数据版本号或更新时间戳（用于冲突解决）"""
        pass

    @abstractmethod
    def get_entity_type(self) -> str:
        """获取实体类型标识"""
        pass

    @abstractmethod
    def get_conflict_state(self) -> ConflictState:
        """获取冲突状态"""
        pass

    @abstractmethod
    def get_conflict_data(self) -> Optional[IConflictData]:
        """获取冲突数据（仅在 CONFLICT_PENDING 时有效）"""
        pass

    @abstractmethod
    def to_dict(self) -> dict:
        """序列化为字典"""
        pass

    @classmethod
    @abstractmethod
    def from_dict(cls, data: dict) -> 'ISyncEntity':
        """从字典反序列化"""
        pass
