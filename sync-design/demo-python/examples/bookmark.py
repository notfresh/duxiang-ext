"""Bookmark 实体和日志的实现"""
import time
import uuid
from typing import Optional
from interfaces import ISyncEntity, ISyncLog, Operation


class Bookmark(ISyncEntity):
    """书签实体"""
    
    def __init__(self, bookmark_id: str, url: str, title: str, updated_at: int):
        self.bookmark_id = bookmark_id
        self.url = url
        self.title = title
        self.updated_at = updated_at  # 实体级版本号，用于冲突解决（LWW）
    
    def get_primary_key(self) -> str:
        return self.bookmark_id
    
    def get_version(self) -> int:
        return self.updated_at
    
    def get_entity_type(self) -> str:
        return "BOOKMARK"
    
    def to_dict(self) -> dict:
        return {
            'bookmarkId': self.bookmark_id,
            'url': self.url,
            'title': self.title,
            'updatedAt': self.updated_at
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> 'Bookmark':
        return cls(
            bookmark_id=data['bookmarkId'],
            url=data['url'],
            title=data['title'],
            updated_at=data['updatedAt']
        )
    
    def __repr__(self):
        return f"Bookmark(id={self.bookmark_id}, title='{self.title}', url='{self.url}')"


class BookmarkSyncLog(ISyncLog):
    """书签同步日志"""
    
    def __init__(self, log_id: str, entity_id: str, operation: Operation, 
                 timestamp: int, payload: Optional[Bookmark]):
        self.log_id = log_id
        self.entity_id = entity_id
        self.operation = operation
        self.timestamp = timestamp
        self.payload = payload
    
    def get_log_id(self) -> str:
        return self.log_id
    
    def get_entity_id(self) -> str:
        return self.entity_id
    
    def get_operation(self) -> Operation:
        return self.operation
    
    def get_timestamp(self) -> int:
        return self.timestamp
    
    def get_payload(self) -> Optional[Bookmark]:
        return self.payload
    
    def to_dict(self) -> dict:
        return {
            'logId': self.log_id,
            'entityId': self.entity_id,
            'operation': self.operation.value,
            'timestamp': self.timestamp,
            'payload': self.payload.to_dict() if self.payload else None
        }
    
    @classmethod
    def from_dict(cls, data: dict, entity_class: type = Bookmark) -> 'BookmarkSyncLog':
        payload = None
        if data.get('payload'):
            payload = entity_class.from_dict(data['payload'])
        
        return cls(
            log_id=data['logId'],
            entity_id=data['entityId'],
            operation=Operation(data['operation']),
            timestamp=data['timestamp'],
            payload=payload
        )
    
    @staticmethod
    def create_log(entity_id: str, operation: Operation, payload: Optional[Bookmark]) -> 'BookmarkSyncLog':
        """工厂方法：创建新日志"""
        return BookmarkSyncLog(
            log_id=str(uuid.uuid4()),
            entity_id=entity_id,
            operation=operation,
            timestamp=int(time.time() * 1000),  # 毫秒时间戳
            payload=payload
        )
