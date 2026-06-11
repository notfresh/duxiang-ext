"""同步日志接口定义"""
from abc import ABC, abstractmethod
from enum import Enum
from typing import List, Optional
from .entity import ISyncEntity


class Operation(Enum):
    """操作类型枚举"""
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    BATCH_CREATE = "BATCH_CREATE"  # 批量初始化日志


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
        """操作类型: CREATE | UPDATE | DELETE | BATCH_CREATE"""
        pass

    @abstractmethod
    def get_seq(self) -> int:
        """实体的序列号（节点本地序列号），游标推进依据"""
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


class IBatchLog(ISyncLog):
    """批量日志接口 - 用于初始化时批量同步存量数据"""

    @abstractmethod
    def get_entities(self) -> List[ISyncEntity]:
        """获取批量实体列表"""
        pass

    @abstractmethod
    def get_operation(self) -> Operation:
        """固定返回 BATCH_CREATE"""
        pass
