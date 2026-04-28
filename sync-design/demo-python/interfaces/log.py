"""同步日志接口定义"""
from abc import ABC, abstractmethod
from enum import Enum
from typing import Optional
from .entity import ISyncEntity


class Operation(Enum):
    """操作类型枚举"""
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"


class ISyncLog(ABC):
    """同步日志接口 - 日志在写入时就携带实体完整快照"""
    
    @abstractmethod
    def get_log_id(self) -> str:
        """日志唯一ID（UUID，无序，仅用于标识）"""
        pass
    
    @abstractmethod
    def get_entity_id(self) -> str:
        """关联的实体ID"""
        pass
    
    @abstractmethod
    def get_operation(self) -> Operation:
        """操作类型: CREATE | UPDATE | DELETE"""
        pass
    
    @abstractmethod
    def get_timestamp(self) -> int:
        """日志写入时间戳（毫秒），游标的唯一依据"""
        pass
    
    @abstractmethod
    def get_payload(self) -> Optional[ISyncEntity]:
        """操作瞬间的实体完整快照，DELETE 时为 None"""
        pass
    
    @abstractmethod
    def to_dict(self) -> dict:
        """序列化为字典"""
        pass
    
    @classmethod
    @abstractmethod
    def from_dict(cls, data: dict, entity_class: type) -> 'ISyncLog':
        """从字典反序列化"""
        pass
