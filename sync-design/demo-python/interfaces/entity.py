"""同步实体接口定义"""
from abc import ABC, abstractmethod
from typing import Any


class ISyncEntity(ABC):
    """任何需要同步的数据对象必须实现此接口"""
    
    @abstractmethod
    def get_primary_key(self) -> str:
        """获取全局唯一主键 (例如: "ORDER_1001")"""
        pass
    
    @abstractmethod
    def get_version(self) -> int:
        """获取数据版本号或更新时间戳 (用于判断新旧)"""
        pass
    
    @abstractmethod
    def get_entity_type(self) -> str:
        """获取实体类型标识 (例如: "ORDER", "USER")"""
        pass
    
    @abstractmethod
    def to_dict(self) -> dict:
        """序列化为字典（用于JSON存储和网络传输）"""
        pass
    
    @classmethod
    @abstractmethod
    def from_dict(cls, data: dict) -> 'ISyncEntity':
        """从字典反序列化"""
        pass
